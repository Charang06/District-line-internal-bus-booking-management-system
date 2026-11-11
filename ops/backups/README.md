# Inactive encrypted daily backup preparation

**Selected provider: Cloudflare R2, deferred by the owner.** No API keys are needed
now. BACKUPS_APPROVED remains false/absent; the workflow remains disabled. Preserve
the encrypted implementation and existing age identity. The B2-specific template
is historical and must not be used for this rollout. Storage/monitor setup and
provider permission review are future backup-only gates, not auth/TLS gates.

Latest readiness review and exact secret placement: see
`../../docs/security-continuation-readiness.md`. That review supersedes older setup
assumptions here. The candidate now REJECTS the application postgres credential,
requires a dedicated district_backup role, and rejects an unencrypted backend hop.

No provider selected, secrets uploaded, resources created, archives exported or
schedules enabled. `github-actions.yml.disabled` is outside `.github/workflows`.
Even after moving it, it has only workflow_dispatch; schedule lines are comments
and the job requires the BACKUPS_APPROVED variable to be true.

## Scope and design

This is an **application database backup** for the present cookie-authenticated
Express system: public schema structure, rows, sequences, indexes, constraints,
triggers/functions and ACLs in a single consistent pg_dump custom archive. It is
not a complete Supabase platform clone. Supabase Auth/storage schemas, Storage file
bytes, custom-role passwords, provider credentials and hosting settings are excluded.
Keep an independently protected infrastructure/secret inventory and arrange a
separate Storage-object backup before claiming full disaster recovery coverage.

The runner uses a PostgreSQL 17 client, the pinned Supabase CA, sslmode=verify-full,
read-only database connections and the session pooler on port 5432 where appropriate.
The project fingerprint must match a configured expected value. Database passwords
are passed through child-process environment variables, never command arguments or
logs. Only pg_dump receives the database password; age and AWS tools do not.

pg_dump output is streamed through age before archive bytes reach disk. Only the
public age recipient goes to GitHub; keep the private identity offline, with at least
two independently protected owner-controlled copies. Never put the private identity
in this repository, GitHub secrets, the backup bucket or Actions artifacts. Losing
the private key makes these backups unrecoverable. The encryption tool authenticates
ciphertext on decryption; public manifest checksums are not a replacement for that.

The runner checks pg_dump, age and pg_restore exit status, the encrypted file
header, SHA-256 and byte size. After upload it downloads the encrypted object again
and compares its checksum. A metadata-only manifest follows only after archive
verification and is read back too. No Actions artifacts, plaintext archive, log dump
or database password is published. The daily candidate uses pg_restore --file=-
with output discarded, alongside the encryption stream, to parse/decompress the full
custom archive without writing plaintext. This catches archive-payload failures but
does not execute SQL or verify target constraints. Ciphertext authentication still
requires the offline private identity during a separately approved restore drill.

## Provider-neutral setup (requires approval)

1. Select a private S3-compatible bucket and HTTPS endpoint. Disable public listing,
   anonymous reads/writes and website hosting. Verify no public bucket policy exists.
   Use separate storage credentials scoped to PutObject/GetObject under
   `district-line/<project-fingerprint>/`; deny bucket-policy, delete and account-admin
   operations. Do not share runtime application keys. OIDC may replace static storage
   keys after provider selection and separate review.
2. Reuse the existing BACKUP_AGE_RECIPIENT public recipient. Do not generate a new
   identity or access the private identity during setup. The owner keeps the existing
   private identity offline for independently approved restore drills.
3. Configure the provider's lifecycle only after approval. The generic
   `lifecycle-30-days.json` expires current versions after 30 days and noncurrent
   versions 30 days after becoming noncurrent; a versioned provider can therefore
   retain bytes for about 60 days. Do not apply this unchanged to B2. The recommended
   B2-native candidate is `b2-lifecycle-30-days.json`: visible for 30 days, then hidden
   one day before deletion, plus provider processing delay. Use one lifecycle interface
   consistently, with an approved prefix. These are templates, not applied policies.
   AWS-shaped lifecycle syntax needs provider compatibility confirmation. The runner
   deliberately cannot delete backups. For providers without lifecycle support,
   prepare a separately approved retention job; do not silently claim 30-day expiry.
   Consider immutability/object lock if the provider offers it; its retention must not
   conflict with lifecycle expiry. Do not create paid storage implicitly.
