import { q } from './db.js';

import {
  configured,
  searchOffers
} from './francetravail.js';

import {
  enrichCompany,
  employeeCount,
  employeeStatus,
  companyInfo
} from './sirene.js';

import { score } from './matching.js';

const DEPTS = new Set([
  '75',
  '77',
  '78',
  '91',
  '92',
  '93',
  '94',
  '95'
]);

/**
 * Détection prudente des intermédiaires.
 *
 * Les offres restent dans Hrecrut.
 * L'entreprise ne sera simplement pas proposée
 * comme prospect PME prioritaire.
 */
const INTERMEDIARY_PATTERNS = [
  /\bint[ée]rim\b/i,
  /\binterim\b/i,
  /\brecrutement\b/i,
  /\brecruteur\b/i,
  /\bcabinet de recrutement\b/i,
  /\bagence d'emploi\b/i,
  /\bagence de travail temporaire\b/i,
  /\bressources humaines\b/i,
  /\brh\b/i,

  /\brandstad\b/i,
  /\badecco\b/i,
  /\bmanpower\b/i,
  /\bsynergie\b/i,
  /\bcrit\b/i,
  /\bpartnaire\b/i,
  /\bsupplay\b/i,
  /\bproman\b/i,
  /\bstart people\b/i,
  /\bactual\b/i,
  /\btemporis\b/i,
  /\baquila rh\b/i,
  /\bnextep\b/i,
  /\bpage personnel\b/i,
  /\bhays\b/i,
  /\bexpectra\b/i,
  /\binteraction\b/i,
  /\bkelly\b/i
];

function isIntermediary(name = '') {
  return INTERMEDIARY_PATTERNS.some(pattern =>
    pattern.test(name)
  );
}

function deptFromPostcode(postcode = '') {
  const p = String(postcode).trim();

  if (p.startsWith('20')) {
    return '2A';
  }

  return p.slice(0, 2);
}

function isRelevant(offer) {
  const text = (
    `${offer.intitule || ''} ${offer.description || ''}`
  ).toLowerCase();

  const positive =
    /(maintenance industrielle|technicien de maintenance|electrotechnicien|électrotechnicien|electromecanicien|électromécanicien|technicien sav)/i;

  const negative =
    /(informatique|it support|automobile|bâtiment uniquement|batiment uniquement)/i;

  return (
    positive.test(text) &&
    !negative.test(text)
  );
}

/**
 * Recherche une entreprise existante.
 */
async function findCompany(siret, name) {
  if (siret) {
    const result = await q(
      `
      SELECT *
      FROM companies
      WHERE siret = $1
      LIMIT 1
      `,
      [siret]
    );

    if (result.rows[0]) {
      return result.rows[0];
    }
  }

  const result = await q(
    `
    SELECT *
    FROM companies
    WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
    LIMIT 1
    `,
    [name]
  );

  return result.rows[0] || null;
}

/**
 * Crée ou actualise une entreprise.
 */
