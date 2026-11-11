# Remaining security improvements — preparation report

Continuation readiness findings supersede the earlier role/monitor assumptions below:
see [security-continuation-readiness.md](security-continuation-readiness.md). The five
isolated tests are explicitly blocked because no safe disposable database is available.

Prepared locally on 2026-11-09 (Asia/Colombo). Nothing deployed. No production data,
migrations, schedules, bucket settings, notifications or MFA policy were changed.
Migration 007 was not edited or rerun. Existing unrelated workspace changes were
preserved. The age private identity was not accessed. Backups are NOT active.

## Findings and resulting behavior

| Area | Gap | Candidate change |
| --- | --- | --- |
| Backups | Inactive draft proposed 03:17; TOC-only validation; missed-run monitoring unspecified | Inactive 02:00 Sri Lanka cron (20:30 UTC preceding day), full archive stream parsing, verified ciphertext/manifest download, mandatory success heartbeat integration |
| TLS | Express used rejectUnauthorized:false and accepted remote plaintext via DATABASE_SSL | Pinned existing Supabase CA, hostname verification, TLS >=1.2, no SSL URL override, original host/port preserved; plaintext only nonproduction localhost |
| Login | No login limiter; inactive-account response distinguished usernames | Persistent atomic PostgreSQL account/IP/account-IP counters, generic credential failures including inactive accounts, bounded inputs and dummy password comparison |
| MFA | Password-only administrator sessions | Disabled-by-default TOTP enrollment, challenge/verify, encrypted seeds, recovery and enforcement stages; staff password flow retained |
| Finance | No current owner browser evidence | Separate read-only owner checklist; no production financial writes or browsing claimed |
| Tests | Default Node discovery included operational test-rollback.mjs | npm test targets only named *.test files; operational scripts remain outside automatic discovery |

## Files in this preparation

- `ops/backups/github-actions.yml.disabled`, `ops/backups/README.md`: modify the
  pre-existing untracked backup draft; remain outside .github/workflows.
- `scripts/backups/run.mjs`: full archive parser alongside age; payload validation
  recorded in manifest. `run.test.mjs` now checks the full-parser path and failures.
- `scripts/backups/heartbeat.mjs`, `scripts/backups/heartbeat.test.mjs`: new success-only
  independent-monitor integration and mocked tests.
- `server/database-tls.js`, `server/database-tls.test.js`: new runtime TLS config/tests,
  reusing the existing pinned `certs/supabase-prod-ca-2021.crt` and trust helper.
- `server/login-rate-limit.js`, `server/login-rate-limit.test.js`: new limiter/tests.
- `server/migrations/008_login_rate_limits.sql`: new manual-only table, RLS and client
  grant revocations. It is deliberately absent from startup migration registration.
- `server/admin-mfa.js`, `server/admin-mfa.test.js`: new staged service, PostgreSQL
  transaction adapter, router and tests.
- `server/migrations/009_admin_mfa.sql`: new manual-only protected state table and
  nullable auth_sessions.mfa_verified_at column; no existing sessions/data updated.
- `server/server.js`: pool, login middleware, uniform credential failures, MFA route
  wiring, conditional MFA session check and challenge branch.
- `src/api.js`, `src/App.jsx`: MFA calls and challenge form using existing classes;
  no CSS redesign. Existing unrelated App changes predate this work.
- `src/components/AdminMfaEnrollment.jsx`, `src/components/AdminProfile.jsx`: optional
  enrollment/recovery card, hidden unless its build flag is enabled.
- `server/test-support/booking-app.js`: add a restricted synthetic security-env override
  to the existing local harness, preserving earlier changes.
- `server/test-support/security-local-worker.mjs`, `server/security-http.test.js`: run
  actual login/MFA/staff route definitions locally with fake PostgreSQL/providers.
- `.env.example`, `vercel.json`, `package.json`: configuration names, bundle trust
  assets and explicit safe test discovery.
- `docs/finance-owner-verification.md`, this report: verification and rollout procedures.

## Validation and limits

