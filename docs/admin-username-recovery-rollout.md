# Administrator Forgot Username — original test database activated

Scope: administrator Forgot Username only. No email-based login, automatic email verification, username/password changes, or edits to existing user records. Staff continue to contact their administrator. Existing password recovery and sessions retain their current implementation.

## Current status — 6 November 2026

The owner explicitly approved: **“Approve migration 005 on the original test database.”** The exact reviewed migration was applied manually and verified successfully on that database. Applied versions are 1–5. No migration was applied to the separate restore project, which remains a restored copy of versions 1–4.

- Existing account schema and all 18 existing application-table data checksums were unchanged across migration and subsequent integration tests. No existing user, password, permission, booking, password-recovery or session record was modified by this work.
- Both new tables have row-level security enabled; Supabase client roles have no table or sequence access; the invalidation trigger is enabled.
- The reviewed rollback script passed a real PostgreSQL dry run inside a transaction that was then rolled back. Migration 005 remains applied.
- Two real PostgreSQL integration tests passed: SQL/token expiration/rate limits/account-change invalidation/client permissions, and concurrent single-use redemption. Fixture accounts existed only within a rolled-back transaction, used explicit negative IDs, and did not change the existing user sequence. The concurrency test removed only its own generated token. No recovery tokens or rate-limit entries remained after these tests. No real emails were sent.
- Local `.env` now enables `ENABLE_ADMIN_USERNAME_RECOVERY=true` and `VITE_ENABLE_ADMIN_USERNAME_RECOVERY=true`. All connection, email and canonical-origin settings were preserved. Email configuration validates; the canonical origin is local.
- Frontend build passed with the feature enabled. Restart an already-running local development server to load the backend environment flags. This does not activate or deploy any separately hosted environment.
- Live email delivery and a complete live browser-to-email round trip remain untested. Test by requesting a link at the registered administrator recovery email, opening it on the computer serving the local application, selecting **Show my username**, and returning to the existing username/password login.

### Refreshed pre-migration backup

Only login-session state had changed since the first verified snapshot. A new full archive was created and its application data, schema and sequence states were reverified on the separate restore project before executing migration 005. That project's prior data was verified against the earlier snapshot before replacing only its copied session data; no original database session was changed.

- Restricted directory: `C:\Users\Abbishathanan\AppData\Local\DistrictLine\Backups\test-2026-11-06-1312f8d1`.
- Archive: `database.dump`, 438,413 bytes; source manifest covers 57 tables.
- SHA-256: `36edcc0507c23560931c6897b53245e0a719ec5db59c85273b8f46dd8ed41580`.
- Restore verification: all 18 application tables, application schema and 16 sequence states match. Supabase-managed schemas/defaults were preserved as documented below; no exact full-platform-clone verification is claimed.
- Private audit files include `executed-migration-005.sql`, `migration-005-result.json`, `postgres-tests-result.json`, `postgres-username-recovery-tests.log`, and `post-migration-verification.json`. The executed SQL hash is `8ba60a6fddeecd19c9b9354b4713a3ed7c41730f2d415c40dc8a876c28e354e0`. The repository migration header was updated after execution to record its applied status; its SQL operations were not changed.

## Environment and read-only audit (6 November 2026)

- The locally running application uses a **remote Supabase PostgreSQL 17.11** database.
- `NODE_ENV`, `VERCEL_ENV`, and an explicit database-environment label are unset. `APP_URL` points to a local origin. These do **not** establish whether the remote database is development, staging, or production.
- The owner subsequently confirmed the configured project contains **only test data**. It is classified as development/test for this rollout. This is not production migration approval; the final migration-confirmation gate still applies.
- Audit: one administrator; zero duplicate, missing, invalid, or noncanonical administrator recovery emails; no usernames containing `@`. Applied migrations: 1–4.
- Only aggregate audit findings were printed. No addresses, credentials, usernames, or account IDs were logged.
- Email configuration values exist; live delivery has not been tested.

## Backup status — full archive created; application restore verified

On 6 November 2026, after the owner confirmed this is a test-data project, portable PostgreSQL 17.11 client tools were downloaded from the official EDB distribution into temporary storage. No system installer/service was used. A full logical source-database archive was created through the Supabase session pooler with a read-only transaction and exported snapshot. No schema/data exclusions were used. A matching row-count/data-checksum manifest covers 57 source tables. Role metadata was exported separately without infrastructure role passwords. The source database was not changed.

