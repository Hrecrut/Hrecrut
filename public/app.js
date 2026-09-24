const $=s=>document.querySelector(s); const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function api(u,o){const r=await fetch(u,o); const d=await r.json(); if(!r.ok)throw Error(d.error||'Erreur'); return d;}
async function loadStats(){const d=await api('/api/dashboard');$('#stats').innerHTML=[['Offres actives',d.jobs,'France Travail'],['PME ≤40 salariés',d.companies,'Effectif inconnu inclus'],['Candidats actifs',d.candidates,'En recherche active'],['Matchs ≥85%',d.matches,'Voir Matching'],['Alertes non lues',d.alerts,'Voir Alertes']].map(x=>`<article><small>${x[0]}</small><strong>${x[1]}</strong><em>${x[2]}</em></article>`).join('');const b=document.querySelector('[data-tab=alerts]');if(b){b.querySelector('.badge-n')?.remove();if(Number(d.alerts)>0)b.insertAdjacentHTML('beforeend',`<span class="badge-n">${d.alerts}</span>`);}}
async function tabInner(t){if(t==='dashboard'){await renderDashboard();return;}let data,html=''; if(t==='jobs'){data=await api('/api/jobs');html='<h2>Offres PME ≤40 salariés</h2>'+data.map(x=>`<article class="row"><div><b>${esc(x.title)}</b><br>${esc(x.company)} • ${esc(x.employee_count??'effectif à vérifier')} salariés • ${esc(x.location)}</div><div>${esc(x.contract_type)}<br>${esc(x.salary_text)}<br><a href="${esc(x.url)}" target="_blank">Voir l’offre</a></div></article>`).join('')||'<p>Aucune offre. Lance une synchronisation.</p>';} if(t==='companies'){data=await api('/api/companies');html='<h2>PME à appeler en priorité</h2>'+data.map(x=>`<article class="row"><div><b>${esc(x.name)}</b><br>${esc(x.city)} ${esc(x.postcode)} • ${esc(x.employee_count??'?')} salariés</div><div>Score ${x.commercial_score}<br>${x.phone?`<a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>`:'Téléphone à enrichir'}<br>${esc(x.email||'Email à enrichir')}</div></article>`).join('');} if(t==='candidates'){
  data=await api('/api/candidates');

  html=`
    <div class="section-head">
      <div>
        <h2>Candidats</h2>
        <p>Ajoute et gère tes candidats manuellement.</p>
      </div>
      <button id="newCandidate">+ Ajouter un candidat</button>
    </div>

    <div id="candidateForm"></div>

    <div class="candidate-list">
      ${
        data.map(x=>`
          <article class="row candidate-card">
            <div>
              <b>${esc(x.first_name)} ${esc(x.last_name)}</b>
              <br>
              ${esc(x.title)}
              <br>
              <small>
                ${esc(x.location || '')}
                ${x.department ? ' • ' + esc(x.department) : ''}
              </small>
            </div>

            <div>
              <span class="badge">
                ${x.active_search ? 'RECHERCHE ACTIVE' : 'Non actif'}
              </span>
              <br>
              <small>
                ${esc(x.experience || 'Expérience non renseignée')}
              </small>
            </div>

            <div>
              <button class="editCandidate" data-id="${x.id}">
                Modifier
              </button>

              <button class="deleteCandidate" data-id="${x.id}">
                Supprimer
              </button>
            </div>
          </article>
        `).join('')
        || '<p>Aucun candidat enregistré.</p>'
      }
    </div>
  `;

  $('#content').innerHTML=html;

  $('#newCandidate').onclick=()=>{
    showCandidateForm();
  };

  document.querySelectorAll('.editCandidate').forEach(btn=>{
    btn.onclick=()=>{
      const candidate=data.find(x=>String(x.id)===String(btn.dataset.id));
      if(candidate) showCandidateForm(candidate);
    };
  });

  document.querySelectorAll('.deleteCandidate').forEach(btn=>{
    btn.onclick=async()=>{
      const candidate=data.find(x=>String(x.id)===String(btn.dataset.id));

      if(!candidate) return;

      const name=
        `${candidate.first_name||''} ${candidate.last_name||''}`.trim();

      if(!confirm(`Supprimer le candidat ${name} ?`)) return;

      await api(`/api/candidates/${candidate.id}`,{
        method:'DELETE'
      });

      await loadStats();
      await tab('candidates');
    };
  });

  return;
} if(t==='matches'){data=await api('/api/matches');html='<h2>Matches</h2>'+data.map(x=>`<article class="row"><div><b>${x.score}%</b> — ${esc(x.title)}<br>${esc(x.company)} ↔ ${esc(x.first_name)} ${esc(x.last_name)}</div><div>${esc((x.reasons||[]).join(' • '))}</div></article>`).join('');} if(t==='alerts'){data=await api('/api/alerts');html='<h2>Alertes</h2>'+data.map(x=>`<article class="row"><div><b>${esc(x.score)}%</b> — ${esc(x.message)}</div><div>${esc(x.company||'')} / ${esc(x.first_name||'')}</div></article>`).join('');}
if(t==='settings'){const s=await api('/api/settings/sync');html=`<h2>Paramètres</h2><article class="settings-card"><h3>Actualisation automatique</h3><p>Hrecrut peut vérifier les nouvelles données automatiquement selon la fréquence choisie.</p><label>Fréquence<select id="syncInterval"><option value=15>Toutes les 15 minutes</option><option value=30>Toutes les 30 minutes</option><option value=60>Toutes les heures</option><option value=120>Toutes les 2 heures</option><option value=360>Toutes les 6 heures</option><option value=720>Toutes les 12 heures</option><option value=1440>Une fois par jour</option></select></label><button id="saveSync">Enregistrer</button><p id="syncSaved"></p></article>`;$('#content').innerHTML=html;$('#syncInterval').value=String(s.interval_minutes);$('#saveSync').onclick=async()=>{const r=await api('/api/settings/sync',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({interval_minutes:Number($('#syncInterval').value)})});$('#syncSaved').textContent='Fréquence enregistrée : '+labelInterval(r.interval_minutes);};return;} $('#content').innerHTML=html;}
async function boot(){try{const h=await api('/api/health');$('#status').textContent=h.connected?'● Base connectée':'○ Base indisponible';await loadStats();await tab('dashboard')}catch(e){$('#status').textContent=e.message}}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));$('#sync').onclick=async()=>{ $('#sync').disabled=true; $('#sync').textContent='Synchronisation…'; try{const d=await api('/api/sync',{method:'POST'});alert('Synchronisation terminée : '+JSON.stringify(d.stats));await boot()}catch(e){alert(e.message)}finally{$('#sync').disabled=false;$('#sync').textContent='Synchroniser'}}; boot();

