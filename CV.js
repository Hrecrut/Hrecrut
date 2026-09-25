import { detectSkills } from './matching.js';

export async function extractText(buf, name) {
  const n = String(name).toLowerCase();
  if (n.endsWith('.pdf')) {
    const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default;
    return (await pdf(buf)).text;
  }
  if (n.endsWith('.docx')) {
    const mammoth = (await import('mammoth')).default;
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  throw new Error('Format non pris en charge : utilisez un fichier PDF ou Word (.docx).');
}

const cap = w => /^[\p{Lu}][\p{L}'’-]+$/u.test(w);
const upper = w => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w);

// Extraction par règles : le résultat pré-remplit le formulaire, l'utilisateur vérifie avant d'enregistrer.
export function parseCv(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const flat = text.replace(/\s+/g, ' ');
  const head = lines.slice(0, 12).join(' ');

  const email = (flat.match(/[\w.+-]+@[\w-]+\.[\w.]+/) || [])[0] || '';
  const phone = (flat.match(/(?:\+33|0033|0)\s?[1-9](?:[\s.-]?\d{2}){4}/) || [])[0] || '';

  let first = '', last = '';
  const bad = /curriculum|\bcv\b|technicien|maintenance|profil|exp[ée]rience|formation|@|\d/i;
  for (const l of lines.slice(0, 8)) {
    if (bad.test(l) || l.length > 40) continue;
    const w = l.split(/\s+/);
    if (w.length < 2 || w.length > 4 || !w.every(x => cap(x) || upper(x))) continue;
    if (upper(w[0]) && !upper(w[1])) { last = w[0]; first = w.slice(1).join(' '); }
    else if (upper(w[w.length - 1]) && !upper(w[0])) { last = w[w.length - 1]; first = w.slice(0, -1).join(' '); }
    else { first = w[0]; last = w.slice(1).join(' '); }
    break;
  }

  const title = lines.slice(0, 15).find(l => l.length < 80 &&
    /technicien|[ée]lectrom[ée]can|[ée]lectrotech|automaticien|agent de maintenance|responsable maintenance/i.test(l))
    || 'Technicien de maintenance industrielle';

  const loc = head.match(/\b(\d{5})\s+([A-ZÀ-Ý][\p{L}'’-]+(?:[ -][A-ZÀ-Ý][\p{L}'’-]+)*)/u)
    || flat.match(/\b(\d{5})\s+([A-ZÀ-Ý][\p{L}'’-]+(?:[ -][A-ZÀ-Ý][\p{L}'’-]+)*)/u);
  const location = loc ? loc[2] : '';
  const department = loc ? loc[1].slice(0, 2) : '';

  const exp = flat.match(/(\d{1,2})\s*ans?\s*(?:d['’]\s*)?exp[ée]rience/i) || flat.match(/exp[ée]rience[^.\d]{0,25}(\d{1,2})\s*ans?/i);
  const experience = exp ? `${exp[1]} ans d'expérience` : '';

  const extras = [...new Set((text.match(/\b(B[12]V?|BR|BC|H0V?|H0B0|CACES|SST|Siemens|Schneider|Allen[- ]Bradley|Omron|TIA Portal|Step ?7)\b/g) || []))];
  const skills = [...detectSkills(text), ...extras].join(', ');

  const formation = lines.filter(l => l.length < 120 &&
    /\b(BTS|DUT|BUT|Licence|Bac ?pro|CAP|BEP|Master|Ing[ée]nieur|Titre professionnel)\b/i.test(l)).slice(0, 2).map(l => l.replace(/^formations?\s*:\s*/i, '')).join(' / ');
  const notes = [email && `Email : ${email}`, phone && `Tél : ${phone}`, formation && `Formation : ${formation}`].filter(Boolean).join('\n');

  return { first_name: first, last_name: last, title, location, department, skills, experience, notes };
}