4. Use protected GitHub repository settings and restrict who can edit backup workflows
   or secrets. The workflow has contents:read only, pinned checkout with credential
   persistence off, no PR/push trigger and no customer-data artifacts. Branch protection
   is required because malicious code on the default branch could read repository
   secrets. Environment approval availability depends on the repository/account plan;
   do not configure daily runs to wait indefinitely for manual review.
5. Configure the following **only after approval**. No actual values belong in reports.

| GitHub location | Name | Purpose |
| --- | --- | --- |
| Secret | BACKUP_DATABASE_URL | Approved backup connection; never VITE-prefixed |
| Secret | BACKUP_S3_ACCESS_KEY_ID | Prefix-scoped storage access |
| Secret | BACKUP_S3_SECRET_ACCESS_KEY | Prefix-scoped storage secret |
| Optional secret | BACKUP_ALERT_WEBHOOK_URL | Approved generic HTTPS JSON alert endpoint |
| Secret | BACKUP_SUCCESS_PING_URL | Independent monitor's private HTTPS success endpoint |
| Secret | BACKUP_FAILURE_PING_URL | Independent monitor's distinct private HTTPS failure endpoint |
| Variable | BACKUP_PROJECT_FINGERPRINT | Owner-confirmed 12-character SHA-256 project fingerprint |
| Variable | BACKUP_AGE_RECIPIENT | Public age1 X25519 recipient; not private identity |
| Variable | BACKUP_S3_ENDPOINT | Selected provider HTTPS endpoint |
| Variable | BACKUP_S3_BUCKET | Private bucket name |
| Variable | BACKUP_S3_REGION | Provider region, or auto where supported |
| Variable | BACKUPS_APPROVED | Remains absent/false until owner approves execution |

The candidate now requires BACKUP_DATABASE_ROLE=district_backup and accepts only that
direct username or its project-qualified pooler username. Before export, a metadata-only
audit requires backend TLS, no elevated role/membership/ownership/write grants, complete
SELECT coverage and narrowly scoped SELECT-only RLS policies, plus read-only sequence
access. pg_dump uses --enable-row-security after these checks. No existing RLS is
disabled, and no BYPASSRLS or runtime-role credential is allowed. Callable non-system
SECURITY DEFINER functions fail the conservative audit and require owner review.
Provisioning that role and its policies is a separate approval item; none were created.
Do not change schema/policies during an export; the audit and dump use separate sessions.
The exact grant/policy inventory and isolated full-row restore still need verification.
Use a dedicated trusted backup repository/runner if the application repository's
write access is broader than the database trust boundary.

## Schedule, retention and failure alerts

Requested daily time: **02:00 Asia/Colombo**, equivalent to `30 20 * * *` UTC on the
preceding date. Activate only after a manual backup and successful restore drill.
GitHub schedules can be delayed or dropped; this is approximately daily recovery,
not guaranteed 24-hour RPO and not PITR. Monitor successful backup age independently.

Subscribe the responsible owner to Actions failure notifications. The workflow also
adds a failure summary and, when configured, calls the approved generic webhook with
only an event name and GitHub run URL. Endpoint-specific payloads may need adaptation
after selecting an alert provider. No alert was sent in this task. A missed run cannot
send its own failure alert: use an independent monitor that alerts if the last verified
backup is older than 26 hours. Set a 24-hour period plus 2-hour grace on an independent
monitor, route alerts to the owner, and configure BACKUP_SUCCESS_PING_URL and the
distinct BACKUP_FAILURE_PING_URL. Both are required by a no-network config preflight
before export; failed jobs send an immediate failure ping. The workflow
sends an empty success POST only after archive AND manifest uploads have passed
download/checksum verification. Missing configuration or failed delivery fails the job.
Prove missed-run alert delivery using synthetic monitor traffic before activation.
Provider selection and alert routing remain setup/approval items. Lifecycle deletes old backups even if recent runs fail, so stale-backup
monitoring is an activation prerequisite.

