import 'dotenv/config'; import express from 'express'; import path from 'path'; import {fileURLToPath} from 'url'; import cron from 'node-cron'; import XLSX from 'xlsx'; import {initDb,q} from './db.js'; import {syncFranceTravail} from './sync.js';import {score} from './matching.js';
const __dirname=path.dirname(fileURLToPath(import.meta.url)); const app=express(); app.use(express.json()); app.use(express.static(path.join(__dirname,'../public')));
async function runCandidateMatching(candidateId) {

  const candidateResult = await q(`
    SELECT *
    FROM candidates
    WHERE id = $1
    LIMIT 1
  `, [candidateId]);

  const candidate = candidateResult.rows[0];

  if (!candidate) {
    return;
  }

  const jobsResult = await q(`
    SELECT
      j.*,
      c.name AS company,
      c.employee_count
    FROM jobs j
    LEFT JOIN companies c
      ON c.id = j.company_id
    WHERE j.status = 'active'
    LIMIT 500
  `);

  const threshold = Number(
    process.env.MATCH_ALERT_THRESHOLD || 85
  );

  for (const job of jobsResult.rows) {

    const result = score(job, candidate);

    if (result.score < threshold) {
      continue;
    }

    await q(`
      INSERT INTO matches (
        job_id,
        candidate_id,
        score,
        reasons
      )
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (job_id,candidate_id)
      DO UPDATE SET
        score = EXCLUDED.score,
        reasons = EXCLUDED.reasons
    `, [
      job.id,
      candidate.id,
      result.score,
      JSON.stringify(result.reasons)
    ]);

    const alert = await q(`
      SELECT id
      FROM alerts
      WHERE type = 'match'
        AND job_id = $1
        AND candidate_id = $2
        AND score = $3
      LIMIT 1
    `, [
      job.id,
      candidate.id,
      result.score
    ]);

    if (!alert.rows.length) {

      await q(`
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
      `, [
        job.id,
        candidate.id,
        result.score,
        `Match ${result.score}% : ${job.title}`
      ]);
    }
  }
}
app.get('/api/health',async(_,res)=>{try{await q('SELECT 1');res.json({ok:true,connected:true})}catch(e){res.status(500).json({ok:false,error:e.message})}});
app.get('/api/dashboard',async(_,res)=>{const [j,c,ca,m,a]=await Promise.all([q("SELECT count(*) n FROM jobs WHERE status='active'"),q('SELECT count(*) n FROM companies WHERE employee_count<=40 OR employee_count IS NULL'),q('SELECT count(*) n FROM candidates WHERE active_search=true'),q('SELECT count(*) n FROM matches WHERE score>=85'),q('SELECT count(*) n FROM alerts WHERE read=false')]);res.json({jobs:j.rows[0].n,companies:c.rows[0].n,candidates:ca.rows[0].n,matches:m.rows[0].n,alerts:a.rows[0].n});});
app.get('/api/jobs',async(req,res)=>{const d=req.query.dept; const params=[]; let where="j.status='active' AND (c.employee_count IS NULL OR c.employee_count<=40)"; if(d){params.push(d);where+=` AND j.department=$${params.length}`;} const r=await q(`SELECT j.*,c.name company,c.employee_count FROM jobs j LEFT JOIN companies c ON c.id=j.company_id WHERE ${where} ORDER BY j.updated_source_at DESC NULLS LAST LIMIT 500`,params);res.json(r.rows)});
app.get('/api/companies',async(_,res)=>res.json((await q("SELECT c.*,r.stage FROM companies c LEFT JOIN crm r ON r.company_id=c.id WHERE c.employee_count<=40 OR c.employee_count IS NULL ORDER BY c.commercial_score DESC,c.updated_at DESC LIMIT 500")).rows));
app.get('/api/candidates', async (_, res) => {
  try {
    const r = await q(`
      SELECT *
      FROM candidates
      ORDER BY active_search DESC, updated_at DESC
      LIMIT 500
    `);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.post('/api/candidates', async (req, res) => {
  try {
    const x = req.body;

    const r = await q(`
      INSERT INTO candidates (
        first_name,
        last_name,
        title,
        location,
        department,
        skills,
        experience,
        salary_min,
        salary_max,
        contract_type,
        availability,
        source,
        source_url,
        active_search,
        notes,
        raw
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16
      )
      RETURNING *
    `, [
      x.first_name || '',
      x.last_name || '',
      x.title || 'Technicien de maintenance industrielle',
      x.location || '',
      x.department || '',
      x.skills || '',
      x.experience || '',
      x.salary_min || null,
      x.salary_max || null,
      x.contract_type || '',
      x.availability || '',
      x.source || 'manuel',
      x.source_url || '',
      !!x.active_search,
      x.notes || '',
      JSON.stringify(x)
    ]);

    const candidate = r.rows[0];

try {
  await runCandidateMatching(candidate.id);
} catch (e) {
  console.error('Erreur matching candidat:', e);
}

res.json(candidate);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.put('/api/candidates/:id', async (req, res) => {
  try {
    const x = req.body;

    const r = await q(`
      UPDATE candidates
      SET
        first_name = $1,
        last_name = $2,
        title = $3,
        location = $4,
        department = $5,
        skills = $6,
        experience = $7,
        salary_min = $8,
        salary_max = $9,
        contract_type = $10,
        availability = $11,
        source = $12,
        source_url = $13,
        active_search = $14,
        notes = $15,
        raw = $16,
        updated_at = now()
      WHERE id = $17
      RETURNING *
    `, [
      x.first_name || '',
      x.last_name || '',
      x.title || 'Technicien de maintenance industrielle',
      x.location || '',
      x.department || '',
      x.skills || '',
      x.experience || '',
      x.salary_min || null,
      x.salary_max || null,
      x.contract_type || '',
      x.availability || '',
      x.source || 'manuel',
      x.source_url || '',
      !!x.active_search,
      x.notes || '',
      JSON.stringify(x),
      req.params.id
    ]);

    if (!r.rows[0]) {
      return res.status(404).json({
        error: 'Candidat introuvable'
      });
    }

    res.json(r.rows[0]);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.delete('/api/candidates/:id', async (req, res) => {
  try {
    await q(`
      DELETE FROM candidates
      WHERE id = $1
    `, [req.params.id]);

    res.json({ ok: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/candidates/:id/match', async (req, res) => {
  try {

    const candidateResult = await q(`
      SELECT *
      FROM candidates
      WHERE id = $1
      LIMIT 1
    `, [req.params.id]);

    const candidate = candidateResult.rows[0];

    if (!candidate) {
      return res.status(404).json({
        error: 'Candidat introuvable'
      });
    }

    const jobsResult = await q(`
      SELECT
        j.*,
        c.name AS company,
        c.employee_count
      FROM jobs j
      LEFT JOIN companies c
        ON c.id = j.company_id
      WHERE j.status = 'active'
      ORDER BY j.updated_source_at DESC NULLS LAST
      LIMIT 500
    `);

    const matches = [];

    const threshold = Number(
      process.env.MATCH_ALERT_THRESHOLD || 85
    );

    for (const job of jobsResult.rows) {

      const result = score(job, candidate);

      if (result.score < threshold) {
        continue;
      }

      await q(`
        INSERT INTO matches (
          job_id,
          candidate_id,
          score,
          reasons
        )
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (job_id,candidate_id)
        DO UPDATE SET
          score = EXCLUDED.score,
          reasons = EXCLUDED.reasons
      `, [
        job.id,
        candidate.id,
        result.score,
        JSON.stringify(result.reasons)
      ]);

      const alertResult = await q(`
        SELECT id
        FROM alerts
        WHERE type = 'match'
          AND job_id = $1
          AND candidate_id = $2
          AND score = $3
        LIMIT 1
      `, [
        job.id,
        candidate.id,
        result.score
      ]);

      if (!alertResult.rows.length) {

        await q(`
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
        `, [
          job.id,
          candidate.id,
          result.score,
          `Match ${result.score}% : ${job.title}`
        ]);
      }

      matches.push({
        ...job,
        score: result.score,
        reasons: result.reasons
      });
    }

    res.json({
      candidate_id: candidate.id,
      matches
    });

  } catch (e) {

    console.error('Erreur matching candidat:', e);

    res.status(500).json({
      error: e.message
    });
  }
});
app.get('/api/matches',async(_,res)=>res.json((await q(`SELECT m.*,j.title,c.name company,ca.first_name,ca.last_name,ca.title candidate_title FROM matches m JOIN jobs j ON j.id=m.job_id LEFT JOIN companies c ON c.id=j.company_id JOIN candidates ca ON ca.id=m.candidate_id ORDER BY m.score DESC,m.created_at DESC LIMIT 500`)).rows));
app.get('/api/alerts',async(_,res)=>res.json((await q(`SELECT a.*,j.title,c.name company,ca.first_name,ca.last_name FROM alerts a LEFT JOIN jobs j ON j.id=a.job_id LEFT JOIN companies c ON c.id=j.company_id LEFT JOIN candidates ca ON ca.id=a.candidate_id ORDER BY a.created_at DESC LIMIT 200`)).rows));
app.post('/api/sync',async(_,res)=>{try{res.json({ok:true,stats:await syncFranceTravail()})}catch(e){res.status(400).json({ok:false,error:e.message})}});
app.get('/api/settings/sync',async(_,res)=>{const r=await q("SELECT value FROM app_settings WHERE key='sync_interval_minutes'");res.json({interval_minutes:Number(r.rows[0]?.value||60)});});
app.put('/api/settings/sync',async(req,res)=>{const minutes=Number(req.body?.interval_minutes); const allowed=[15,30,60,120,360,720,1440]; if(!allowed.includes(minutes))return res.status(400).json({error:'Fréquence invalide'}); await q(`INSERT INTO app_settings(key,value) VALUES('sync_interval_minutes',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`,[String(minutes)]); await configureScheduler(); res.json({ok:true,interval_minutes:minutes});});
app.get('/api/sync/status',async(_,res)=>{const r=await q("SELECT id,source,status,started_at,finished_at,stats,error FROM sync_runs ORDER BY id DESC LIMIT 1");res.json(r.rows[0]||null);});
app.get('/api/export/jobs.xlsx',async(_,res)=>{const rows=(await q("SELECT j.title,c.name company,c.employee_count,j.location,j.postcode,j.department,j.contract_type,j.salary_text,j.schedule,j.experience,j.skills,j.url FROM jobs j LEFT JOIN companies c ON c.id=j.company_id WHERE j.status='active' AND (c.employee_count<=40 OR c.employee_count IS NULL) ORDER BY j.updated_source_at DESC")).rows; const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Offres'); const buf=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});res.setHeader('Content-Disposition','attachment; filename="maintimatch-offres.xlsx"');res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buf);});
app.use((_, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
let scheduledTask=null;
async function configureScheduler(){
  if(scheduledTask) scheduledTask.stop();
  const r=await q("SELECT value FROM app_settings WHERE key='sync_interval_minutes'");
  const minutes=Number(r.rows[0]?.value||60);
  const cronExpr=minutes===15?'*/15 * * * *':minutes===30?'*/30 * * * *':minutes===60?'0 * * * *':minutes===120?'0 */2 * * *':minutes===360?'0 */6 * * *':minutes===720?'0 */12 * * *':'0 0 * * *';
  scheduledTask=cron.schedule(cronExpr,()=>syncFranceTravail().catch(console.error),{timezone:'Europe/Paris'});
  console.log(`Synchronisation automatique: toutes les ${minutes} minutes`);
}
const port=Number(process.env.PORT||3000); await initDb(); await configureScheduler(); app.listen(port,()=>console.log(`MaintiMatch V1: http://localhost:${port}`));
