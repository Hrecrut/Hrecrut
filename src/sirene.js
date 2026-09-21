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

  const data = await r.json();

  return data.results?.[0] || null;
}

/**
 * Récupère le code de tranche d'effectif.
 *
 * L'API peut placer cette information dans :
 * - unite_legale
 * - siege
 * - la racine de l'objet
 */
export function employeeCode(r) {
  return (
    r?.unite_legale?.tranche_effectif_salarie ||
    r?.siege?.tranche_effectif_salarie ||
    r?.tranche_effectif_salarie ||
    null
  );
}

/**
 * Convertit les tranches SIRENE en borne haute.
 *
 * On utilise la borne haute afin de ne pas considérer
 * automatiquement une entreprise 20-49 comme une PME
 * ≤ 40 salariés.
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
 * Classe l'entreprise selon sa taille.
 */
export function employeeStatus(r) {
  const code = employeeCode(r);

  if (!code) {
    return 'unknown';
  }

  /**
   * Ces tranches garantissent une entreprise
   * de 19 salariés maximum.
   */
  if (
    ['00', '01', '02', '03', '11'].includes(code)
  ) {
    return 'eligible';
  }

  /**
   * Tranche 20-49.
   *
   * Nous ne pouvons pas confirmer que l'entreprise
   * possède 40 salariés ou moins.
   */
  if (code === '12') {
    return 'unknown_20_49';
  }

  /**
   * 50 salariés et plus.
   */
  if (
    ['21', '22', '31', '32', '41', '42', '51', '52', '53']
      .includes(code)
  ) {
    return 'too_large';
  }

  return 'unknown';
}

/**
 * Récupération des informations générales
 * disponibles dans la réponse SIRENE.
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
  const uniteLegale = r.unite_legale || {};

  return {
    siren:
      r.siren ||
      uniteLegale.siren ||
      null,

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
      uniteLegale.site_web ||
      null
  };
}
