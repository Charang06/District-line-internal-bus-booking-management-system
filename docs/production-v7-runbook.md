# Exact production version-7 deployment — owner approval required

No production migration or live permission change has been executed by preparation.
This is a database-only change. Do not deploy application code, change Vercel
environment variables, rotate keys, create accounts or enable backup schedules.

## Reviewed artifacts

| Artifact | SHA-256 |
| --- | --- |
| `scripts/security/007_internal_application_security.sql` | `5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde` |
| `artifacts/internal-table-security/rollback-baseline.sql.review` | `b2483280b3df88c29d279529078468e7c51af32fd0e6a2e9116c63e077534d3e` |
| Encrypted recovery archive | `49e3653609c3b2d128acaf1094bdc9a0de4f3c6a6baeb45bc8e615f08fc013b2` |

Production project fingerprint: `868295d24a51`; isolated restore project:
`3ae16e4ead10`. The Vercel-to-project mapping was owner-confirmed, not independently
retrieved from Vercel. TLS chain and hostname verification are enforced.

The release protects all 22 internal application tables and 18 associated sequences.
It revokes PUBLIC/anon/authenticated table, column and sequence privileges, revokes
their schema CREATE, enables RLS and adds no permissive browser policies. Shared
schema USAGE is retained. Runtime/service-role privileges and ownership survive;
RLS is not forced on the owner. It records schema_meta version 7 in the same bounded
transaction. No unrelated migration is applied to production.

## Mandatory gates

Before requesting approval, require:

- `final-readiness.json`: passed; exact local hashes match; current production object,
  column and schema privileges, RLS/policies and versions match the captured baseline.
  Required migration history is exactly 1–6, with version 7 absent.
- `rehearsal.json`: passed, including administrator/staff login, bookings, cargo,
  finance, recovery and session expiry/revocation; original isolated baseline preserved.
- `rollback-test.json`: passed and bound to the exact migration hash above.
- `encrypted-restore-drill.json`: passed, authenticated decryption, 22 application
  data comparisons, schema/permission comparison, 18 sequence checks, exact migration
  and rollback on the fresh restore, and preservation of the original isolated target.
- Archive checksum still matches; owner keeps the private identity and a recovery
  copy separately. A new backup/drill is needed if the archive changes. The prepared
  executor rejects backups older than 24 hours; that is an upper bound, not a claim
  that any loss of recent live transactions is acceptable. Refresh before deployment
  when activity/delay makes the recovery point unsuitable.
- Explicit owner approval for **this exact migration and hash**, not just a generic
  approval of backup preparation or isolated tests.

These checks compare security metadata, not current production customer rows. Normal
staff bookings/session changes may continue; do not claim the entire live database
has been frozen or remained byte-identical throughout review.

## Production execution — do not run before approval

Use the existing trusted workspace and private .env. Do not paste connection strings,
passwords, private identities or API keys into commands or reports. Retain the tested
Express postgres runtime connection and existing feature flags.

1. Reconcile archive age and baseline drift. Run only the read-only readiness check:

   ```powershell
   node scripts/security/final-readiness.mjs
   ```

2. Review the exact SQL/rollback checksums above and obtain explicit owner approval.
   Choose a quiet period: DDL takes table locks. The SQL uses a 3-second lock timeout,
   30-second statement timeout, 3-minute transaction timeout and an advisory lock.
   Lock contention must abort, not trigger automatic retries or permission workarounds.

3. Only after that approval, the exact prepared invocation is:

   ```powershell
   $env:DISTRICT_V7_APPROVAL_SHA256 = '5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde'
   try {
     node scripts/security/apply-v7.mjs --owner-approved-apply-v7
     if ($LASTEXITCODE -ne 0) { throw 'Deployment stopped; reconcile read-only evidence before further action.' }
   } finally {
     Remove-Item Env:\DISTRICT_V7_APPROVAL_SHA256 -ErrorAction SilentlyContinue
   }
   ```

   The executor refuses missing approval markers, wrong project/hash, missing restore
   evidence, changed rollback/archive or stale backup. It repeats current read-only
   preflight, then executes the exact reviewed SQL bytes including BEGIN/COMMIT and
   its assertions. It does not start Express, seed accounts or run startup migrations.

4. Save the sanitized production-deployment.json report. A timeout/disconnect during
   COMMIT has an uncertain outcome. Do not repeat the write. Query migration history
   and catalog state read-only first; version-7 guards reject duplicate application.

## Post-deployment checks

Run these only after the approved SQL operation; neither command mutates records:

```powershell
node scripts/security/final-readiness.mjs --post-deployment
node scripts/security/http-check.mjs --expect-denied
```

Require:

- Migration history exactly 1–7, all 22 internal tables have RLS, no FORCE RLS,
  no browser policies/column grants, and owners remain unchanged.
- All PUBLIC/anon/authenticated table and sequence grants removed; only the targeted
  schema CREATE grants removed. Existing runtime/service-role grants preserved.
- All 22 GET select=*&limit=0 calls are denied by SQLSTATE 42501 (HTTP 401 for anon
  or 403), or unavailable with a genuine PostgREST PGRST205/404. A generic API-key
  401 is NOT a permission-denial pass. Any 200 is a failure. No customer rows or HTTP
  write probes are needed. No service-role key or account JWT substitutes are allowed.
- Owner-controlled normal browser administrator/staff sign-in and navigation still
  work. Keep credentials in the browser, not this agent's logs. Check existing trip/
  passenger/cargo/finance views without changing records. Observe API errors and
  normal business bookings; synthetic mutation regressions belong in isolation.
- Existing sessions should remain usable: the migration does not delete them or
  alter users. Do not send a recovery email or change an account as a silent smoke test.

Actual live HTTP denial cannot be asserted before production application. Separate
real isolated HTTP verification needs that project's own publishable key and a
committed isolated migration/recovery procedure; uncommitted SQL is invisible to
the hosted Data API. It has not been substituted with a falsely labelled SQL probe.

## Recovery and rollback

Before COMMIT, errors roll back the migration transaction. After COMMIT, diagnose
runtime role/ownership first and preserve browser denial if possible. No automatic
rollback, full-data overwrite, key rotation or broad GRANT is permitted.

The exact rollback file restores the original insecure 22-table/18-sequence and
schema CREATE baseline and removes version 7. It requires **separate explicit
security-downgrade approval**, then the session setting
district_security.approve_insecure_rollback=owner-approved-exact-baseline. It is not
part of ordinary deployment approval. It was tested in isolation, not live.

For data loss, use the owner-controlled offline identity and the encrypted archive
to restore into isolation first. Never give the private key to the application or
put it in reports. Reconcile live changes since backup before any separately approved
cutover. Apply the security remediation to a recovered copy before exposing it: the
backup accurately contains the pre-remediation insecure grants.

## Practical limits

The fresh drill verifies application-schema recovery, not a complete Supabase
platform clone. Managed schemas, external Storage bytes, role passwords and hosting/
provider secrets were not recreated. Real mail/SMS delivery and every historical
business edge case are outside the focused compatibility matrix. Future-object
default grants and the powerful owner-backed runtime remain separate risks; do not
expand this urgent release into unrelated role or application redesign.
