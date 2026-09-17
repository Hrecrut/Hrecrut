import pg from 'pg'; import fs from 'fs'; import path from 'path';
const {Pool}=pg; export const pool=new Pool({connectionString:process.env.DATABASE_URL});
export async function initDb(){const sql=fs.readFileSync(path.join(process.cwd(),'src/schema.sql'),'utf8'); await pool.query(sql);}
export async function q(text,params=[]){return pool.query(text,params);}
