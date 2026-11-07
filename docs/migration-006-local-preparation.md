# Migration 006 rehearsal — completed local preparation

No remote database connection, migration, permission change, existing-record edit or real email delivery occurred during this stage. Production application code and UI were not changed. Both verification rollout flags remain disabled.

## Test changes

- `server/admin-username-recovery.postgres.test.js`: uses generated canonical administrator/staff fixtures only; no first-existing-admin fallback. Invalid/duplicate email cases now expect migration-006 constraint errors inside savepoints. Concurrent redemption creates its own synthetic account and cleans up by exact generated ID/name.
- `server/admin-recovery-email-verification.postgres.test.js`: adds opt-in real-PostgreSQL tests for verification schema gating, expiry/single use, hash/ID/email binding, email-change invalidation, constraints, limits, role permissions/RLS and concurrent redemption. Delivery is injected and recorded in memory; no provider calls.
- `server/duty-management.test.js`: replaces ignored SQLite settings and obsolete Bearer login with explicit PostgreSQL isolation and cookie sessions. Existing finance/finalization assertions remain. Admin/staff accounts, general expenses, buses, trips and bookings are synthetic.
- `server/test-support/isolated-postgres.js`: dedicated URL/expected-project fingerprint/write opt-in, approved-source rejection, no DATABASE_URL fallback, schema-version checks without migrations, canonical fixtures, guarded cleanup and savepoint support. Does not load .env.
- `server/test-support/booking-app.js`: test-only in-memory loader for existing production routes. Suppresses the startup initialization/seeding/listening block, injects the isolated pool, rejects external fetches and records SMS instead of sending it. The source file is not rewritten. Route preservation is checked locally.
- `server/test-support/booking-local-worker.mjs` and `server/isolated-preparation.test.js`: synthetic unit tests for identity guards, fixture/cleanup safety, cookie handling, empty-target refusal, savepoints and actual route boot/login/me with a fake PostgreSQL pool. No database connection.

The booking harness requires Node's `--experimental-vm-modules` flag and a separately approved **empty application database** with schema/meta already installed. It refuses populated tables before inserting fixtures, because existing dashboard handlers can update duty state and login can clean expired sessions globally. This prevents tests from altering original restored accounts/bookings. VM/Express Promise-realm warnings are test-harness warnings; production code is unchanged.

All five PostgreSQL tests remain opt-in, not permanently disabled. They are skipped by ordinary local runs. The previous three unsafe tests have been adapted; two additional verification integration tests are now prepared.

## Explicit opt-in contract — not authorization to run

The runner requires all three environment settings, passed securely rather than via printed command arguments:

```
ISOLATED_REHEARSAL_DATABASE_URL=<separately approved target only>
ISOLATED_REHEARSAL_PROJECT_FINGERPRINT=<approved target fingerprint>
ISOLATED_REHEARSAL_ALLOW_WRITES=synthetic-fixtures-only
```

It rejects the known source project fingerprint and any target matching DATABASE_URL when that value is present. Old username-test opt-ins alone cannot start these tests. TLS is required; session-pool port is used; lock/statement/transaction/idle limits are bounded.

Future approved command, with credentials supplied only in that process's environment:

```
node --experimental-vm-modules --test --test-concurrency=1 server/admin-username-recovery.postgres.test.js server/admin-recovery-email-verification.postgres.test.js server/duty-management.test.js
```

Run serially to avoid fixture collisions with the booking harness's empty-target gate. Do not run this command until separate approval, backup/recovery verification, target identity and schema checks are complete. No test applies migrations. The helper's versions-1–6 requirement is the full regression baseline, not a claim that migration 006 directly depends on migration 005.

## Exact migration dependency findings

Migration 006 directly requires:

- Migration 001's `public.users` (including id/role/status), `users_id_seq`, `schema_meta` and PostgreSQL-compatible types/ownership.
- Migration 004's `users.recovery_email` column.
- Supabase role/catalog environment and PostgreSQL 17 support for its MAINTAIN privilege checks.

It does **not** reference migration 005's token table, limit table, trigger or function, and does not check version 5. Thus 005 is not a direct SQL prerequisite for 006. Migration 005 is required for the existing Forgot Username feature and its regression tests. Migrations 002/003 support existing sessions/Forgot Password and the email-update handler; they are application/regression prerequisites rather than direct references in 006's DDL.

Migration 005 supplies `admin_username_recovery_tokens`, `admin_username_recovery_limits`, identity/indexes/RLS/client restrictions, `invalidate_admin_username_recovery()` and its account-change trigger, plus schema version 5. Migration 006 supplies distinct verification objects; neither replaces the other.

The last saved restore snapshot has 18 application tables and lacks username-recovery tables. That historical baseline needs live rechecking after approval. If 005 is absent, stop and separately approve its target-only setup/rollback or use an approved prepared disposable baseline. Never silently run 005 or edit approved migration files. Current 005 file SHA-256: `c5022498d0945d8d002c680827d5badb0766084eb09cd74adaa7a05f0e8f6a76` (observed, not new execution approval).

Migration 006 remains `5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`; rollback remains `5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`.

## Locally verified recovery-baseline evidence

Existing secure archive `test-2026-11-06-1312f8d1/database.dump` has SHA-256:

`36edcc0507c23560931c6897b53245e0a719ec5db59c85273b8f46dd8ed41580`.

Local archive integrity passed. Its manifest matches **all 18 application-table row counts/checksums** in the latest saved target-after snapshot (`diagnostic-NGHI2k`). Its archived setval commands match **all 16 target sequence states**. Its prior application restore report records successful application restore, schema-text and sequence verification. Roles and schema exports exist. The older `08eef535` archive does not match the captured auth_sessions data and must not be substituted.

