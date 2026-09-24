CREATE TABLE IF NOT EXISTS companies (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, siret TEXT UNIQUE, siren TEXT,
 address TEXT, postcode TEXT, city TEXT, department TEXT, phone TEXT, email TEXT,
 website TEXT, employee_count INTEGER, employee_source TEXT, employee_verified_at TIMESTAMPTZ,
 commercial_score INTEGER DEFAULT 0, source TEXT, raw JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS jobs (
 id BIGSERIAL PRIMARY KEY, source TEXT NOT NULL, source_id TEXT NOT NULL, title TEXT NOT NULL,
 company_id BIGINT REFERENCES companies(id) ON DELETE SET NULL, description TEXT, location TEXT,
 postcode TEXT, department TEXT, contract_type TEXT, contract_duration TEXT, salary_text TEXT,
 schedule TEXT, experience TEXT, skills TEXT, url TEXT, published_at TIMESTAMPTZ, updated_source_at TIMESTAMPTZ,
 status TEXT DEFAULT 'active', raw JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(),
 UNIQUE(source,source_id)
);
CREATE TABLE IF NOT EXISTS candidates (
 id BIGSERIAL PRIMARY KEY, first_name TEXT, last_name TEXT, title TEXT, location TEXT, department TEXT,
 skills TEXT, experience TEXT, salary_min INTEGER, salary_max INTEGER, contract_type TEXT, availability TEXT,
 source TEXT, source_url TEXT, active_search BOOLEAN DEFAULT false, raw JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS matches (
 id BIGSERIAL PRIMARY KEY, job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE, candidate_id BIGINT REFERENCES candidates(id) ON DELETE CASCADE,
 score INTEGER NOT NULL, reasons JSONB, alerted_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(job_id,candidate_id)
);
CREATE TABLE IF NOT EXISTS alerts (
 id BIGSERIAL PRIMARY KEY, type TEXT, job_id BIGINT REFERENCES jobs(id) ON DELETE CASCADE, candidate_id BIGINT REFERENCES candidates(id) ON DELETE CASCADE,
 score INTEGER, message TEXT, read BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS crm (
 id BIGSERIAL PRIMARY KEY, company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE, stage TEXT DEFAULT 'Nouveau prospect', notes TEXT, next_followup DATE,
 created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(company_id)
);
CREATE TABLE IF NOT EXISTS sync_runs (
 id BIGSERIAL PRIMARY KEY, source TEXT, started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ, status TEXT, stats JSONB, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_dept ON jobs(department); CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_companies_employees ON companies(employee_count); CREATE INDEX IF NOT EXISTS idx_matches_score ON matches(score DESC);


CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_settings(key,value) VALUES ('sync_interval_minutes','60')
ON CONFLICT (key) DO NOTHING;
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'unknown';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS size_status TEXT DEFAULT 'unknown';

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS is_intermediary BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_companies_type
ON companies(company_type);

CREATE INDEX IF NOT EXISTS idx_companies_size_status
ON companies(size_status);

CREATE INDEX IF NOT EXISTS idx_companies_intermediary
ON companies(is_intermediary);

ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE crm ADD COLUMN IF NOT EXISTS contact_name TEXT;
ALTER TABLE crm ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE crm ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE crm ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS crm_events (id BIGSERIAL PRIMARY KEY, company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE, type TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now());
