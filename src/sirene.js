const BASE =
  process.env.SIRENE_URL ||
  'https://recherche-entreprises.api.gouv.fr/search';

/**
 * Recherche une entreprise dans l'API Recherche Entreprises.
 */
export async function enrichCompany(name, postcode) {
  const params = new URLSearchParams({
    q: name,
    per_page: '5'
  });

  if (postcode) {
    params.set('code_postal', postcode);
  }

  const r = await fetch(`${BASE}?${params.toString()}`);

  if (!r.ok) {
    throw new Error(`SIRENE ${r.status}`);
  }

  const d = await r.json();

  return d.results?.[0] || null;
}

/**
 * Retourne le code de tranche d'effectif SIRENE.
 */
export function employeeCode(r) {
  return (
    r?.siege?.tranche_effectif_salarie ||
    r?.tranche_effectif_salarie ||
    null
  );
}

/**
 * Convertit les tranches SIRENE en borne haute.
 *
 * On utilise volontairement la borne haute :
 * cela permet de ne pas considérer comme "≤40 salariés"
 * une entreprise dont la tranche est 20-49 salariés.
 */
export function employeeCount(r) {
  const code = employeeCode(r);

  const map = {
    '00': 0,
    '01': 2,
    '02': 5,
    '03': 9,
    '11': 19,
    '12': 49,
    '21': 99,
    '22': 199,
    '31': 249,
    '32': 499,
    '41': 999,
    '42': 1999,
    '51': 4999,
    '52': 9999,
    '53': 10000
  };

  return map[code] ?? null;
}

/**
 * Détermine si la taille de l'entreprise est compatible
 * avec notre cible commerciale PME ≤ 40 salariés.
 *
 * eligible :
 *   tranche dont la borne haute est ≤40
 *
 * too_large :
 *   entreprise dont la tranche commence au-dessus de 40
 *   ou dont la borne haute dépasse clairement 40
 *
 * unknown :
 *   information absente ou impossible à déterminer précisément.
 */
export function employeeStatus(r) {
  const code = employeeCode(r);

  if (!code) {
    return 'unknown';
  }

  // Tranches garanties ≤ 40 salariés
  if (['00', '01', '02', '03', '11'].includes(code)) {
    return 'eligible';
  }

  // 20-49 : impossible de garantir ≤40
  if (code === '12') {
    return 'unknown_20_49';
  }

  // 50 salariés et plus
  if (['21', '22', '31', '32', '41', '42', '51', '52', '53'].includes(code)) {
    return 'too_large';
  }

  return 'unknown';
}

/**
 * Récupère quelques informations utiles lorsque l'API
 * les fournit.
 */
export function companyInfo(r) {
  if (!r) {
    return {
      siren: null,
      siret: null,
      address: null,
      website: null
    };
  }

  const siege = r.siege || {};

  return {
    siren: r.siren || r.unite_legale?.siren || null,

    siret:
      siege.siret ||
      r.siret ||
      null,

    address:
      siege.adresse ||
      null,

    website:
      siege.site_web ||
      r.site_web ||
      r.unite_legale?.site_web ||
      null
  };
}