async function upsertCompany(offer) {
  const ent = offer.entreprise || {};

  const name =
    ent.nom ||
    'Entreprise non renseignée';

  const postcode =
    offer.lieuTravail?.codePostal || '';

  const department =
    deptFromPostcode(postcode);

  const siret =
    ent.siret || null;

  let sirene = null;

  try {
    sirene = await enrichCompany(
      name,
      postcode
    );
  } catch {
    sirene = null;
  }

  const info =
    companyInfo(sirene);

  const count =
    employeeCount(sirene);

  const sizeStatus =
    employeeStatus(sirene);

  const intermediary =
    isIntermediary(name);

  let companyType = 'unknown';
  let commercialScore = 0;

  if (intermediary) {
    companyType = 'intermediary';
    commercialScore = 0;
  } else if (sizeStatus === 'eligible') {
    companyType = 'pme';

    commercialScore = 80;

    if (count !== null && count <= 9) {
      commercialScore += 15;
    } else if (count !== null && count <= 19) {
      commercialScore += 10;
    }

    commercialScore += 5;

    commercialScore =
      Math.min(100, commercialScore);

  } else if (
    sizeStatus === 'too_large'
  ) {
    companyType = 'large_company';
    commercialScore = 0;

  } else {
    companyType = 'unknown';
    commercialScore = 0;
  }

  let company =
    await findCompany(siret, name);

  if (!company) {

const result = await q(
  `
  INSERT INTO companies (
    name,
    siret,
    siren,
    address,
    postcode,
    city,
    department,
    website,
    employee_count,
    employee_source,
    employee_verified_at,
    commercial_score,
    company_type,
    size_status,
    is_intermediary,
    source,
    raw
  )
  VALUES (
    $1,
    $2,
    $3,
    $4,
    $5,
    $6,
    $7,
    $8,
    $9,
    $10,
    CASE
      WHEN $9 IS NOT NULL THEN now()
      ELSE NULL
    END,
    $11,
    $12,
    $13,
    $14,
    'France Travail',
    $15
  )
  RETURNING *
  `,
  [
    name,
    siret || info.siret,
    info.siren,
    info.address,
    postcode,
    offer.lieuTravail?.commune || null,
    department,
    info.website || ent.url || null,
    count,
    count !== null ? 'SIRENE' : null,
    commercialScore,
    companyType,
    sizeStatus,
    intermediary,
    JSON.stringify(ent)
  ]
);

company = result.rows[0];

  } else {

    const result = await q(
      `
      UPDATE companies
      SET
        siret = COALESCE($2, siret),
        siren = COALESCE($3, siren),
        address = COALESCE($4, address),
        postcode = COALESCE($5, postcode),
        city = COALESCE($6, city),
        department = COALESCE($7, department),
        website = COALESCE($8, website),

        employee_count =
          COALESCE($9, employee_count),

        employee_source =
          CASE
            WHEN $9 IS NOT NULL
            THEN 'SIRENE'
            ELSE employee_source
          END,

        employee_verified_at =
          CASE
            WHEN $9 IS NOT NULL
            THEN now()
            ELSE employee_verified_at
          END,

        commercial_score = $10,
        company_type = $11,
        size_status = $12,
        is_intermediary = $13,

        raw = $14,
        updated_at = now()

      WHERE id = $1

      RETURNING *
      `,
      [
        company.id,
        siret || info.siret,
        info.siren,
        info.address,
        postcode,
        offer.lieuTravail?.commune || null,
        department,
        info.website || ent.url || null,
        count,
        commercialScore,
        companyType,
        sizeStatus,
        intermediary,
        JSON.stringify(ent)
      ]
    );

    company =
      result.rows[0] || company;
  }

  return {
    company,
    intermediary,
    companyType,
    sizeStatus,
    employeeCount: count
  };
}

/**
 * Synchronisation France Travail.
 */