- Restricted-access directory outside the repository: `C:\Users\Abbishathanan\AppData\Local\DistrictLine\Backups\test-2026-11-06-08eef535`.
- Archive: `database.dump`, 438,505 bytes.
- Archive SHA-256: `0675e397466b260a8abf7af56a67fb5a29fd31f1d4781cd62b49a3781e39f504`.
- `pg_dump`, role export and `pg_restore --list` all exited successfully (0).
- Private backup directory also contains the source manifest, archive contents, tool logs and `backup-report.json`. No account data was printed in chat/tool output.
- The owner configured `USERNAME_RECOVERY_RESTORE_DATABASE_URL` in `.env`. Read-only preflight confirmed a **different Supabase project**, PostgreSQL 17.11 with matching extension versions, no application tables, and zero Auth users, Storage objects or Vault secrets. Neither URL nor credentials were printed. `DATABASE_URL` remains unchanged.
- **Application restore verification passed** in that separate project. All 18 application tables match the archived snapshot's row counts and MD5 data checksums; application schema SQL matches, including application constraints, indexes, functions, triggers and grants; all 16 identity/sequence states match. Restored application migration history is exactly 1–4. The original/source database was not changed.
- This is **not an exact clone of all Supabase-managed schemas**. The new project's Realtime/Storage migration metadata differs from the source. Managed schemas, the existing public schema container and its standard USAGE grants, and Supabase-owned default privileges were preserved. They are excluded from the application-schema comparison; the complete original archive remains unchanged and contains the original managed metadata.
- An initial transactional restore failed on a Supabase-owned default-privilege operation and rolled back. Retrying while preserving those managed defaults completed with exit code 0. Detailed reports and private logs are in the restricted backup directory (`restore-preflight.json`, `managed-data-preflight.json`, `application-restore-report.json`). The restore project now contains the restored application data and is no longer empty.
- No Vault secrets or Storage object records were present in the source snapshot. External platform encryption keys and storage-file contents are not included in a logical database archive; those broader platform recovery capabilities have not been verified.
- This original backup was superseded for execution by the refreshed backup documented above. Final approval was received and migration 005 was applied only to the original test database. It remains excluded from automatic startup migrations to prevent unapproved changes to another environment.

The following backup procedure has been completed for the application scope described above. Do not infer full-platform clone verification from these results:

1. Confirm the source environment/project privately with the owner. Confirm credentials give sufficient access for a complete logical database backup, including every application schema/table, sequence, function, trigger, index and constraint. Record any provider-managed exclusions; do not claim a partial export is complete.
2. Create a full custom-format `pg_dump` archive of the source database; preserve schema, data, ownership/ACL metadata where accessible. Use a password file or environment variables, never credentials in logged command arguments. Store the archive outside the repository with restricted access; do not attach it to chat.
3. Record the archive size, timestamp, tool version and SHA-256 checksum. Require `pg_dump` to exit successfully with no missing-object or permission errors.
4. Inspect the archive with `pg_restore --list`. This is an archive check, **not** proof of restorability.
5. Restore into an explicitly approved empty isolated database. Match required roles/extensions or document provider-specific restore steps. Require error-free restoration and compare source-snapshot and restored schema objects, table row counts and relevant data checksums, including user and booking data. Use a consistent source snapshot or quiesce writes so comparisons are meaningful.
6. Keep the original archive unchanged and provide the owner a sanitized verification report. No migration until that report, the exact SQL, the environment and the rollback plan have been reviewed and final execution approval is given.

No migration approval is assumed from permission to inspect, back up, implement, or test local code.

## Exact files prepared

- `server/admin-username-recovery.js`: separate admin-only request/confirmation routes, email sender, PostgreSQL token store and persistent rate limits.
- `server/admin-username-recovery.test.js`: isolated service and HTTP security tests; no configured-database access.
- `server/admin-username-recovery.postgres.test.js`: explicitly opt-in real PostgreSQL integration tests; never connects to `DATABASE_URL` during ordinary `npm test`.
- `server/server.js`: mounts the new routes only; existing login, password reset, session and authorization handlers are unchanged.
- `server/migrations/005_admin_username_recovery.sql`: exact proposed forward SQL.
- `scripts/rollback-admin-username-recovery.sql`: exact proposed reverse SQL.
- `src/components/UsernameRecoveryForm.jsx`: email request and explicit link-confirmation UI.
- `src/api.js`: two username-recovery API calls.
- `src/App.jsx`: gated Forgot Username link and recovery UI. Login still asks for a username, not an email.
- `src/App.css`: a single recovery-note style; existing branding and layout rules are unchanged.
- This document: review, backup and rollout instructions.
- `.env.example`: disabled-by-default backend/frontend activation flags for other environments. Local `.env` enables them only for the approved original test database; credentials are not committed.

## Migration effects and risks

Review **all** SQL in `server/migrations/005_admin_username_recovery.sql` before any execution on another environment. It was applied manually to the approved original test database and is deliberately **not registered** in `DATABASE_MIGRATIONS`, so application startup cannot automatically apply it elsewhere. Do not rerun it on a database already at version 5.

The transaction obtains the existing migration advisory lock, briefly locks `users`, and aborts on duplicate normalized administrator recovery emails. It creates only:

- `admin_username_recovery_tokens` and its indexes: SHA-256 token hashes, administrator FK, normalized email snapshot, expiry/use timestamps.
- `admin_username_recovery_limits` and its indexes: hashed scope-specific rate-limit keys and attempt counts.
- A function and trigger that invalidate only the new username-recovery tokens after a future change to recovery email, username, role or account status.
- Migration metadata entry 5.