Read-only live connectivity passed against the already configured database, using
the new runtime config without booting Express or running startup migrations:
SELECT 1 succeeded, application's TLS socket encrypted=true, authorized=true,
TLSv1.3. No application records were read. The sandbox initially blocked networking;
the scoped read-only retry passed. A pooler's pg_stat_ssl row describes its separate
backend connection, not the application's TLS socket; it must not be used as proof
of client-side TLS. The initial pg_stat_ssl probe returned ssl=false for that separate
backend hop. Review Supabase's managed pooler-to-database transport/enforcement before
claiming end-to-end transport coverage; no provider settings were changed here.

Local tests cover RFC 6238 vectors, seed tamper/wrong-key/user-binding rejection,
enrollment proof/expiry, no session before MFA, replay rejection, challenge expiry,
password-change invalidation, one-use recovery and session revocation, recovery-code
rotation, limiter cooldowns/distributed accounts/shared-office IP behavior, unavailable
limiter store, and unchanged staff/credential behavior over local HTTP.

Tests mock PostgreSQL/provider operations. They do not prove real database concurrency,
new migration compatibility, provider lifecycle/alerts, ciphertext cryptographic
authentication, successful SQL restore or browser layout. Existing isolated database
tests remain gated and skipped without an approved synthetic database. Before any
production activation, rehearse 008/009, concurrent limits/recovery, grant denials,
and full HTTP/browser flows on an empty isolated clone. No production finance changes
are permitted to obtain test coverage. Build and lint results are recorded in the
final verification section below.

## Configuration — names only

Existing server secret: DATABASE_URL. Existing server setting: DATABASE_SSL (never
disable remotely). New server secrets: LOGIN_RATE_LIMIT_KEY (at least 32 random
characters), ADMIN_MFA_ENCRYPTION_KEY (base64 of 32 random bytes). New settings:
ENABLE_LOGIN_RATE_LIMIT, ADMIN_MFA_MODE, VITE_ENABLE_ADMIN_MFA_ENROLLMENT.
Keep the AES key in Vercel server environment and separately protected recovery
inventory; it is unrelated to age. Never VITE-prefix either server secret.

GitHub secrets: BACKUP_DATABASE_URL, BACKUP_S3_ACCESS_KEY_ID,
BACKUP_S3_SECRET_ACCESS_KEY, BACKUP_SUCCESS_PING_URL; optional
BACKUP_ALERT_WEBHOOK_URL. GitHub variables: BACKUPS_APPROVED,
BACKUP_PROJECT_FINGERPRINT, BACKUP_AGE_RECIPIENT, BACKUP_S3_ENDPOINT,
BACKUP_S3_BUCKET, BACKUP_S3_REGION. Workflow environment: BACKUP_S3_PREFIX,
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION.
No private age identity belongs in GitHub, Vercel, the app or the bucket.

## Backups and external setup

Follow `ops/backups/README.md` for bucket/IAM, 30-day lifecycle and isolated restore
steps. Use the EXISTING public recipient. Supply an owner-selected private HTTPS
S3-compatible bucket with prefix-scoped PutObject/GetObject credentials, lifecycle
support and verified public-access denial. Select an independent dead-man monitor
with a 24-hour expected success period plus 2-hour grace, owner alert routing and an
empty POST-compatible private success URL. An unscheduled/deactivated workflow must
still trigger this external monitor. Test both failed-job and missed-job alerts using
synthetic traffic before relying on them. No provider or credentials were configured.

Thirty daily archives require approximately 30 x compressed/encrypted daily archive
size. Monthly transfer is about 30 x archive size into storage plus 30 x archive size
read back for verification, with >=60 writes and >=60 reads including manifests.
Retention applies to manifests too. Confirm lifecycle deletion/versioning semantics;
retaining daily backups means expiration after 30 days, not guaranteed exact deletion
at the 30th day. GitHub schedule delivery can be delayed/dropped; this is no PITR or
guaranteed 24-hour RPO. Keep backup verification and restore drills separate claims.

Costs are provider/account dependent: storage GB-month + requests + download egress,
Supabase dump egress/database load, GitHub runner minutes, and monitoring plan. No
new recurring expense has been incurred or approved. Rate limiting and MFA reuse
PostgreSQL and Node crypto with no new paid SaaS dependency. Obtain an actual storage/
monitor quote against archive size and existing plan allowances before activation;
do not assume free-tier allowances will cover it.