export async function syncFranceTravail() {

  const runResult = await q(
    `
    INSERT INTO sync_runs (
      source,
      status
    )
    VALUES (
      'France Travail',
      'running'
    )
    RETURNING id
    `
  );

  const run =
    runResult.rows[0].id;

  const stats = {
    offers: 0,
    companies: 0,
    rejected: 0,

    intermediaryOffers: 0,
    largeCompanyOffers: 0,
    unknownCompanyOffers: 0,

    eligibleCompanies: 0,

    matches: 0
  };

  /**
   * Entreprises déjà comptées pendant
   * cette synchronisation.
   */
  const countedCompanies = new Set();

  try {

    if (!configured()) {
      throw new Error(
        'France Travail non configuré: renseignez FT_CLIENT_ID et FT_CLIENT_SECRET dans .env'
      );
    }

    const data =
      await searchOffers();

    for (
      const offer of data.resultats || []
    ) {

      const postcode =
        offer.lieuTravail?.codePostal || '';

      const department =
        deptFromPostcode(postcode);

      /**
       * Filtre géographique.
       */
      if (!DEPTS.has(department)) {
        stats.rejected++;
        continue;
      }

      /**
       * Filtre métier.
       */
      if (!isRelevant(offer)) {
        stats.rejected++;
        continue;
      }

      const result =
        await upsertCompany(offer);

      const company =
        result.company;

      /**
       * Statistiques.
       */
      if (!countedCompanies.has(company.id)) {

        countedCompanies.add(company.id);

        stats.companies++;

        if (
          result.companyType === 'pme'
        ) {
          stats.eligibleCompanies++;
        }
      }

      if (
        result.intermediary
      ) {
        stats.intermediaryOffers++;
      }

      if (
        result.sizeStatus === 'too_large'
      ) {
        stats.largeCompanyOffers++;
      }

      if (
        result.sizeStatus === 'unknown' ||
        result.sizeStatus === 'unknown_20_49'
      ) {
        stats.unknownCompanyOffers++;
      }

      /**
       * L'offre est conservée même si
       * l'entreprise n'est pas une PME cible.
       */
      await q(
        `
        INSERT INTO jobs (
          source,
          source_id,
          title,
          company_id,
          description,
          location,
          postcode,
          department,
          contract_type,
          contract_duration,
          salary_text,
          schedule,
          experience,
          skills,
          url,
          published_at,
          updated_source_at,
          raw
        )
        VALUES (
          'France Travail',
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,$15,$16,$17
        )

        ON CONFLICT (
          source,
          source_id
        )

        DO UPDATE SET

          title = EXCLUDED.title,
          company_id = EXCLUDED.company_id,
          description = EXCLUDED.description,
          location = EXCLUDED.location,
          postcode = EXCLUDED.postcode,
          department = EXCLUDED.department,
          contract_type = EXCLUDED.contract_type,
          contract_duration = EXCLUDED.contract_duration,
          salary_text = EXCLUDED.salary_text,
          schedule = EXCLUDED.schedule,
          experience = EXCLUDED.experience,
          skills = EXCLUDED.skills,
          url = EXCLUDED.url,
          published_at = EXCLUDED.published_at,
          updated_source_at = EXCLUDED.updated_source_at,
          raw = EXCLUDED.raw,
          status = 'active',
          updated_at = now()
        `,
        [
          offer.id,
          offer.intitule,
          company.id,
          offer.description || '',
          offer.lieuTravail?.libelle || '',
          postcode,
          department,
          offer.typeContrat || '',
          offer.dureeTravailLibelle || '',
          offer.salaire?.libelle || '',
          offer.horaireTravail || '',
          offer.experienceLibelle || '',
          offer.competences
            ?.map(x => x.libelle)
            .join(', ') || '',
          offer.origineOffre?.urlOrigine ||
            offer.contact?.urlPostulation ||
            '',
          offer.dateCreation || null,
          offer.dateActualisation || null,
          JSON.stringify(offer)
        ]
      );

      stats.offers++;
    }

    /**
     * MATCHING
     *
     * On conserve tous les jobs actifs.
     * Les candidats seront intégrés ensuite.
     */
    const jobsResult = await q(
      `
      SELECT
        j.*,
        c.employee_count
      FROM jobs j
      LEFT JOIN companies c
        ON c.id = j.company_id
      WHERE j.status = 'active'
      LIMIT 300
      `
    );

    const jobs =
      jobsResult.rows;

    const candidatesResult = await q(
      `
      SELECT *
      FROM candidates
      WHERE active_search = true
      LIMIT 300
      `
    );

    const candidates =
      candidatesResult.rows;

    for (const job of jobs) {

      for (const candidate of candidates) {

        const result =
          score(job, candidate);

        const threshold =
          Number(
            process.env.MATCH_ALERT_THRESHOLD || 85
          );

        if (
          result.score >= threshold
        ) {

          await q(
            `
            INSERT INTO matches (
              job_id,
              candidate_id,
              score,
              reasons
            )
            VALUES ($1,$2,$3,$4)

            ON CONFLICT (
              job_id,
              candidate_id
            )

            DO UPDATE SET
              score = EXCLUDED.score,
              reasons = EXCLUDED.reasons
            `,
            [
              job.id,
              candidate.id,
              result.score,
              JSON.stringify(
                result.reasons
              )
            ]
          );

          /**
           * Evite de créer une nouvelle alerte
           * identique à chaque synchronisation.
           */
          const existingAlert =
            await q(
              `
              SELECT id
              FROM alerts
              WHERE type = 'match'
                AND job_id = $1
                AND candidate_id = $2
                AND score = $3
              LIMIT 1
              `,
              [
                job.id,
                candidate.id,
                result.score
              ]
            );

          if (
            existingAlert.rows.length === 0
          ) {

            await q(
              `
              INSERT INTO alerts (
                type,
                job_id,
                candidate_id,
                score,
                message
              )
              VALUES (
                'match',
                $1,
                $2,
                $3,
                $4
              )
              `,
              [
                job.id,
                candidate.id,
                result.score,
                `Match ${result.score}%: ${job.title}`
              ]
            );
          }

          stats.matches++;
        }
      }
    }

    await q(
      `
      UPDATE sync_runs
      SET
        finished_at = now(),
        status = 'success',
        stats = $1
      WHERE id = $2
      `,
      [
        JSON.stringify(stats),
        run
      ]
    );

    return stats;

  } catch (error) {

    await q(
      `
      UPDATE sync_runs
      SET
        finished_at = now(),
        status = 'error',
        error = $1
      WHERE id = $2
      `,
      [
        error.message,
        run
      ]
    );

    throw error;
  }
}