It does **not** alter/update existing account records, normalize stored addresses, enforce a new uniqueness constraint on `users`, mark addresses verified, or touch existing password-recovery tokens, sessions, roles or booking data. Uniqueness enforcement and verified-email login belong to the superseded email-login scope. For Forgot Username, ambiguous administrator email matches fail closed both at issue and redemption time. If conflicts appear, the owner must resolve them explicitly; no automatic account merging or rewriting occurs.

Risks: a short `users` lock may briefly wait on writes; a five-second lock timeout aborts rather than blocking indefinitely. Existing user relationships are preserved. Future account edits also invalidate outstanding username-recovery tokens. The migration enables row-level security on the new tables and revokes public/Supabase `anon`/`authenticated` access to those tables and their identity sequence. Before rollout, verify the server-only database role owns these objects or has an explicitly reviewed server access policy; never grant client access to make the feature work.

## Flow and activation

These rollout steps remain the checklist for any other environment. The original test database has completed the approved migration, verification and local configuration steps described above. Production still requires separate explicit approval.

1. Until rollout, leave `ENABLE_ADMIN_USERNAME_RECOVERY` and `VITE_ENABLE_ADMIN_USERNAME_RECOVERY` unset/false. Backend requests return a generic unavailable response without accessing the new tables; the frontend link is hidden.
2. After environment identification, verified backup and **final explicit migration approval**, apply the reviewed SQL in a controlled database session. Do not start the backend just to execute this migration.
3. Validate the real PostgreSQL migration, FK/trigger behavior, account-change invalidation (including change-and-revert), concurrent single-use redemption and rate-limit upserts on an isolated copy first. Test the rollback there as well. Unit tests do not prove these database properties.
4. Confirm `APP_URL` is the correct canonical application origin (HTTPS in production) and the existing Resend sender is configured. Set backend `ENABLE_ADMIN_USERNAME_RECOVERY=true` and frontend build-time `VITE_ENABLE_ADMIN_USERNAME_RECOVERY=true`, then rebuild/redeploy only with authorization for the target environment.
5. The admin requests a link using the registered recovery email. The HTTP response is generic for known, unknown, disabled, staff and ambiguous addresses. Limits: 20 requests/IP/15 minutes; one request/email/15 minutes. No usernames appear in request responses or email bodies.
6. The email contains a cryptographically random 256-bit token in the URL fragment; only its hash is stored. It expires after 20 minutes. Opening the page removes the fragment and does not consume the token. The explicit **Show my username** POST consumes it once and reveals the username. Redemption has a separate 20-attempt/IP/15-minute limit. These limits do not share password-recovery counters.
7. No login cookie is issued and no session is created/revoked. Return to the existing login form and use the existing username/password. Possessing the link does not mark an email as verified.
8. Arrange retention/cleanup for expired rows in the two new tables only. This maintenance is separate from the migration and must not delete users or existing password-recovery data.

## Rollback

If forward migration fails, PostgreSQL rolls back the whole transaction. Do not continue to activation.

For post-deployment rollback:

1. Disable the frontend flag and deploy the hidden-link build. Disable the backend flag and drain active username-recovery requests.
2. With explicit approval, execute `scripts/rollback-admin-username-recovery.sql` in its transaction. It drops only the new trigger/function/tables and removes migration entry 5. Never use `CASCADE` against existing application tables.
3. Outstanding username-recovery links stop working. No user, password, permission, booking or original password-recovery record is restored/replaced/deleted by this rollback.
4. If a broader restore is required, restore the verified archive into an isolated environment first. A full in-place restore could overwrite subsequent business transactions and requires separate owner approval; it is not the default rollback.

## Validation status

- Local tests: new service/HTTP tests use synthetic accounts, an in-memory store and a mocked email sender. No live mail or remote writes.
- Actual PostgreSQL application-backup restoration, migration 005, real token/rate-limit/trigger/permission tests and a rollback dry run have passed on the approved test environment. Production sign-in and live email delivery remain untested.
- No dedicated type-check script is configured.
- Latest `npm test`: 25 passed, 3 skipped (one existing legacy integration test and two explicitly opt-in PostgreSQL tests). The two opt-in tests were also run separately against the approved database and both passed. The normal suite includes 14 username-recovery service/HTTP tests.
- `npm run build`: passed. `npm run lint`: completed successfully with existing warnings. Node syntax and Git whitespace checks passed.
- Chrome UI with mocked API: email request, failure display, Back to sign in, existing Forgot Password navigation, fragment removal, explicit confirmation, no automatic login, and clean reopening passed. The request form had no horizontal overflow at 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 375×667 and 360×800.
- Existing administrator/staff password authentication, password-reset expiration/single-use/session invalidation and business routes were not changed. They have not been revalidated against the remote database, because doing so would create/update live authentication records. Live end-to-end checks require an approved isolated environment.
