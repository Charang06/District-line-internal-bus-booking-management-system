// Generates the exact review file locally; never connects to a database.
import fs from 'node:fs'
import {createHash} from 'node:crypto'
const body=fs.readFileSync('scripts/security/internal-tables.sql','utf8')
const bodySha256=createHash('sha256').update(body).digest('hex')
const sql=`-- REVIEW ONLY: production fingerprint 868295d24a51. Explicit owner approval required.
-- Not registered in application startup. No application deployment is required.
-- Embedded body SHA-256: ${bodySha256}
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL transaction_timeout='3min';
SET LOCAL district_security.runtime_role='postgres';
SELECT pg_advisory_xact_lock(8216042,7);
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected migration role or database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_meta WHERE version=6)
    OR EXISTS (SELECT 1 FROM public.schema_meta WHERE version=7) THEN
    RAISE EXCEPTION 'Expected migration baseline 1–6, with 7 absent';
  END IF;
END
$guard$;
${body}
INSERT INTO public.schema_meta(version) VALUES (7);
COMMIT;
`
const file='scripts/security/007_internal_application_security.sql'
fs.writeFileSync(file,sql)
const manifest={at:new Date().toISOString(),file,bodySha256,sha256:createHash('sha256').update(sql).digest('hex'),productionApplied:false}
fs.writeFileSync('artifacts/internal-table-security/production-migration.json',JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest))
