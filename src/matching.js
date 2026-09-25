// Matching offre <-> candidat — score sur 100 avec raisons lisibles (✅ / ⚠️)

function norm(s = '') {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const IDF = ['75', '77', '78', '91', '92', '93', '94', '95'];

// Familles de compétences : nom affiché -> expressions reconnues
const SKILLS = {
  'Électricité': [/electri/, /electrotechn/, /habilitation/, /\bb1v\b/, /\bbr\b/, /\bh0v?\b/, /armoire/, /schema/],
  'Mécanique': [/mecani/, /roulement/, /reducteur/, /\bpompe/, /usinage/, /soudure/],
  'Automatisme': [/automat/, /\bapi\b/, /\bplc\b/, /siemens/, /schneider/, /allen.?bradley/, /grafcet/, /supervision/],
  'Pneumatique': [/pneumati/],
  'Hydraulique': [/hydrauli/],
  'GMAO': [/\bgmao\b/, /\bmaximo\b/, /\bcoswin\b/],
  'Robotique': [/robot/],
  'Maintenance préventive/curative': [/maintenance/, /depannage/, /preventi/, /curati/]
};

export function detectSkills(text) {
  const t = norm(text);
  return Object.entries(SKILLS)
    .filter(([, patterns]) => patterns.some(re => re.test(t)))
    .map(([name]) => name);
}

function extractYears(text) {
  const t = norm(text);
  if (/debutant/.test(t)) return 0;
  const m = t.match(/(\d+)\s*(ans|an)\b/);
  if (m) return Number(m[1]);
  const m2 = t.match(/(\d+)\s*(mois)\b/);
  if (m2) return Math.round(Number(m2[1]) / 12);
  return null;
}

function contractKey(s) {
  const t = norm(s);
  if (!t) return '';
  if (t.includes('cdi')) return 'cdi';
  if (t.includes('cdd')) return 'cdd';
  if (t.includes('mis') || t.includes('interim') || t.includes('temporaire')) return 'interim';
  if (t.includes('altern') || t.includes('apprenti')) return 'alternance';
  return t;
}

// "Annuel de 32000 Euros à 38000 Euros sur 12 mois" -> {min:32000,max:38000} (annuel)
function parseSalary(text) {
  const t = norm(text).replace(/\s/g, '').replace(/,/g, '.');
  if (!t) return null;
  const nums = [...t.matchAll(/(\d+(?:\.\d+)?)(k)?/g)]
    .map(m => (m[2] ? Number(m[1]) * 1000 : Number(m[1])))
    .filter(n => n >= 1000);
  if (!nums.length) return null;
  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (/mensuel/.test(t) || (max < 8000)) { min *= 12; max *= 12; } // mensuel -> annuel
  return { min, max };
}

export function score(job, c) {
  const reasons = [];
  let total = 0;

  const jobText = `${job.title || ''} ${job.description || ''} ${job.skills || ''}`;
  const candText = `${c.title || ''} ${c.skills || ''} ${c.experience || ''} ${c.notes || ''}`;

  // 1) Compétences (40 pts)
  const jobSkills = detectSkills(jobText).filter(s => s !== 'Maintenance préventive/curative');
  const candSkills = detectSkills(candText);
  if (jobSkills.length) {
    const hit = jobSkills.filter(s => candSkills.includes(s));
    total += Math.round((hit.length / jobSkills.length) * 40);
    hit.forEach(s => reasons.push(`✅ ${s}`));
    const missing = jobSkills.filter(s => !candSkills.includes(s));
    if (missing.length) reasons.push(`⚠️ Compétence(s) non renseignée(s) : ${missing.join(', ')}`);
  } else if (candSkills.length) {
    total += 20;
    reasons.push('✅ Profil maintenance (compétences précises non détaillées dans l\'offre)');
  }

  // 2) Intitulé / métier (10 pts)
  const jt = norm(job.title);
  const ct = norm(c.title);
  const family = /maintenance|electromeca|electrotech|depannage|sav/;
  if (family.test(jt) && family.test(ct)) {
    total += 10;
    reasons.push('✅ Métier correspondant');
  }

  // 3) Localisation (15 pts)
  const jd = String(job.department || '').trim();
  const cd = String(c.department || '').trim();
  if (jd && cd && jd === cd) {
    total += 15;
    reasons.push(`✅ Même département (${jd})`);
  } else if (IDF.includes(jd) && IDF.includes(cd)) {
    total += 8;
    reasons.push('✅ Île-de-France (autre département)');
  } else if (jd && cd) {
    reasons.push('⚠️ Département différent');
  }

  // 4) Expérience (15 pts)
  const candYears = extractYears(c.experience);
  const jobYears = extractYears(job.experience);
  if (candYears !== null && jobYears !== null) {
    if (candYears >= jobYears) {
      total += 15;
      reasons.push(`✅ ${candYears} an(s) d'expérience (demandé : ${jobYears})`);
    } else if (candYears >= jobYears - 1) {
      total += 8;
      reasons.push(`⚠️ Expérience un peu juste (${candYears} an(s) pour ${jobYears} demandé(s))`);
    } else {
      reasons.push(`⚠️ Expérience insuffisante (${candYears} an(s) pour ${jobYears} demandé(s))`);
    }
  } else if (candYears !== null) {
    total += 10;
    reasons.push(`✅ ${candYears} an(s) d'expérience`);
  } else {
    total += 5;
  }

  // 5) Contrat (10 pts)
  const jc = contractKey(job.contract_type);
  const cc = contractKey(c.contract_type);
  if (jc && cc && jc === cc) {
    total += 10;
    reasons.push(`✅ Recherche ${String(c.contract_type).toUpperCase()}`);
  } else if (!cc) {
    total += 5;
  } else if (jc && cc) {
    reasons.push('⚠️ Type de contrat différent');
  }

  // 6) Salaire (5 pts)
  const js = parseSalary(job.salary_text);
  const cMin = Number(c.salary_min) || null;
  if (js && cMin) {
    if (cMin <= js.max) {
      total += 5;
      reasons.push('✅ Salaire compatible');
    } else {
      reasons.push('⚠️ Salaire souhaité supérieur à l\'offre');
    }
  }

  // 7) Disponibilité / recherche active (5 pts)
  if (c.active_search) {
    total += 5;
    reasons.push('✅ Recherche active');
  } else if (c.availability) {
    total += 2;
  }

  return { score: Math.max(0, Math.min(100, total)), reasons };
}
