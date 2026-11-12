# District Line — database, security and release verification

Date: 2026-11-12, Asia/Colombo.

**BLOCKED — EXTERNAL VERIFICATION REQUIRED**

## 1. Work completed and preserved identity

Reviewed Phase 12–14, complete release readiness and final blocker resolution reports, the integration harness, approved schema assets, candidate verifier and local configuration. Existing uncommitted work is preserved. No browser/UI development was repeated.

Production comparison baseline remains user-supplied `666e833237845cc702b872f58542e2174b718372`. Local HEAD remains `0e102255342c220a34a8ee573f1ac5f1227e33aa`, branch `ui/admin-dashboard-handover`; the tree is dirty with no staging performed. A provider association was not refreshed. HEAD alone does not describe the candidate's uncommitted implementation.

Completed fresh local environment discovery, official Windows installation research, a concrete disposable database/TLS/privilege/lifecycle plan, integration-fixture repairs, focused offline regressions, candidate compilation/integrity checks, metadata-only Git review and provider/rollback prerequisites. No runtime application code or approved financial/permission behavior changed in this task.

## 2. PostgreSQL environment and actual database results

Fresh read-only discovery found no `psql`, `postgres`, `pg_ctl` or Docker command on PATH, no PostgreSQL/Docker standard Program Files directory and no matching PostgreSQL/Docker Windows service. No daemon or database connection was attempted. This bounded search cannot rule out portable/custom installations elsewhere. None has been identified and independently authorized as disposable.

Existing Git for Windows includes `C:/Program Files/Git/usr/bin/openssl.exe`; its version command reports OpenSSL 3.5.4. No keys or certificates were created or opened. No environment files or credentials were inspected.

**Real PostgreSQL: 0 executed, 0 passed, 1 skipped.** The suite declined execution without the required opt-in/attestation. No database was provisioned, connected, initialized, seeded or migrated. There is no real uniqueness/concurrency, persistence, locking, grant or rollback pass to report.

The previous 58 browser checks, 16 offline passes and 62 syntax checks remain historical evidence. Current verification counts appear in section 6; the prior browser suite was intentionally not repeated because runtime/UI source did not change.

## 3. Installation and disposable setup plan — pending approval, not executed

### Installation choice and official sources