Thirty daily copies use roughly 30 times the compressed archive size plus manifests.
Each validation downloads ciphertext from external storage. Review the Supabase Free
egress allowance, GitHub Actions allowance, storage/GET/PUT fees and provider lifecycle
support before activation; this template does not promise zero cost or create resources.

## Restore drill and recovery

Do not execute against production or the current populated restore copy without
explicit target approval. Use an approved disposable target, keep its Data API
inaccessible during restoration, and verify its fingerprint differs from production.

1. Retrieve the encrypted object and matching manifest. Compare ciphertext SHA-256
   and byte size to the manifest from the trusted inventory. Treat archives as sensitive
   even though encrypted. Use reviewed PostgreSQL 17 and age binaries.
2. On a trusted recovery machine, authenticate/decrypt with the offline identity and
   parse the complete archive without writing a plaintext archive. Then inspect the
   TOC, draining the remaining stream so early TOC exit does not mask age authentication:

   ```bash
   set -euo pipefail
   age --decrypt --identity "$AGE_IDENTITY_FILE" application.dump.age | pg_restore --file=/dev/null
   age --decrypt --identity "$AGE_IDENTITY_FILE" application.dump.age |
     { pg_restore --list; cat > /dev/null; } > restore-toc.txt
   ```

3. Confirm the dump scope, owners, external prerequisites and target state. Supabase
   target defaults can reintroduce anon/authenticated grants even if source ACLs were
   protected. Prepare a target-specific, reversible handling of those defaults and
   required roles **before** restore; do not use --no-acl to hide security differences.
   Do not blindly replay managed roles or platform schema changes. Preserve owner/
   service access and explicitly compare effective privileges after restoration.
4. For a separately approved disposable target with prepared schema/defaults, set
   PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD through a private process environment,
   PGSSLMODE=verify-full and PGSSLROOTCERT to the verified CA. Then the candidate
   restore command is:

   ```bash
   set -euo pipefail
   age --decrypt --identity "$AGE_IDENTITY_FILE" application.dump.age |
     pg_restore --clean --if-exists --exit-on-error --single-transaction --schema=public --dbname="$PGDATABASE"
   ```

   --clean can drop public application objects: it is restricted to the explicitly
   approved disposable target. It is never a production repair command.
5. Compare schema, RLS/policies/grants, row counts/data checksums and sequence state
   against a source manifest captured from the same logical snapshot or an independently
   approved reference. The current upload manifest has archive metadata, not per-table
   snapshot checksums; full logical equivalence requires that additional reference.
   Re-run the focused synthetic administrator/staff login, booking, finance and recovery
   checks with external side effects mocked. Verify browser-role denial after restore.
6. Record restore duration, archive ID, target fingerprint, schema/data/security results
   and rollback outcome. Only a completed drill establishes a usable recovery candidate.
   Repeat a drill monthly and after schema/security changes, with separate isolated
   execution approval as needed. Keep older known-good recovery candidates until the
   new one passes, subject to the agreed retention policy.
7. For a real incident, preserve current live data and determine the lost-write window.
   Restore into isolation first, reconcile subsequent bookings, then obtain explicit
   cutover approval. Recover Storage files/configuration separately. Revoke old restored
   sessions and outstanding recovery links under a separately approved incident procedure.

## Validation completed in this preparation

Focused Node tests cover approval/project/TLS/storage guards, separation of child
process credentials, streaming/error handling, and success-monitor HTTPS/failure behavior.
External tools are mocked in the streaming test. No real encrypted export, S3 upload,
retention application, alert delivery or encrypted-archive restore has been run.

Official references:

- [Supabase Free backup guidance and Storage exclusions](https://supabase.com/docs/guides/platform/backups)
- [PostgreSQL signed Ubuntu packages](https://www.postgresql.org/download/linux/ubuntu/)
- [age encryption](https://github.com/FiloSottile/age)
- [GitHub schedule limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
