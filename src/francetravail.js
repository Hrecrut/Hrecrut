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

  const responseText = await r.text();

  if (!r.ok) {
    throw new Error(
      `France Travail OAuth ${r.status}: ${responseText.slice(0, 1000)}`
    );
  }

  let d;

  try {
    d = JSON.parse(responseText);
  } catch {
    throw new Error(
      `France Travail OAuth: réponse non JSON: ${responseText.slice(0, 1000)}`
    );
  }

  if (!d.access_token) {
    throw new Error(
      `France Travail OAuth: aucun access_token reçu: ${responseText.slice(0, 1000)}`
    );
  }

  cached = {
    token: d.access_token,
    expires: Date.now() + ((d.expires_in || 3600) - 60) * 1000
  };

  return cached.token;
}

export async function searchOffers() {
  const t = await token();

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

    const url = `${API_URL}?${params.toString()}`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${t}`,
        Accept: 'application/json'
      }
    });

    const responseText = await r.text();

    if (!r.ok) {
      throw new Error(
        `France Travail API ${r.status} pour ${departments.join(',')}: ${responseText.slice(0, 1000)}`
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(
        `France Travail réponse non JSON pour ${departments.join(',')}: ${responseText.slice(0, 1000)}`
      );
    }

    allOffers.push(...(data.resultats || []));
  }

  return {
    resultats: allOffers
  };
}