function labelInterval(m){return ({15:'toutes les 15 minutes',30:'toutes les 30 minutes',60:'toutes les heures',120:'toutes les 2 heures',360:'toutes les 6 heures',720:'toutes les 12 heures',1440:'une fois par jour'})[m]||m+' minutes';}
function showCandidateForm(candidate=null){

  const c = candidate || {};

  const container = document.querySelector('#candidateForm');

  if (!container) {
    alert('Erreur : zone du formulaire candidat introuvable.');
    return;
  }

  container.innerHTML = `
    <article class="settings-card">

      <h3>${candidate ? 'Modifier le candidat' : 'Nouveau candidat'}</h3>

      <div class="candidate-form">

        <label>
          Prénom
          <input id="cFirstName" value="${esc(c.first_name || '')}">
        </label>

        <label>
          Nom
          <input id="cLastName" value="${esc(c.last_name || '')}">
        </label>

        <label>
          Métier
          <input id="cTitle"
            value="${esc(c.title || 'Technicien de maintenance industrielle')}">
        </label>

        <label>
          Ville / localisation
          <input id="cLocation" value="${esc(c.location || '')}">
        </label>

        <label>
          Département
          <input id="cDepartment" value="${esc(c.department || '')}">
        </label>

        <label>
          Compétences
          <textarea id="cSkills"
            placeholder="Ex : maintenance industrielle, électrotechnique, automatisme..."
          >${esc(c.skills || '')}</textarea>
        </label>

        <label>
          Expérience
          <input id="cExperience"
            placeholder="Ex : 5 ans en maintenance industrielle"
            value="${esc(c.experience || '')}">
        </label>

        <label>
          Salaire minimum
          <input id="cSalaryMin"
            type="number"
            value="${esc(c.salary_min || '')}">
        </label>

        <label>
          Salaire maximum
          <input id="cSalaryMax"
            type="number"
            value="${esc(c.salary_max || '')}">
        </label>

        <label>
          Type de contrat
          <select id="cContract">
            <option value="">Indifférent</option>
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Intérim">Intérim</option>
            <option value="Alternance">Alternance</option>
          </select>
        </label>

        <label>
          Disponibilité
          <input id="cAvailability"
            placeholder="Ex : immédiate / 1 mois"
            value="${esc(c.availability || '')}">
        </label>

        <label>
          Source
          <input id="cSource"
            value="${esc(c.source || 'manuel')}">
        </label>

        <label>
          URL du profil
          <input id="cSourceUrl"
            type="url"
            value="${esc(c.source_url || '')}">
        </label>

        <label class="full">
          Notes
          <textarea id="cNotes"
            placeholder="Informations importantes sur le candidat..."
          >${esc(c.notes || '')}</textarea>
        </label>

        <label class="checkbox">
          <input id="cActive"
            type="checkbox"
            ${c.active_search ? 'checked' : ''}>
          Recherche active
        </label>

      </div>

      <div class="form-actions">

        <button id="saveCandidate">
          ${candidate ? 'Enregistrer les modifications' : 'Ajouter le candidat'}
        </button>

        <button id="cancelCandidate">
          Annuler
        </button>

      </div>

    </article>
  `;

  if (c.contract_type) {
    document.querySelector('#cContract').value = c.contract_type;
  }

  document.querySelector('#cancelCandidate').onclick = () => {
    container.innerHTML = '';
  };

  document.querySelector('#saveCandidate').onclick = async () => {

    const payload = {
      first_name: document.querySelector('#cFirstName').value.trim(),
      last_name: document.querySelector('#cLastName').value.trim(),
      title: document.querySelector('#cTitle').value.trim(),
      location: document.querySelector('#cLocation').value.trim(),
      department: document.querySelector('#cDepartment').value.trim(),
      skills: document.querySelector('#cSkills').value.trim(),
      experience: document.querySelector('#cExperience').value.trim(),

      salary_min:
        document.querySelector('#cSalaryMin').value
          ? Number(document.querySelector('#cSalaryMin').value)
          : null,

      salary_max:
        document.querySelector('#cSalaryMax').value
          ? Number(document.querySelector('#cSalaryMax').value)
          : null,

      contract_type:
        document.querySelector('#cContract').value,

      availability:
        document.querySelector('#cAvailability').value.trim(),

      source:
        document.querySelector('#cSource').value.trim() || 'manuel',

      source_url:
        document.querySelector('#cSourceUrl').value.trim(),

      notes:
        document.querySelector('#cNotes').value.trim(),

      active_search:
        document.querySelector('#cActive').checked
    };

    if (!payload.first_name || !payload.last_name) {
      alert('Le prénom et le nom sont obligatoires.');
      return;
    }

    try {

      if (candidate) {

        await api(`/api/candidates/${candidate.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

      } else {

        await api('/api/candidates', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

      }

      await loadStats();
      await tab('candidates');

    } catch (e) {

      alert(e.message);

    }
  };
}

const TITLES={dashboard:['Bonjour 👋','Voici les opportunités à traiter en priorité.'],jobs:['Offres','Techniciens de maintenance en Île-de-France, PME ≤40 salariés.'],companies:['Entreprises','PME qui recrutent, classées par potentiel commercial.'],candidates:['Candidats','Vos profils et leur disponibilité.'],matches:['Matching','Meilleures correspondances offre ↔ candidat.'],alerts:['Alertes','Nouveaux matchs détectés.'],settings:['Paramètres','Fréquence de synchronisation.']};
async function tab(t){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));const [a,b]=TITLES[t]||['',''];$('#pageTitle').textContent=a;$('#pageSub').textContent=b;$('#stats').style.display=t==='dashboard'?'':'none';await tabInner(t);}
async function renderDashboard(){
const [d,co,s]=await Promise.all([api('/api/dashboard'),api('/api/companies'),api('/api/sync/status')]);
const last=s&&s.finished_at?new Date(s.finished_at).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}):'jamais';
const top=co.filter(x=>x.phone||x.email).concat(co.filter(x=>!x.phone&&!x.email)).slice(0,5);
const row=x=>`<div class="crow"><div class="score">${esc(x.commercial_score??0)}</div><div class="info"><b>${esc(x.name)}</b><small>${esc(x.employee_count??'Effectif à vérifier')}${x.employee_count?' salariés':''} · ${esc(x.city||'')} ${esc(x.postcode||'')}</small></div>${x.phone?`<a class="call" href="tel:${esc(x.phone)}">📞 Appeler</a>`:'<small class="empty">Téléphone à enrichir</small>'}</div>`;
$('#content').innerHTML=`<div class="dash"><div><h2>🔥 À appeler en priorité</h2>${top.map(row).join('')||'<p class="empty">Aucune entreprise pour le moment. Cliquez sur Synchroniser.</p>'}</div><aside class="panel"><h3>Résumé sourcing</h3><div class="kv"><span>Offres actives</span><b>${d.jobs}</b></div><div class="kv"><span>PME ≤40 salariés</span><b>${d.companies}</b></div><div class="kv"><span>Candidats actifs</span><b>${d.candidates}</b></div><div class="kv"><span>Matchs ≥85%</span><b>${d.matches}</b></div><div class="kv"><span>Dernière synchro</span><b>${last}</b></div></aside></div>`;}