Illustrative option only, not selected or configured: R2 Standard lists 10 GB-month
free and $0.015/GB-month beyond that. At 100 MB/day, 30 retained copies are roughly
3 GB, so storage could be $0/month if the account's free allowance is otherwise
unused and requests stay within allowance. Healthchecks offers a free hobby tier;
GitHub runner use must be checked against the account's current included usage.
These examples exclude database egress/compute and are not a guaranteed bill.
See [R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[monitor pricing](https://healthchecks.io/pricing/) and
[GitHub included usage](https://docs.github.com/en/billing/reference/product-usage-included).

## Independent production approval gates

1. **TLS deployment approval:** review this diff and successful read-only TLS result;
   rehearse app/staff/recovery/finance flows in isolation, preview the Vercel bundle
   with the CA/helper included, then approve TLS code deployment. Keep both new auth
   features off. Verify login and SELECT 1 after deployment. If certificate delivery
   fails, fix packaging/configuration; never restore rejectUnauthorized:false or
   disable verification. Do not roll back to the insecure pool implementation.
2. **Backup storage/manual-run approval:** choose provider, IAM scope, region, lifecycle,
   alert recipients and monitor, review estimated costs and current PostgreSQL major
   version. The draft requires PostgreSQL 17 tools; a newer server requires a reviewed
   compatible client update. Add only named secrets/public vars, move the draft to
   .github/workflows only after approval, keep cron commented and set BACKUPS_APPROVED
   only for approved execution. Run one encrypted upload, verify archive and manifest
   downloads and perform an owner-controlled isolated restore drill using the offline
   identity. Keep Data API disabled during restore; verify all RLS/grants and sequence
   state afterward. A successful upload alone is not a restore test.
3. **Daily schedule approval:** after gate 2 and monitor/lifecycle checks, separately
   approve uncommenting `30 20 * * *`. Only call backups active after an actual
   scheduled run uploads and verifies the encrypted archive and reaches the monitor.
4. **Limiter migration approval:** rehearse and then separately approve manual 008.
   Check that the intended runtime database role can access it and anon/authenticated/
   PUBLIC cannot. The migration does not change 007 or schema_meta. Deploy the code
   with the flag off first. **Limiter activation approval:** separately approve
   ENABLE_LOGIN_RATE_LIMIT=true and provision LOGIN_RATE_LIMIT_KEY. Test synthetic
   success/failure/cooldown/shared-IP/recovery behavior in isolation before the switch.
   Rollback is flag=false (removes new protection; use incident approval), keeping
   the protected additive table for diagnosis. Never remove existing recovery limits.
5. **MFA migration/enrollment approval:** rehearse and separately approve manual 009,
   key custody/restore, and ADMIN_MFA_MODE=enroll plus the frontend enrollment flag.
   This stage does NOT require MFA at login. Each existing administrator enters their
   current password, adds the displayed setup key to an authenticator and confirms a
   six-digit code. Pending setup lasts ten minutes. Confirmation revokes their existing
   sessions and returns ten 128-bit recovery codes once. Save offline before closing;
   nothing is saved to localStorage or logged. If response loss occurs, the still-working
   authenticator plus password can replace codes via the same profile card. Replacement
   invalidates all older codes, requires an unreplayed authenticator code and revokes
   sessions. Validate recovery against synthetic accounts in isolation, not by silently
   changing production MFA policy. Enroll every active administrator before gate 6.
6. **Mandatory MFA approval:** obtain separate explicit approval only after each active
   administrator's enrollment and offline recovery custody are verified, isolated
   recovery/replay/revocation tests pass, and the limiter is on. Set mode=enforce.
   Password success returns a five-minute hashed bearer challenge, not a session.
   One outstanding challenge per admin; replacement invalidates the earlier one. Five
   failures per 15-minute account window; challenge issuance does not reset failures.
   TOTP uses 30-second steps with +/-1-step skew and persistent replay prevention.
   Successful proof consumes the challenge and creates a verified session in the SAME
   user-row-locked transaction. Existing administrator sessions lacking MFA proof are
   denied immediately; staff session behavior is unchanged. Unenrolled administrators
   are denied, so inventory and a second enrolled owner-controlled admin are prerequisites.
   Password-reset email never bypasses MFA. A one-use recovery code after password proof
   can sign in, revokes prior sessions, and can be followed by recovery-code replacement
   if the authenticator remains accessible. The new session keeps ordinary 30-minute
   idle/8-hour absolute expiry. Sessions and challenge state are never returned publicly.

If all authenticators/recovery codes are lost, contact the owner through an established
out-of-band channel; no email-only MFA reset or public disable endpoint exists. Verify
identity independently, preserve audit evidence, and obtain a separate targeted reset/
re-enrollment incident approval using database-owner access. Do not toggle all admins to
enroll/off as a routine recovery shortcut. Lost encryption keys require recovering the
protected AES key or owner-approved factor replacement. Key rotation requires decrypt/
reencrypt of enrolled seeds and pending setups in isolation first; replacing the env key
alone will lock administrators out. Turning enforce back to enroll/off weakens protection
and requires a separate explicit incident decision. Do not drop columns/tables blindly.

## Remaining risks and required checks

- New SQL/adapter behavior has local mock coverage, not a live isolated 008/009 rehearsal.
  Verify SERIAL/identity types, effective privileges, transaction rollback, simultaneous
  attempts, password/reset races and one-winner recovery consumption on the chosen clone.
- Fixed 15-minute limits are 8 account/IP, 15 account across IPs, 300 IP across accounts;
  counts include successful attempts. They bound abuse but a targeted attacker can
  temporarily deny a known account, and a busy office can reach the shared-IP ceiling.
  Tune from sanitized counts only; no unconditional account whitelist.
- Use direct Vercel ingress with its overwritten forwarding header and trust proxy=1;
  review any extra upstream proxy. IPv6 keys aggregate /64. Do not trust arbitrary
  client-supplied IP headers on a separately exposed origin.
- Expired limiter rows need a separately approved daily maintenance task:
  DELETE FROM public.login_rate_limits WHERE window_started_at < CURRENT_TIMESTAMP -
  INTERVAL '2 days'; run in bounded batches during high volume. No cron/cleanup writes
  have been activated here. Monitor row count/storage and request/database load.
- MFA uses application-encrypted secrets; a compromised app plus its key can decrypt
  seeds. TOTP is phishable; WebAuthn can be a later separately reviewed improvement.
- Client UI uses existing navy/gold classes. Confirm mobile keyboard, long recovery
  codes, enrollment close/reopen and recovery response-loss flows in an isolated browser.
- Public-schema backups exclude Storage object bytes/managed schemas/provider secrets;
  do not advertise complete platform disaster recovery. Backup credentials currently use
  an existing powerful database role; provision a reviewed least-privilege backup identity
  before activation where supported. Full ciphertext authentication requires an offline
  restore drill; checksums alone do not establish authenticity against bucket tampering.
- Owner finance browser verification remains pending; use the separate checklist.

## Final verification

- `npm.cmd test`: 113 tests, 108 passed, 0 failed, 5 explicitly skipped isolated
  PostgreSQL integration checks. No external emails/SMS, backup uploads or restore jobs.
- `npm.cmd run build`: passed. Existing CSS is unchanged; normal build keeps enrollment
  hidden by default. Responsive/browser visual verification remains an isolated check.
- `npm.cmd run lint`: exited successfully with existing warnings in the workspace;
  the targeted new security modules/component passed lint with no findings.
- `git diff --check`: passed. Existing unrelated changes/untracked artifacts retained.
- Read-only live TLS test: SELECT 1 passed; application socket TLSv1.3, encrypted and
  certificate-authorized. No Express startup, migrations or application data reads.

No deployment or activation is authorized by these test results. Each production gate
above requires its own explicit approval after its listed prerequisites are satisfied.

## Official references

- [Supabase verified database connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [node-postgres SSL connection-string override behavior](https://github.com/brianc/node-postgres/blob/master/docs/pages/features/ssl.mdx)
- [Vercel request forwarding headers](https://vercel.com/docs/headers/request-headers)
- [RFC 6238 TOTP](https://www.rfc-editor.org/info/rfc6238/)
- [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Independent monitor HTTP integration](https://healthchecks.io/docs/http_api/)