This is a **verified historical application baseline candidate**, not proof of current live target freshness or a complete Supabase platform backup. Current source backup contains 20 tables and different account/session/recovery/audit data; it is not an exact recovery image for the saved restore project's 18-table state. Do not restore the source archive over the target as routine rollback.

Before any committed rehearsal, separately approved read-only work must compare the live target with the baseline and capture current schema/ACL/RLS/policies/defaults/roles/memberships/sequences. If unchanged, preserve the candidate plus current metadata and preferably take a fresh full target dump from a consistent read-only snapshot. Validate archive checksum/TOC and extracted schema/data/sequence expectations. If state differs or recovery evidence is incomplete, create and independently restore-verify the new target baseline before any migration. This cannot be completed locally without remote access, and has not been claimed as completed.

## Recovery procedure after a committed target migration

1. Before execution, record the approved target fingerprint, exact hashes, original versions and full logical baseline. Store full custom dump, no-password role export, ACL/RLS/policy/default snapshots, original-row/column manifests and sequence last_value/is_called in user/SYSTEM-restricted storage. Confirm recovery covers the approved mutation scope. Preserve managed Supabase schemas and inventory; external Storage files/platform secrets/role passwords are not included in a database-only recovery claim.
2. Require exclusive use of the disposable test target. Original source URLs/provider credentials are excluded from DML-capable harness environments. Both actual source feature flags remain false; test services use injected config/senders only. If target is populated, the booking suite refuses to run; an explicitly approved empty disposable application target is required, not silent deletion of its rows.
3. After tests, stop the harness and drain/close all connections. Retain sanitized results. Clean only tracked synthetic rows, by exact fixture IDs/usernames or tracked created_by/bus IDs, in FK-safe order. No broad role/email account selection or TRUNCATE. If cleanup is uncertain, stop and use the approved recovery plan rather than broad deletion.
4. Execute the unchanged reviewed migration-006 rollback file on the target only. Verify removal of its version marker, column, index/check, trigger/function and two tables. It preserves existing account/email/password values but discards new verification history; export needed synthetic diagnostics first.
5. If migration 005 was separately approved and introduced solely for rehearsal, use its separately approved rollback only after 006 rollback, provided the captured original baseline lacked 005. Never remove pre-existing 005 objects or tokens. Without explicit prerequisite/rollback approval, no such setup is allowed.
6. Restore **only changed** original users-table/sequence ACLs and RLS/FORCE RLS settings from the captured target snapshot. The 006 rollback intentionally retains hardening. Reopening old broad anon/authenticated grants is a security downgrade requiring explicit target-only approval; it is not implicit in source migration or test approval. Generate the exact recovery SQL from the saved snapshot, review it before execution, and use bounded transactions. Preserve original ownership/service access; verify role memberships/default privileges rather than rewriting them unnecessarily. Never apply these grants on the source.
7. In an exclusive quiet target with no concurrent writers, restore each captured original sequence's exact last_value/is_called, not MAX(id). Sequences can advance even when fixture transactions roll back. Restore only the baseline's whitelisted public sequences; newly introduced sequences disappear with their feature tables. PostgreSQL setval is not transactionally reversible: perform it as a controlled final recovery step, verify each result, and stop/report any failure instead of claiming rollback succeeded.
8. Compare original records using captured original IDs/columns (a newly added null column must not be mistaken for changed account values). After rollback/recovery, require strict equality of data counts/checksums, logical schema, owner/grants/column permissions, RLS/policies/defaults, roles/memberships and original sequence states. Managed inventories must be unchanged. Record every difference; no unexplained drift is accepted.
9. If original target data/schema cannot be reconciled, do not automatically overwrite it. A full target-application restore from the verified target baseline requires a separately reviewed, explicitly approved recovery action with exact object scope, stop-on-error handling and post-restore comparison. Do not blanket restore/drop Supabase-managed schemas, reset role passwords, restore the original source database, or merge accounts.

Feature rollback alone is not a full committed-target recovery. Exact restoration requires the snapshot-backed ACL/RLS and sequence steps above. If recovery cannot be demonstrated before a committed rehearsal, do not start that rehearsal.

## Local versus remote verification

Locally proven: canonical fixture generation, rejected unsafe cleanup identities, target/source identity guards, absence of fallback credentials, savepoint wiring, cookie handling, empty-target refusal, route-source preservation, startup-without-migration/seeding and mocked login/me, approved SQL hashes, historical baseline archive integrity/data/sequence correspondence.

Still remote-only and unexecuted: current target identity/state/freshness, target backup restoration against live catalog, migration 005 setup if required, migration 006 execution, real PostgreSQL constraints/trigger/rate-limit SQL, multi-connection redemption, role denial probes, booking/duty behavior on actual PostgreSQL, reviewed rollback execution and exact committed-state recovery. Full Supabase platform recovery remains outside the verified application scope.

Next approval must explicitly identify the target, required baseline setup, the empty-target booking restriction and target recovery/permission restoration scope. It does not authorize source migration or activation. No remote operation is authorized by this document.

## Final local results

`npm test`: **77 passed, 0 failed, 5 skipped** (82 total). The five skips are the two opt-in username PostgreSQL tests, two new verification PostgreSQL tests and the isolated booking/duty PostgreSQL test. They are skipped because this stage forbids remote database access, not because the old unsafe harness remains. Eight new local preparation tests passed, including actual route boot/login/me with fake PostgreSQL and no migration/seeding.

Production build, focused lint and whitespace checks passed. The VM loader requires Node's experimental VM flag in its local worker and emits a test-only experimental/Promise-realm warning when run directly; no production behavior was modified.
