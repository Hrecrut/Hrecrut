const TOKEN_URL = process.env.FT_TOKEN_URL;
const API_URL = process.env.FT_API_URL;

let cached = { token: null, expires: 0 };

export function configured() {
  return !!(
    process.env.FT_CLIENT_ID &&
    process.env.FT_CLIENT_SECRET
  );
}

async function token() {
  if (cached.token && Date.now() < cached.expires) {
    return cached.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.FT_CLIENT_ID,
    client_secret: process.env.FT_CLIENT_SECRET,
    scope: process.env.FT_SCOPE || 'api_offresdemploiv2 o2dsoffre'
  });

  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!r.ok) {
    throw new Error(
      `France Travail OAuth ${r.status}: ${await r.text()}`
    );
  }

  const d = await r.json();

  cached = {
    token: d.access_token,
    expires: Date.now() + (d.expires_in - 60) * 1000
  };

  return cached.token;
}

export async function searchOffers() {
  const t = await token();

  // France Travail autorise au maximum 5 départements par recherche.
  const departmentGroups = [
    ['75', '77', '78', '91', '92'],
    ['93', '94', '95']
  ];

  const allOffers = [];

  for (const departments of departmentGroups) {
    const params = new URLSearchParams();

    params.set(
      'motsCles',
      'technicien maintenance industrielle OR électrotechnicien OR électromécanicien OR technicien SAV'
    );

    params.set('departement', departments.join(','));
    params.set('publieeDepuis', '1');
    params.set('range', '0-149');
    params.set('sort', '1');

    const r = await fetch(`${API_URL}?${params}`, {
      headers: {
        Authorization: `Bearer ${t}`
      }
    });

    if (!r.ok) {
      throw new Error(
        `France Travail API ${r.status}: ${await r.text()}`
      );
    }

    const data = await r.json();

    allOffers.push(...(data.resultats || []));
  }

  return {
    resultats: allOffers
  };
}
