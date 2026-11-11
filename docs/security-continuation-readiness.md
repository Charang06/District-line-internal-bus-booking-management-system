# Security continuation readiness — 2026-11-09

**Current owner decision:** Cloudflare R2 is selected; backup storage/API setup is
deferred. Do not follow the historical B2 recommendation below. Backup setup does
not gate independent TLS, limiter or MFA preparation. See
[security-local-finalization.md](security-local-finalization.md) for the latest local
validation, separate production approval gates and rollback procedures.

No production data, roles, grants, policies or settings were changed. No migration,
deployment, backup export/upload, external notification or scheduled job was run.
Migration 007 remains untouched. Backups, login limiting and MFA remain inactive.
This report supersedes older backup-role/monitoring assumptions in the preparation
report. Existing unrelated workspace changes were preserved.

## Completed checks and blockers

| Check | Result | Remaining gate |
| --- | --- | --- |
| Five skipped PostgreSQL tests | Blocked, as explicitly requested after target inspection | Owner confirms no disposable database is available |
| Existing restore target | Read-only inspection: populated; required baseline incomplete; rejected for fixtures | Do not clear, migrate or repurpose it |
| Source transport | Diagnostic client TLS 1.3 with certificate/hostname verification; backend PostgreSQL ssl=false | Approve Supabase SSL-enforcement maintenance; verify backend encryption afterward |
| Upstream certificate verification | SQL cannot show the pooler's peer/hostname verification behavior | Obtain hosted-service confirmation; source code alone is not deployment proof |
| Admin/staff compatibility | Expanded local HTTP regression passes with fake PostgreSQL | Real isolated migrations, concurrent requests and full browser flows still blocked |
| Backup least privilege | New gate rejects current application credential and unsafe roles/grants/RLS/backend TLS | Dedicated backup role/policies must be separately reviewed, provisioned and restore-tested |
| Backup monitoring | Both success and failure endpoints required; failed job sends failure; stale job monitored externally | Owner-selected monitor and actual delivery/missed-run tests |
| Private storage and retention | B2 recommendation and native lifecycle candidate prepared | No account, bucket, key, lifecycle or Object Lock configured |

The five blocked tests are the two real username-recovery tests, two email-verification
tests and the cookie-authenticated duties/finance regression. Their safety gates were
not bypassed. Only metadata and table-emptiness booleans were inspected; no customer
or finance rows were returned. No fixture was written to either database.

## Pooler TLS: finding and resolution procedure

The source diagnostic again observed a verified client-to-pooler TLSv1.3 socket and
`pg_stat_ssl.ssl=false` for its own PostgreSQL backend. This is an actual unencrypted
PostgreSQL transport observation for that hop, not evidence that it is protected merely
because it resides in a private network. The exact requested/applied enforcement
setting was not read from the control plane; no management token was configured.

Supabase documents that SSL enforcement covers both legs of the shared pooler and
that changing enforcement reboots the database. The preferred remedy preserves the
existing pooler connection method: obtain an approved maintenance window, inspect
requested/applied SSL enforcement, enable **Enforce SSL on incoming connections** if
needed, wait for the setting to converge/reboot to finish, then run:

```
node scripts/security/transport-preflight.mjs --read-only
```

Require applicationTlsVerified=true AND backendTlsEncrypted=true on fresh connections;
check admin/staff login, session continuity/re-login, recovery, booking and read-only
finance after the approved maintenance. Do not blindly toggle an already-enabled
setting: if the backend remains false, escalate to Supabase with sanitized evidence.
No setting was changed in this task. The backup candidate now blocks a dump if the
backend TLS observation is false.

Encryption is separate from upstream identity validation. Public Supavisor source
has configurable upstream verification and its current peer branch contains a custom
hostname matcher; neither source nor pg_stat_ssl proves the hosted revision/config
performs standard hostname verification. Ask Supabase to confirm the project's
upstream certificate-chain and endpoint identity checks. Do not describe peer/hostname
verification on that hop as resolved until that answer is adequate. If strict
single-hop verify-full is necessary, evaluate a direct database connection instead,
testing hosting/runner reachability, connection limits and IPv6 or paid IPv4 requirements.
Do not switch DATABASE_URL, buy an add-on or weaken TLS without separate approval.

