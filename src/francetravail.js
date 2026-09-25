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

const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = (v, def) => (v || def).split(',').map(x => x.trim()).filter(Boolean);

// Une requête par département et par mot-clé (l'API accepte un seul département à la fois),
// avec pagination, puis dédoublonnage par identifiant d'offre.
export async function searchOffers() {
  const t = await token();
  const depts = list(process.env.FT_DEPARTMENTS, '75,77,78,91,92,93,94,95');
  const keywords = list(process.env.FT_KEYWORDS, 'technicien de maintenance,électromécanicien,électrotechnicien');
  const since = process.env.FT_PUBLISHED_SINCE || '7';
  const byId = new Map();

  for (const dep of depts) {
    for (const kw of keywords) {
      for (let start = 0; start < 450; start += 150) {
        const params = new URLSearchParams({
          motsCles: kw, departement: dep, publieeDepuis: since,
          range: `${start}-${start + 149}`, sort: '1'
        });
        const r = await fetch(`${API_URL}?${params}`, {
          headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' }
        });
        await sleep(150);
        if (r.status === 204) break; // aucun résultat
        const text = await r.text();
        if (!r.ok) throw new Error(`France Travail API ${r.status} pour ${dep} / ${kw}: ${text.slice(0, 500)}`);
        let data;
        try { data = JSON.parse(text); }
        catch { throw new Error(`France Travail réponse non JSON pour ${dep} / ${kw}: ${text.slice(0, 300)}`); }
        const res = data.resultats || [];
        for (const o of res) byId.set(o.id, o);
        if (res.length < 150) break;
      }
    }
  }
  return { resultats: [...byId.values()] };
}
}