The simplest documented Windows installation is the interactive EDB installer linked by the [official PostgreSQL Windows download page](https://www.postgresql.org/download/windows/). A binary ZIP alternative exists for experienced operators who want to manage a cluster without installing a service; it is available from [EDB's binary archive page](https://www.enterprisedb.com/download-postgresql-binaries). Docker installation adds another dependency and is unnecessary for this plan.

Proposed default: an independently approved PostgreSQL 18.x stable Windows installation with one dedicated test cluster/service and port 5549. Confirm the selected installer's support for this computer's Windows version and architecture before approval. Installation/service creation is **not authorized or performed** by this report.

After explicit installation and synthetic-lifecycle approval, the owner follows these steps from the [EDB Windows installation guide](https://www.enterprisedb.com/docs/supported-open-source/postgresql/installing/windows/):

1. Follow the official download link; select the supported stable Windows installer, not a development release. Check its publisher signature before running it.
2. Run the wizard with approved administrator privileges. Choose a new installation directory; never upgrade or reuse an existing instance for this test.
3. Select PostgreSQL Server and Command Line Tools; omit optional pgAdmin/Stack Builder if unnecessary.
4. Set the data directory to the newly approved `C:\DistrictLineDisposable\data`, outside the repository and protected/synced storage. Reject a preexisting target rather than overwriting it.
5. Set a unique bootstrap password privately in the wizard. Do not place it in command arguments, source, reports or `.env`.
6. Select port **5549**, after checking for collisions; finish only the reviewed dedicated installation. Decline optional downloads.
7. Record the actual newly created service name/account, executable, data directory and port. Stop that specific service before configuring TLS/access. Do not stop other services.

The wizard can create/start a service; therefore approval must explicitly cover this effect. For a no-service preference, choose the official ZIP instead and obtain separate approval for manual `initdb --auth=scram-sha-256 --encoding=UTF8 --pwprompt` and `pg_ctl -D <new-dedicated-data-directory>` lifecycle. Never point either tool at an existing data directory. See [initdb](https://www.postgresql.org/docs/current/app-initdb.html) and [pg_ctl](https://www.postgresql.org/docs/current/app-pg-ctl.html).

### Independently establish isolation before initialization or testing

Owner approval must identify the installation/service or process, fresh data directory, port, database, test role, allowed baseline initialization and synthetic-record cleanup. Independently inspect ownership/storage/network configuration; localhost is not proof. Confirm there are no real records, external tables, replication subscriptions, backup/restore linkage, production credentials, application delivery integrations or shared volumes. Protect the directory with owner/service-specific Windows ACLs and exclude it from source-control/sync/distribution.

Use only dedicated local storage. Keep bootstrap/admin and application test credentials separate. Keep the test cluster disconnected from production and protected backup systems. No application startup with root `.env` is part of this plan: the integration loader injects its own pool and mocked delivery.

### TLS preparation with existing tools, after approval only

Obtain an owner-controlled local CA and short-lived PEM server certificate whose SANs include **DNS:localhost** and **IP:127.0.0.1**. Keep CA private keys outside the repository, outside candidate payloads and inaccessible to the PostgreSQL service. Grant the service access only to its server key/certificate. Node and psql need only the public CA certificate. PostgreSQL's server certificate/key requirements are documented in [server TLS configuration](https://www.postgresql.org/docs/current/ssl-tcp.html).

For a fully disposable CA, these are concrete future commands using the discovered OpenSSL binary. First have the owner create and ACL fresh `authority` and `tls` directories under the approved test root; refuse existing private-key destinations. **These commands have not run.** The short-lived unencrypted service key must be protected by its Windows ACL; no key contents enter reports. Command references: [OpenSSL req](https://docs.openssl.org/3.0/man1/openssl-req/) and [OpenSSL x509](https://docs.openssl.org/3.0/man1/openssl-x509/).

```powershell
$testRoot = 'C:/DistrictLineDisposable'
$testOpenSsl = 'C:/Program Files/Git/usr/bin/openssl.exe'
& $testOpenSsl req -x509 -newkey rsa:3072 -sha256 -days 2 -noenc -subj '/CN=DistrictLine Disposable CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' -keyout "$testRoot/authority/ca.key" -out "$testRoot/authority/ca.crt"
& $testOpenSsl req -new -newkey rsa:3072 -noenc -subj '/CN=localhost' -keyout "$testRoot/tls/server.key" -out "$testRoot/tls/server.csr"
```

Create the non-secret `C:/DistrictLineDisposable/tls/server.ext` with:

```ini
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
```

Then, only after checking the preceding exit codes and destinations:

```powershell
& $testOpenSsl x509 -req -in "$testRoot/tls/server.csr" -CA "$testRoot/authority/ca.crt" -CAkey "$testRoot/authority/ca.key" -CAcreateserial -sha256 -days 2 -extfile "$testRoot/tls/server.ext" -out "$testRoot/tls/server.crt"
& $testOpenSsl verify -CAfile "$testRoot/authority/ca.crt" -verify_hostname localhost "$testRoot/tls/server.crt"
```

Only the owner executes these commands after approving private-key creation; the agent must not inspect private keys. Certificate expiry is intentional: renew the isolated certificate rather than disabling verification.

Configure only the new cluster's `postgresql.conf`:

```ini
listen_addresses = '127.0.0.1'
port = 5549
ssl = on
ssl_min_protocol_version = 'TLSv1.2'
ssl_cert_file = 'C:/DistrictLineDisposable/tls/server.crt'
ssl_key_file = 'C:/DistrictLineDisposable/tls/server.key'
password_encryption = 'scram-sha-256'
```

Replace—not append below broad defaults—the new cluster's HBA rules with this reviewed policy, substituting the actual dedicated bootstrap role if it differs from `postgres`. Apply it only to the approved fresh cluster:

```text
hostnossl all                all           127.0.0.1/32 reject
hostssl   all                postgres      127.0.0.1/32 scram-sha-256
hostssl   district_synthetic  district_test 127.0.0.1/32 scram-sha-256
host      all                all           0.0.0.0/0    reject
host      all                all           ::/0         reject
```

HBA matching is ordered; broad earlier rules would defeat the intended restriction. Restart only the recorded new service after reviewing ACLs/configuration. Confirm its PID, executable, data directory and listener match the approved record before any connection. See [PostgreSQL HBA rules](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html).

### Fresh database, role separation and baseline initialization

**Pending separate initialization authorization.** Never run these instructions on an existing/protected database. The owner connects with psql using explicit host, hostaddr, port, database and CA; `-X` avoids inherited psql startup scripts, `-W` prompts privately, and `ON_ERROR_STOP` halts failures:

```powershell
$testPsql = 'C:/Program Files/PostgreSQL/18/bin/psql.exe' # replace with verified new installation
$testAdminConnection = 'host=localhost hostaddr=127.0.0.1 port=5549 dbname=postgres user=postgres sslmode=verify-full sslrootcert=C:/DistrictLineDisposable/authority/ca.crt'
& $testPsql -X -W -v ON_ERROR_STOP=1 --dbname=$testAdminConnection
```

The explicit CA/hostname validation follows [libpq verify-full](https://www.postgresql.org/docs/current/libpq-ssl.html); there is no plaintext bootstrap/test connection in this procedure. psql options are documented in [psql](https://www.postgresql.org/docs/current/app-psql.html).

In this new cluster only, the owner creates separate schema-owner and test-login roles, then sets the test password with psql's private prompt. Existing names are a stop condition, not permission to reuse them. Role capabilities are described in [CREATE ROLE](https://www.postgresql.org/docs/current/sql-createrole.html).

```sql
CREATE ROLE district_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE district_test LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5;
```

```text
\password district_test
```

```sql
CREATE DATABASE district_synthetic OWNER district_owner TEMPLATE template0;
REVOKE ALL ON DATABASE district_synthetic FROM PUBLIC;
GRANT CONNECT ON DATABASE district_synthetic TO district_test;
```

Exit that psql session with `\quit`, then reconnect as the bootstrap owner to **district_synthetic** with the same explicit TLS connection parameters:

```powershell
$testDatabaseConnection = $testAdminConnection.Replace('dbname=postgres', 'dbname=district_synthetic')
& $testPsql -X -W -v ON_ERROR_STOP=1 --dbname=$testDatabaseConnection
```

Set `ON_ERROR_STOP` and inspect only this synthetic cluster. The following psql sequence creates only approved baseline assets, records versions 2–4 explicitly and seeds no accounts. File 001 already records version 1; files 002–004 do not record their own ledger versions. Merely running those files without ledger rows would fail normal startup.

```text
\set ON_ERROR_STOP on
\cd 'C:/Users/Abbishathanan/Desktop/p1/New folder/last/D BUS BOOKING M'
SET ROLE district_owner;
\i server/migrations/001_initial_postgres.sql
BEGIN;
\i server/migrations/002_auth_sessions.sql
INSERT INTO schema_meta(version) VALUES (2);
\i server/migrations/003_password_recovery.sql
INSERT INTO schema_meta(version) VALUES (3);
\i server/migrations/004_admin_email_recovery.sql
INSERT INTO schema_meta(version) VALUES (4);
COMMIT;
```

Stop on errors; do not rerun against a partially populated target without a reviewed disposable reset procedure. Migrations 005/006/008/009 and operational/security migrations are outside this plan. No initialization command is a startup/deployment hook.

As the schema owner, grant application DML and sequence usage only; no superuser, ownership, role membership, DDL, TRUNCATE, schema CREATE or ledger writes for the test login. This role supports the application's authorized administrative operations inside the disposable database, not server administration. [GRANT reference](https://www.postgresql.org/docs/current/sql-grant.html).

```sql
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO district_test;
GRANT SELECT ON schema_meta TO district_test;
GRANT SELECT,INSERT,UPDATE,DELETE ON users,auth_sessions,crew_members,bus_contacts,
  buses,trips,bookings,sms_attempts,cargo,revenue_entries,expense_submissions,
  bus_duties,daily_expenses,duty_adjustments,audit_logs,
  password_recovery_tokens,password_recovery_rate_limits TO district_test;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO district_test;
RESET ROLE;
```

All application tables must remain empty. schema_meta contains only 1–4. Confirm database/schema ownership and grants using the test login over verified TLS; do not use the bootstrap login for integration. The prepared suite now rejects superuser/CREATEDB/CREATEROLE/replication/BYPASSRLS capabilities, membership in the database-owner role, public-schema CREATE and schema_meta INSERT.

### Attestation, execution and cleanup

Use the existing attestation shape in [final blocker resolution, section 5](districtline-final-blocker-resolution.md), with actual `processOrContainerId`, storage/network evidence and a fresh `verifiedAt`. All seven approval/isolation/lifecycle booleans must be true based on independent evidence. Set host 127.0.0.1, approved port 5549, database district_synthetic and user district_test. Do not fabricate approval to satisfy a test gate.

Only after owner verification/approval, set process-scoped `NODE_EXTRA_CA_CERTS=C:/DistrictLineDisposable/authority/ca.crt` **before launching Node**, `DISTRICT_DISPOSABLE_LOCAL_TESTS=owner-attested-empty-local-only` and `DISTRICT_DISPOSABLE_ATTESTATION` to the fresh owner-controlled JSON. Supply `DISTRICT_DISPOSABLE_PASSWORD` through a secure owner process without logging it or creating `.env`. The CA is public trust material; neither server nor CA private key belongs in Node's environment.

```powershell
node --experimental-vm-modules --test server/disposable-local-integration.test.js
```

The injected harness mocks delivery and suppresses normal application initialization. It rejects occupied tables before writing generated fixtures and retains strict TLS. It tests booking uniqueness/concurrency/cancel/rebook, finance limits/persistence/locking, duties/deletions/finalization/immutability, permissions, schema/grants and rollback. Prepared guards/scenarios are not integration evidence until actually run; real execution can reveal further fixture/schema issues.

Cleanup permission must cover only generated synthetic records and the specifically identified new instance. Review fixture cleanup results; on failure, stop and preserve the dedicated instance for diagnosis. Do not issue broad deletes against another database. Record the dedicated service/process identity, stop only it, and retain files/keys until separately authorized disposal. No recursive deletion, service removal or backup alteration is authorized by this report. A rerun requires fresh evidence that application tables are empty and that the attestation remains valid.

## 4. Local harness corrections

Confirmed by source/schema review: `users.permissions` is `TEXT NOT NULL`, but the integration fixture attempted SQL NULL for its missing-permissions case. It now stores JSON text `null` using `JSON.stringify`, which the real permission parser treats as absent grants. This preserves the schema and fail-closed policy; it does not invent SQL-NULL support. Legacy/no-Accounts/View/Manage cases remain in the prepared suite.

Added the least-privilege role/ownership/schema-ledger checks described above before fixture writes. These checks are prepared but unexecuted against PostgreSQL. No application routes, permission resolver, financial formula, count/fare/cargo rule, locked persistence, transaction handler, login/recovery behavior or feature flag changed.

## 5. Current Vercel and candidate findings

The nominated candidate remains `release-candidates/districtline-2026-11-12T15-17-59-452Z`. Its [74-file manifest](districtline-final-candidate-manifest.json) SHA-256 remains:

```text
df7a9232d32139a69b0b8866b05fa04ff8eb60c8be3762d7a28dcd30ae2cd018
```

Fresh verification passed exact membership, all byte sizes/SHA-256 checksums, current runtime-source equality, relative import closure, declared external packages, no redirected/symlink paths and zero prohibited paths. No `.git`, environment files, private artifacts, profiles, uploads, backups, databases, node_modules, reports/tests or unauthorized SQL entered it. Only test/documentation changes were needed, so no replacement candidate was generated and no candidate was modified in place.

Local `vercel.json` remains Vite / npm build / dist / sin1, API rewrite before SPA fallback. Four API entry files and adapter behavior pass focused checks. SQL include assets are only registered 001–004, plus the public CA/TLS helper; 008/009 remain absent and explicitly excluded. No migration ran.

Package declarations match the lock root. Local Node v24.11.0, installed Vite 8.3.4 and the native Windows sqlite3 module work in their checked scope; sqlite3 loaded version 3.52.0 without opening a database. This is not clean Linux/native install or provider compatibility. No Node engines pin was introduced. Actual existing-project Node/install/build/root settings and traced bundles remain unknown.

A fresh offline candidate build passed: 50 transformed modules, three in-memory outputs, env-file loading/public copying/output writes disabled, inherited VITE flag names cleared only in the build child process. Expected public URL warnings come from `publicDir:false`; required assets exist in the verified manifest. No browser rerun or remote build occurred.

Source review retains hashed persistent sessions, HttpOnly cookies, Lax default, Secure in production and explicit HTTPS/origin requirements for SameSite=None. Hosted upload mkdir is skipped with VERCEL; persistent storage must use approved isolated remote storage. Real proxy/origin/cookie, pooler/TLS, filesystem and storage acceptance is still required.

Review non-secret names/scopes only in any future authorized provider check: DATABASE_URL/DATABASE_SSL, CORS_ORIGIN/SESSION_COOKIE_SAME_SITE, SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_STORAGE_BUCKET, configured recovery/SMS names, ENABLE_ADMIN_USERNAME_RECOVERY/VITE_ENABLE_ADMIN_USERNAME_RECOVERY, ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION/VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION, ADMIN_MFA_MODE/VITE_ENABLE_ADMIN_MFA_ENROLLMENT and ENABLE_LOGIN_RATE_LIMIT. Never expose secret values or give credentials VITE prefixes. Preserve approved recovery states and required schema. MFA/new limiter remain unactivated; the known profile-password MFA session-marker issue still blocks any future enforcement activation.

## 6. Fresh tests and evidence

Machine-readable results: [districtline-database-security-verification.json](districtline-database-security-verification.json).

| Category | Current result | Scope |
|---|---|---|
| Focused policy/permissions/adapter/startup/TLS/attestation selection | 21 passed, 0 failed, 1 skipped | 22 tests; includes the single real DB skip |
| Isolated-harness preparation selection | 9 passed, 0 failed, 0 skipped | Gate/fixture/savepoint/cookie/loader tests with mocks; no database |
| Real PostgreSQL | 0 executed, 0 passed, 1 skipped | Same skipped test, not a second test |
| Syntax | 62 checked, 0 failed | server/src/api/release JS/MJS/CJS; later harness edits rechecked |
| Frontend compilation | 1 passed | 50 modules, 3 memory outputs, no install/write |
| Candidate integrity | 74/74 passed | No new candidate/runtime changes |
| Browser acceptance | Not rerun | Prior 58 passes are historical synthetic-browser evidence |
| Actual Vercel/provider tests | 0 executed | No provider contact authorized |

Thus **30 distinct offline tests passed, zero failed; one PostgreSQL test skipped**. Do not sum build/syntax/browser categories into a production-success test total. Exact current selections:

```text
node --test server/disposable-attestation.test.js server/disposable-local-integration.test.js server/financial-policy.test.js src/data/staffPageAccess.test.js src/data/revenueSeatRows.test.js server/release-safety.test.js server/database-startup.test.js server/database-tls.test.js
node --test server/isolated-preparation.test.js
node scripts/release/verify-local-candidate.mjs docs/handover/districtline-database-security-verification.json docs/handover/districtline-final-candidate-manifest.json
```

The preparation selection includes actual route boot/cookie login against fake pg and savepoint/gate/occupied-table rejection tests. It does not establish real booking concurrency or PostgreSQL transaction behavior. No broad npm test, backup executor, live business request or database-capable suite with an external target ran. Later integration-only edits were parsed and their no-attestation path verified as skipped; this does not test the new role SQL against PostgreSQL.

## 7. Git security and remediation proposal

Path-only Git metadata still reports **136 tracked Chrome-profile paths** and **nine tracked artifact profile-image copies**; history still contains them, with the latest profile-directory change recorded in `0e10225` on 2026-11-12. No contents were read. None appears in the verified candidate. A normal wholesale push of the existing repository/history remains blocked pending owner review; ignore rules and clean runtime packaging do not sanitize existing history.

Repository visibility, collaborators/forks, prior downloads/CI/deployment source retention and actual credential exposure remain unknown. Potential credential-bearing filenames justify private security review; no confirmed credential compromise is claimed.

Proposed remediation, **for separate approval**:

1. Preserve local history/private artifacts as evidence; do not delete them or create another copy/archive under this task.
2. An authorized owner reviews remote access/exposure metadata and privately assesses affected material. Do not paste cookie/database/credential contents into reports.
3. Select an approved sanitized source-publication method based on the explicit runtime manifest and required reviewed source controls. Never carry old `.git` history into a clean release source. Do not create a new Vercel project.
4. If a separate sanitized Git repository is chosen, approve its ownership/visibility, initial commit/push and relinking impact on the existing Vercel project before any action. This task creates none of them.
5. Any old-repository history rewrite, deletion, access change, cache cleanup or evidence-based credential/session revocation needs separate scope/approval. Sanitized future publication cannot undo past exposure; document unknowns and residual risk.

## 8. Provider, Preview, production and rollback checklist

All items below requiring Vercel/GitHub/protected-service access are pending separate authorization. No IDs are invented and no provider has been contacted.

1. Verify the **existing** Vercel team/project IDs, ownership and domain mapping for `https://districtlinebooking.com/`; do not create/import a new project.
2. Record current immutable production deployment ID/full source SHA and previous known-good deployment ID/full SHA. Reconcile the user-supplied baseline with provider metadata; stop on unexplained differences.
3. Record effective Node/root/install/build/output/region/runtime settings and approved non-secret environment/flag names and scopes. Preserve approved states; do not change settings incidentally.
4. Resolve repository exposure and approve only sanitized checksummed source transfer. Do not deploy/push the current dirty checkout or old history wholesale.
5. Independently attest Preview database, storage, network and mocked delivery isolation. No production Supabase, protected backup or shared customer storage/configuration is allowed.
6. Complete the real disposable PostgreSQL suite and outstanding application-level failure/permission scenarios. Then run database-backed browser acceptance; synthetic browser passes alone are insufficient.
7. Obtain explicit Preview deployment approval. Only afterward inspect actual existing-project clean build/install, native sqlite3/Linux compatibility, all function traces, CA/helper inclusion, only 001–004 SQL, absence of 008/009/private paths, API routing, assets and real cookie/TLS/session behavior. No Preview is deployed by this report.
8. Record immutable Preview identity, candidate digest and passing database/browser/provider results. Confirm a retained same-project rollback deployment is eligible and compatible with schema, flags, storage, recovery/session and runtime configuration.
9. Obtain explicit production promotion approval for that exact immutable candidate. Do not infer it from Preview approval or this report.
10. Before promotion, agree non-mutating health/error/latency thresholds, rollback operator and exact same-project rollback/alias procedure. Verify access/retention/eligibility while the prior deployment is still available.
11. After a separately authorized promotion, monitor domain/TLS, assets, `/api/health` and approved telemetry. Do not perform real booking/cancellation/finance/delivery smoke transactions; authenticated GETs may update sessions or reconcile full-dashboard business state.
12. On agreed failure thresholds, the authorized operator restores the previously verified compatible deployment/alias, checks non-mutating health and records results. Code rollback does not restore database/schema/storage or feature state. No reverse SQL or protected restore is included.

Current/previous deployment IDs, effective runtime settings, schema/feature compatibility and rollback eligibility all remain unknown remotely.

## 9. Files modified and remaining risks

Only these files changed during this task:

- `server/disposable-local-integration.test.js`: NOT NULL-compatible JSON-null fixture and least-privilege database-role preflight. Prepared only; no real DB execution.
- `.gitignore`: narrow exceptions for this report and its new JSON evidence; existing private/output exclusions retained.
- `docs/handover/districtline-database-security-release-verification.md`: this report, official-source installation/TLS/setup plan, security/remediation and release/rollback prerequisites.
- `docs/handover/districtline-database-security-verification.json`: fresh offline/build/candidate results.

No runtime source, lockfile, deployment config, historical report, candidate, browser profile, backup or private artifact was modified by this task. Financial formulas, four categories/49-seat limit, fare/cargo validation, locking/finalization, Accounts View/Manage, admin-only staff management, booking/cancellation transactions and approved authentication/recovery behavior are preserved. No flags were activated.

Remaining risks: unexecuted PostgreSQL behavior/role checks, incomplete database-backed acceptance, unverified real provider bundles/install/runtime/TLS/storage/cookies, potential private-history exposure and unverified rollback identity. Passing current offline checks does not resolve those gates.

## 10. Exact next action and stopping point

**Owner approval is required for the concrete section 3 plan:** PostgreSQL installation plus one new dedicated service/cluster/data directory on port 5549, local TLS key/certificate creation, isolated database/role creation, baseline 001–004 initialization and scoped synthetic-data lifecycle. The owner must independently verify the resulting instance and provide the fresh attestation before integration execution. An existing database is not an acceptable shortcut without that evidence.

Then run `node --experimental-vm-modules --test server/disposable-local-integration.test.js` against only that verified target, resolve any real failures, and retain actual results. Separately authorize provider/security metadata review before considering Preview approval. Do not deploy or push yet.

**BLOCKED — EXTERNAL VERIFICATION REQUIRED.** No PostgreSQL integration or production readiness is claimed. No software, service or database/cloud resource was installed or created, no real SQL/migration was executed, no credentials/environment files/private profiles were inspected, no protected database/provider configuration was accessed, no delivery/live transaction occurred, and no deployment, Git mutation, file deletion or backup alteration occurred. Public official documentation was the only external source accessed. Stop after this report.