Sources: [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement),
[Supavisor TLS source](https://github.com/supabase/supavisor/blob/main/lib/supavisor/db_handler.ex),
[Supabase IPv4 requirements](https://supabase.com/docs/guides/platform/ipv4-address).

## Authentication compatibility

The actual Express route definitions are exercised locally through the existing
cookie harness with PostgreSQL and all external delivery providers mocked. The
expanded check covers:

- Password success in enforce mode returns a challenge with no new admin session.
- Wrong proof and replay are denied; valid MFA creates the ordinary HttpOnly-cookie
  session. Existing password-only admin sessions are denied after enforcement.
- Staff login remains password-only in enforce and enrollment modes; admin password
  login remains available during enrollment.
- The real limiter middleware now uses stateful fake counters in this HTTP check:
  the ninth account/IP attempt returns 429 and creates no session, while another
  account on the same office IP remains usable.
- A blocked login does not invoke the recovery limiter. An unconfigured password
  recovery request retains its existing 503 configuration response, rather than
  becoming a login-limit 429. Existing recovery unit coverage remains applicable.
- Unknown usernames, wrong passwords and inactive accounts retain generic 401s.

This confirms route compatibility, not PostgreSQL concurrency or provider behavior.
Keep ENABLE_LOGIN_RATE_LIMIT=false and ADMIN_MFA_MODE=off until isolated SQL/browser
prerequisites pass. No production account was used for these checks.

## Backup review and changes

The previous draft accepted a privileged postgres connection. The candidate now only
accepts the dedicated district_backup username, or district_backup.<project-ref> on
the shared session pooler; BACKUP_DATABASE_ROLE is fixed to district_backup. Do not
reuse DATABASE_URL, service_role, the master database password or a broad app key.

Before pg_dump, `database-audit.mjs` performs metadata-only checks with the backup
credential. It requires PG17, backend TLS, no superuser/BYPASSRLS/create-role/create-db/
replication/membership/ownership, no public-schema CREATE or table write/column-write
grants, readable sequence state with no USAGE/UPDATE, and SELECT on every public
application table. Since 007 deliberately has default-deny RLS, a read-only role
alone cannot dump all rows. This remains a provisioning blocker, not a reason to
disable RLS or use a powerful login.

Owner-reviewed provisioning design, NOT executed:

1. Start with a new NOLOGIN role, NOSUPERUSER/NOBYPASSRLS/NOCREATEDB/NOCREATEROLE/
   NOREPLICATION/NOINHERIT, no memberships and no object ownership.
2. Grant CONNECT to the intended database, USAGE on public, SELECT on the explicit
   reviewed application-table inventory, SELECT only on owned sequences. No blanket
   future-table grants or privileges in managed schemas. Do not alter browser roles.
3. For the explicit inventory, separately approve SELECT-only, TO district_backup,
   USING(true) RLS policies. No policy applies to PUBLIC, anon, authenticated or staff.
   The candidate audit requires these exact allow-read semantics and rejects applicable
   restrictive SELECT policies, avoiding a silently partial dump. It uses pg_dump
   --enable-row-security after the audit. RLS remains enabled; existing access is unchanged.
4. Audit inherited PUBLIC grants and callable SECURITY DEFINER functions. The candidate
   conservatively rejects any callable non-system definer function. Do not blindly
   revoke global grants to make this pass: review function safety/alternative restricted
   export design first. Also review managed-schema, database CREATE and cross-database
   access, which are not exhaustively covered by the automated public-table check.
5. In isolation, verify complete rows/sequence state/ACLs against a privileged reference,
   denial of inserts/updates/deletes/nextval/setval/schema changes, and rejection of
   unauthorized Data API access. Only then approve LOGIN and a separately generated
   credential through a private owner-controlled process; never print its password.
6. Freeze schema/policy changes during backup validation/export. The metadata audit and
   dump use separate sessions, not a shared snapshot, so their TOCTOU window is a
   remaining limitation. A reviewed shared-snapshot/DDL-lock implementation would be
   required if concurrent policy changes must be supported. Record inventory drift
   and review new tables before allowing their backups.

The audit SELECT was syntax-checked against the source in a read-only transaction;
it rejected the current application credential as intended. This is not evidence
that a suitable new backup role exists. None was created or modified.

Encryption remains streamed directly from pg_dump into age. Only ciphertext reaches
disk; pg_restore parses the full archive stream to discarded stdout. Ciphertext and
manifest are downloaded after upload and checked for SHA-256/size agreement. No age
private identity was accessed. Authenticating restored ciphertext still requires the
owner's offline identity and a separately approved isolated restore; no new dump or
restore was run. Source PG17 was confirmed, matching the chosen client major.

The inactive workflow now validates separate HTTPS success/failure monitor endpoints
before export, signals failure immediately, and signals success only after verified
archive AND manifest uploads. The monitor independently alerts after 24h + 2h grace
without success, even if GitHub never starts a job. The generic failure webhook is
optional supplementary delivery; neither it nor the heartbeat has been sent here.
Test intentional synthetic failures/missed pings and failed notification delivery
before approval. GitHub failure notifications are a separate fallback.

Workflow remains outside .github/workflows, with commented 20:30 UTC cron, contents:read,
concurrency serialization, job timeout and pinned checkout. New default-branch gating
and the district-backup environment require protected environment secrets with
default-branch-only restrictions. Environment protection availability depends on
the repository plan; inability to protect secrets is a blocker, not a reason to
weaken branch controls. Installation steps have no database/storage secrets in their
environment. Review/pin runner/tool versions before activation; no npm install or
application startup is needed by the backup runner.

## Storage recommendation and cost

Recommend **Backblaze B2 pay-as-you-go**, in a dedicated private bucket, for this small
age-encrypted backup set. Its S3 API and custom bucket/prefix-scoped application-key
capabilities permit readFiles + writeFiles without deleteFiles or bucket/key management.
Review listAllBucketNames as an SDK-compatibility metadata exception if required by
the restricted S3 key; do not use a dashboard preset that silently adds deleteFiles.
The writer must not hold master, writeBuckets, writeKeys, deleteKeys, deleteFiles,
writeFileRetentions, writeFileLegalHolds or bypassGovernance capabilities. Use a
separate owner account/key for lifecycle and bucket administration.
Restrict the key to the dedicated bucket and the exact
`district-line/<BACKUP_PROJECT_FINGERPRINT>/` object-name prefix. No actual fingerprint
or credential value is included in this document.

`writeFiles` can hide a current name/delete-marker it or create another version, even
without permanent version deletion. Therefore a no-deleteFiles key is not immutable.
Verify negative permission tests on synthetic objects, including version deletion,
other-prefix access and bucket configuration, and consider a separately approved
30-day default Object Lock for retained versions. Review lock/expiry interaction and
owner recovery of hidden versions before claiming ransomware resistance. If strict
PutObject/GetObject-only permissions with no hide/delete operation are mandatory,
use AWS S3 with an explicit minimal IAM policy instead of claiming B2 exactly matches it.

Use the bucket's actual regional HTTPS S3 endpoint and matching signing region.
Disable public access and public URLs, do not attach a public CDN or website, and
verify anonymous GET/list fail. Existing age encryption remains mandatory. No bucket
has been purchased, configured or tested.

Use `ops/backups/b2-lifecycle-30-days.json` as an unexecuted native-API lifecycle
candidate: current objects remain visible 30 days, then hidden versions are removed
after one more day plus provider processing delay. Budget about 31 daily archive
sizes. The old generic 30-current/30-noncurrent S3 lifecycle can retain bytes roughly
60 days; do not reuse it unchanged. Choose one lifecycle management interface and
inspect existing rules before merging—never overwrite unrelated rules blindly.

Current published B2 storage is **$6.95/TB-month**, with the first 10 GB free, free
egress up to 3x average stored data, and free Class A/B/C API calls. Approximate
steady-state storage, using decimal GB and otherwise unused free allowance:

| Daily encrypted archive | Budgeted stored bytes incl. hidden-day buffer | B2 storage/month |
| --- | --- | --- |
| 100 MB | 3.1 GB | $0 |
| 1 GB | 31 GB | about $0.15 |

These are storage-only estimates, excluding taxes, excess egress, unrelated account
usage and source Supabase egress/compute. A daily verification download is about 30
archive sizes/month; restore drills add transfer. GitHub billed usage depends on the
account allowance/run duration; a 10-minute daily job is roughly 300 runner minutes.
Healthchecks Hobbyist currently supports 20 checks for $0/month. No recurring service
was activated here.

R2 Standard is a reasonable alternative when its permission/retention model is
accepted: 10 GB-month free, then $0.015/GB-month and free direct egress. Its standard
object token is bucket-scoped, not an exact prefix/action IAM policy. Do not claim
PutObject/GetObject-only/no-delete access from the generic object-read-write token.
At roughly 30 GB retained storage its storage cost is about $0.30/month before unit
rounding; actual policy and billing still need review.

Sources: [B2 pricing](https://www.backblaze.com/cloud-storage/pricing),
[B2 S3 key semantics](https://www.backblaze.com/docs/cloud-storage-s3-compatible-app-keys),
[B2 key scopes](https://www.backblaze.com/docs/cloud-storage-application-key-capabilities),
[B2 lifecycle](https://www.backblaze.com/docs/cloud-storage-lifecycle-rules),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[R2 permissions](https://developers.cloudflare.com/r2/api/tokens/),
[Healthchecks pricing](https://healthchecks.io/pricing/).

## Exact environment and secret placement — no secret values

| Location | Names | State/prerequisite |
| --- | --- | --- |
| Vercel backend secret | DATABASE_URL | Existing application connection; preserve method; never put in GitHub backup secrets |
| Vercel backend setting | DATABASE_SSL | TLS required with verification; no remote disable |
| Vercel backend secret | LOGIN_RATE_LIMIT_KEY | New random key, >=32 characters, before activation |
| Vercel backend setting | ENABLE_LOGIN_RATE_LIMIT | Keep false |
| Vercel backend secret | ADMIN_MFA_ENCRYPTION_KEY | Base64 of 32 random bytes, protected offline recovery copy; unrelated to age |
| Vercel backend setting | ADMIN_MFA_MODE | Keep off; future enrollment/enforcement are separate approvals |
| Vercel frontend build setting | VITE_ENABLE_ADMIN_MFA_ENROLLMENT | Keep false; rebuild only for approved enrollment rollout |
| GitHub protected district-backup environment secret | BACKUP_DATABASE_URL | Dedicated backup login only; not the application password |
| Same environment secret | BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY | Restricted storage application-key pair |
| Same environment secret | BACKUP_SUCCESS_PING_URL, BACKUP_FAILURE_PING_URL | Distinct private success/failure monitor endpoints; both mandatory |
| Same environment optional secret | BACKUP_ALERT_WEBHOOK_URL | Additional generic JSON failure destination |
| GitHub repository/environment variables | BACKUP_PROJECT_FINGERPRINT, BACKUP_AGE_RECIPIENT, BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_REGION | Owner-reviewed public configuration; recipient already exists; no identity access needed |
| GitHub repository variable | BACKUPS_APPROVED | Keep absent/false; job-level if is evaluated before protected environment variables become available |
| Workflow constants | BACKUP_DATABASE_ROLE, BACKUP_S3_PREFIX | district_backup and district-line respectively |
| Child-process mappings only | AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION | Derived from the named backup storage secrets/region in that step |
| Future isolated test process only | ISOLATED_REHEARSAL_DATABASE_URL, ISOLATED_REHEARSAL_PROJECT_FINGERPRINT, ISOLATED_REHEARSAL_ALLOW_WRITES | Do not configure until a safe empty baseline target is approved; never substitute current restore/source URL |

Keep existing recovery/session/email configuration unchanged. No SUPABASE_ACCESS_TOKEN,
storage master key or age identity is required by the production backup job. Never put
ADMIN_MFA_ENCRYPTION_KEY or any password in VITE_* variables, logs or artifact uploads.
Secret values should be entered directly in their protected service interfaces.

## Safest activation order — each production action needs separate approval

1. **Unblock isolated verification first.** Owner supplies an empty disposable database
   with the approved baseline; any needed migrations require a separate explicit
   approval. Validate identity/emptiness, run the five tests serially with VM modules,
   then rehearse new limiter/MFA SQL, concurrency, grant denials, browser enrollment/
   recovery and staff compatibility. Until then, neither feature is ready to activate.
2. **Resolve backend transport.** Read control-plane enforcement state, obtain maintenance
   approval for any change/reboot, verify both TLS legs on fresh connections, and obtain
   an adequate answer about hosted upstream identity validation. Test all clients before
   requiring SSL, including recovery tools. Never disable verification to restore access.
3. **Deploy verified application TLS candidate**, after isolated regressions and explicit
   deployment approval. Keep limiter=false, MFA=off and enrollment UI=false. Confirm
   bundle trust assets and diagnostic connection; owner verifies normal production UI.
4. **Provision backup identity and private storage**, only after role/policy/IAM/lifecycle/
   costs are approved and isolated full-row restores pass. Configure protected GitHub
   environment/default-branch rules and monitor delivery. Move the disabled template
   into .github/workflows only after that separate approval; keep cron commented.
5. **Approve one manual backup and isolated offline restore drill**. Require DB audit,
   full archive parser, age success, archive/manifest download checksums, both monitoring
   paths, sequence/security comparison and Data API denials. Do not rerun an earlier
   completed drill as a substitute for this newly restricted-role backup design.
6. **Approve the daily schedule separately**: `30 20 * * *` UTC = 02:00 Sri Lanka next
   day. Call it active only after a scheduled job uploads, verifies and signals success.
7. **Approve limiter migration, deployment and activation separately**, after isolated
   tests. Verify runtime-only grants and tune shared-office thresholds. Maintain a
   separately approved cleanup/monitoring procedure; do not activate a cleanup job here.
8. **Approve MFA migration/enrollment**, ensure every active administrator enrolls and
   stores recovery material, then **separately approve enforcement**. Keep a second
   enrolled owner-controlled admin. Password recovery must never bypass MFA. Do not
   use global mode=off as routine lost-factor recovery.

Any isolated failure, incomplete key/role policy, missing monitor evidence or unresolved
TLS requirement blocks the corresponding activation. No production approval is inferred
from this continuation request.

## Changes in this continuation

- `scripts/security/transport-preflight.mjs`: guarded read-only transport/restore-target
  metadata diagnostic; no application startup or migrations.
- `scripts/backups/database-audit.mjs`, `.test.mjs`: conservative pre-export permission/
  RLS/backend-TLS gate and tests.
- `scripts/backups/run.mjs`, `run.test.mjs`: dedicated-role parser, metadata audit,
  --enable-row-security and corresponding rejection/streaming tests.
- `scripts/backups/heartbeat.mjs`, `heartbeat.test.mjs`: distinct required success/
  failure endpoint configuration, validation and fail signaling.
- `ops/backups/github-actions.yml.disabled`: monitoring preflight/failure step, fixed
  backup role and default-branch/protected-environment wiring; remains inactive.
- `ops/backups/b2-lifecycle-30-days.json`: unexecuted provider-native lifecycle template.
- `ops/backups/README.md`: corrected role, monitor and version-retention guidance.
- `server/test-support/security-local-worker.mjs`: expanded stateful local HTTP checks.
- This report and pointer in the earlier preparation report.

## Verification results

- Full regression suite: **115 total; 110 passed, 0 failed, 5 skipped/blocked**.
  The five real-database tests remain deliberately blocked per the owner's answer.
- Expanded stateful local HTTP authentication test and all backup candidate tests pass.
- Targeted lint of changed JavaScript files: no findings. `git diff --check` passes.
- Source and restore-target diagnostics: read-only, application-side TLS verified;
  backend ssl=false on both. Restore target rejected for fixture use before any writes.
- Backup audit SELECT: syntax/execution pass in a source read-only transaction;
  privileged application credential correctly rejected. No dedicated role was tested.
- Client code/CSS did not change in this continuation; the previously successful
  frontend build was not repeated. No additional browser/production functionality
  verification, real storage upload, monitor delivery or restore has been claimed.
