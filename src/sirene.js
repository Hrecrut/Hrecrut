const BASE =
  process.env.SIRENE_URL ||
  'https://recherche-entreprises.api.gouv.fr/search';

export async function enrichCompany(name, postcode) {
  const params = new URLSearchParams({
    q: name,
    per_page: '5'
  });

  if (postcode) {
    params.set('code_postal', postcode);
  }

  const url = `${BASE}?${params.toString()}`;

  const r = await fetch(url);

  if (!r.ok) {
    throw new Error(`SIRENE ${r.status}`);
  }

  const data = await r.json();

  const result = data.results?.[0] || null;

  // Diagnostic temporaire dans les logs Render
  console.log(
    '[SIRENE]',
    JSON.stringify({
      name,
      postcode,
      results: data.results?.length || 0,
      hasResult: !!result,
      keys: result ? Object.keys(result) : [],
      unite_legale_keys: result?.unite_legale
        ? Object.keys(result.unite_legale)
        : [],
      siege_keys: result?.siege
        ? Object.keys(result.siege)
        : [],
      tranche_root: result?.tranche_effectif_salarie,
      tranche_unite_legale:
        result?.unite_legale?.tranche_effectif_salarie,
      tranche_siege:
        result?.siege?.tranche_effectif_salarie
    })
  );

  return result;
}

export function employeeCode(r) {
  return (
    r?.unite_legale?.tranche_effectif_salarie ||
    r?.siege?.tranche_effectif_salarie ||
    r?.tranche_effectif_salarie ||
    null
  );
}

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

export function employeeStatus(r) {
  const code = employeeCode(r);

  if (!code) {
    return 'unknown';
  }

  if (
    ['00', '01', '02', '03', '11'].includes(code)
  ) {
    return 'eligible';
  }

  if (code === '12') {
    return 'unknown_20_49';
  }

  if (
    ['21', '22', '31', '32', '41', '42', '51', '52', '53']
      .includes(code)
  ) {
    return 'too_large';
  }

  return 'unknown';
}

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
