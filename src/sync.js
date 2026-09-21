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
 * Entreprises que nous ne voulons pas appeler commercialement.
 *
 * IMPORTANT :
 * leurs offres restent dans Hrecrut.
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

  // Principaux acteurs rencontrés dans les offres
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

/**
 * Détermine si une entreprise est probablement
 * un intermédiaire de recrutement/intérim.
 */
function isIntermediary(name = '') {
  return INTERMEDIARY_PATTERNS.some((pattern) =>
    pattern.test(name)
  );
}

/**
 * Détermine le département à partir du code postal.
 */
function deptFromPostcode(postcode = '') {
  const p = String(postcode).trim();

  if (p.startsWith('20')) {
    return '2A';
  }

  return p.slice(0, 2);
}

/**
 * Vérifie qu'une offre correspond à notre niche.
 */
function isRelevant(offer) {
  const title = offer.intitule || '';
  const description = offer.description || '';

  const text = `${title} ${description}`.toLowerCase();

  const positive =
    /(maintenance industrielle|technicien de maintenance|electrotechnicien|électrotechnicien|electromecanicien|électromécanicien|technicien sav)/i;

  const negative =
    /(informatique|it support|automobile|bâtiment uniquement|batiment uniquement)/i;

  return positive.test(text) && !negative.test(text);
}

/**
 * Recherche une entreprise existante.
 *
 * On essaie d'abord avec le SIRET.
 * Si le SIRET n'existe pas, on utilise le nom.
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
    WHERE LOWER(name) = LOWER($1)
    LIMIT 1
    `,
    [name]
  );

  return result.rows[0] || null;
}

/**
 * Crée ou met à jour une entreprise.
 */
async function upsertCompany(offer) {
  const ent = offer.entreprise || {};

  const name =
    ent.nom ||
    'Entreprise non renseignée';

  const postcode =
    offer.lieuTravail?.codePostal || '';

  const dept =
    deptFromPostcode(postcode);

  const siret =
    ent.siret || null;

  let sirene = null;

  try {
    sirene = await enrichCompany(
      name,
      postcode
    );
  } catch (error) {
    // L'enrichissement SIRENE ne doit jamais
    // empêcher la synchronisation des offres.
    sirene = null;
  }

  const info = companyInfo(sirene);

  const count =
    employeeCount(sirene);

  const sizeStatus =
    employeeStatus(sirene);

  const intermediary =
    isIntermediary(name);

  /**
   * Score commercial.
   *
   * 100 = très intéressant commercialement
   * 0   = à ne pas prospecter
   */
  let commercialScore = 0;

  if (intermediary) {
    commercialScore = 0;
  } else if (sizeStatus === 'eligible') {
    commercialScore = 80;

    // Très petite PME : priorité supérieure
    if (count !== null && count <= 9) {
      commercialScore += 15;
    } else if (count !== null && count <= 19) {
      commercialScore += 10;
    }

    // Une offre active est un signal commercial fort
    commercialScore += 5;

    commercialScore =
      Math.min(100, commercialScore);
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
        source,
        raw
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        CASE WHEN $9 IS NOT NULL THEN now() ELSE NULL END,
        $11,'France Travail',$12
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
        dept,
        info.website || ent.url || null,
        count,
        count !== null
          ? 'SIRENE'
          : null,
        commercialScore,
        JSON.stringify(ent)
      ]
    );

    company = result.rows[0];
  } else {
    /**
     * Mise à jour des données existantes.
     *
     * Cela permet d'enrichir progressivement
     * les entreprises déjà enregistrées.
     */
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
        employee_count = COALESCE($9, employee_count),
        employee_source =
          CASE
            WHEN $9 IS NOT NULL THEN 'SIRENE'
            ELSE employee_source
          END,
        employee_verified_at =
          CASE
            WHEN $9 IS NOT NULL THEN now()
            ELSE employee_verified_at
          END,
        commercial_score = $10,
        raw = $11,
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
        dept,
        info.website || ent.url || null,
        count,
        commercialScore,
        JSON.stringify(ent)
      ]
    );

    company =
      result.rows[0] || company;
  }

  return {
    company,
    intermediary,
    sizeStatus,
    employeeCount: count
  };
}

/**
 * Synchronisation principale France Travail.
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

  try {
    if (!configured()) {
      throw new Error(
        'France Travail non configuré: renseignez FT_CLIENT_ID et FT_CLIENT_SECRET dans .env'
      );
    }

    const data =
      await searchOffers();

    for (const offer of data.resultats || []) {
      const postcode =
        offer.lieuTravail?.codePostal || '';

      const dept =
        deptFromPostcode(postcode);

      /**
       * Premier filtre : région ciblée.
       */
      if (!DEPTS.has(dept)) {
        stats.rejected++;
        continue;
      }

      /**
       * Deuxième filtre : métier.
       */
      if (!isRelevant(offer)) {
        stats.rejected++;
        continue;
      }

      const {
        company,
        intermediary,
        sizeStatus
      } = await upsertCompany(offer);

      /**
       * Statistiques commerciales.
       */
      if (company.created_at) {
        // Ne pas incrémenter systématiquement :
        // cette information est seulement indicative.
      }

      if (intermediary) {
        stats.intermediaryOffers++;
      }

      if (sizeStatus === 'too_large') {
        stats.largeCompanyOffers++;
      }

      if (
        sizeStatus === 'unknown' ||
        sizeStatus === 'unknown_20_49'
      ) {
        stats.unknownCompanyOffers++;
      }

      if (
        !intermediary &&
        sizeStatus === 'eligible'
      ) {
        stats.eligibleCompanies++;
      }

      /**
       * IMPORTANT :
       * même si l'entreprise n'est pas une PME cible,
       * on conserve son offre.
       *
       * Elle reste donc visible dans "Offres".
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
          description = EXCLUDED.description,
          company_id = EXCLUDED.company_id,
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
          dept,
          offer.typeContrat || '',
          offer.dureeTravailLibelle || '',
          offer.salaire?.libelle || '',
          offer.horaireTravail || '',
          offer.experienceLibelle || '',
          offer.competences
            ?.map((x) => x.libelle)
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
     * Matching candidats ↔ offres.
     *
     * On ne limite pas ici aux PME :
     * le matching pourra être utilisé plus largement.
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

        if (
          result.score >=
          Number(
            process.env.MATCH_ALERT_THRESHOLD || 85
          )
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
            RETURNING id
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
           * On crée l'alerte uniquement si
           * le match est suffisamment élevé.
           */
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
