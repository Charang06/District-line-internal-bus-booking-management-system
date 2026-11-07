# Migration 006 — isolated migration and rollback rehearsal plan

**PLAN ONLY. Requires separate explicit approval before any remote operation.** No migration, restore, permission change, real email or source-account update has been performed as part of local implementation.

**Latest local preparation completed:** integration harnesses below have now been adapted, and two additional verification PostgreSQL tests were added. All five remain opt-in and unexecuted against a real database. See [completed preparation, dependency findings and recovery procedure](migration-006-local-preparation.md). It supersedes earlier preparation blockers where explicitly noted; live target freshness, a suitable empty booking target and committed-state recovery are still remote approval gates.

## Preparation review — 7 November 2026

Only local configuration, SQL/application code and existing saved reports were inspected. No database connection was opened in this preparation review.

| Requested confirmation | Evidence and status |
| --- | --- |
| Different source/restore projects | Current configured project fingerprints match the previously approved source `868295d24a51` and restore `3ae16e4ead10`; IDs differ. Reconfirm live identity before future writes. |
| Forward migration unchanged | SHA-256 `5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`, exact match. |
| Rollback unchanged | SHA-256 `5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`, exact match. |
| Application/schema compatibility | Inspection matches approved columns, table names, scopes, constraints and trigger behavior; local mocked tests/build passed. Real PostgreSQL behavior remains to be rehearsed. No additional schema is required by the new application feature. |
| Previously skipped harnesses | Adapted locally: canonical synthetic fixtures, no existing-admin fallback, cookie/PostgreSQL booking harness with no startup seeding. Five gated database tests now exist; none ran remotely. |
| Migration/constraints/security/rollback coverage | Explicit matrix below; actual outcomes are not yet tested. |
| Original records preserved | Source excluded from the write environment; target existing records are protected by a baseline/fixture registry. No existing account is used for recovery/login/reset tests. |
| Synthetic test data only | Unique fixture administrator/staff IDs, names, example.test emails, tokens, sessions, buses/trips/bookings; no restored account or booking is a fixture. |
| Recover target prior state | Historical verified archive matches saved target data/sequences; detailed committed-recovery procedure is prepared. Live freshness and recovery scope must be verified before a committed rehearsal. |
| No real email | Inject recording senders and deny outbound provider calls; never instantiate the real sender in the rehearsal harness. No production credentials passed to test children. |

The latest saved target snapshot contains 18 application tables and lacks migration 005's username-recovery tables. That is historical evidence, not a new remote observation. A future read-only inventory must confirm the baseline. **Migration 006 has no direct SQL dependency on 005**; 005 is required for existing Forgot Username functionality/regression coverage. **Do not automatically apply 005, restore/replace the target's application copy, or alter its existing records to fix this prerequisite.** If 005 is still absent, stop and present either a separately approved target-only migration-005 setup/cleanup plan, or an explicitly approved disposable target with a 1–5 baseline. Approval of migration-006 rehearsal alone must not silently include another migration.

Both actual source feature flags were confirmed absent/off. They remain off throughout preparation and rehearsal. Only an isolated injected service/test environment may opt in during a later approved run.

### Required skipped-test adaptations

1. **Username recovery PostgreSQL functional test — adapted:** canonical synthetic addresses for valid cases; rejected noncanonical/duplicate writes run in savepoints with expected SQLSTATE 23514/23505. Ambiguous-account fail-closed cases remain mocked; real constraints are not weakened.
2. **Username recovery PostgreSQL concurrency test — adapted:** creates and removes its own synthetic administrator with guarded identity. No existing-admin fallback. A shared explicit target/expected-project/write gate rejects source connections.
3. **Legacy duty/booking test — replaced:** explicit PostgreSQL pool, canonical synthetic admin/staff accounts, current cookie sessions, mocked providers, and a test-only in-memory loader that suppresses startup initialization/seeding/listening. Production route source is preserved and production files are unchanged. It refuses populated application tables and requires an approved empty target and Node's VM-modules flag.

These adaptations are now implemented and locally tested with fake PostgreSQL; a new verification integration file adds two opt-in tests. All five real PostgreSQL tests are still skipped without explicit isolated authorization. Do not treat local harness validation as real PostgreSQL test evidence. Run serially on the approved suitable baseline only.

## Scope to approve

Use only a confirmed disposable separate Supabase restore/test project. Confirm its ID differs from the owner-approved source development project. The original/source connection must remain read-only; no production project may be used. Keep source verification flags off throughout. Stop immediately on project ambiguity, unexpected target use, unexplained drift or inability to recover the target.

This rehearsal is different from the previous rollback-contained backup test: testing the exact standalone migration COMMIT and true multi-connection concurrency requires a committed schema on the isolated target. The target must therefore be explicitly approved as disposable, or have its own fresh, verified pre-rehearsal backup and complete state snapshot. Do not silently treat its existing restored application tables as empty or expendable. Obtain approval for any replacement of that target's application copy and for its post-test restoration/retirement.

## Before writes

1. Confirm both project IDs, environment, PostgreSQL version, extension/role compatibility and no live users of the target. Never print credentials or project URLs.
2. Validate the source backup checksum/freshness and capture target application schema, object ownership, table/column/function/sequence grants, RLS/policies, default privileges, roles/memberships, table counts/checksums and all sequence values. Include managed-schema inventory/checksums for a wider before/after audit; do not replace managed platform metadata.
3. Securely back up and verify the target's pre-test state unless it is explicitly approved for disposal. Abort if complete recovery cannot be established. Save all reports outside the repository with user/SYSTEM-only access.
4. Recheck exact SQL hashes: forward `5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`; rollback `5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`. Do not edit them or register automatic startup migrations.
5. Present the exact target-only restore/permission actions before execution. The previous six default-grant adjustments apply only to the isolated restore and must not be generalized. If further privileges or schema changes are needed, stop and obtain approval.

## Isolated execution

1. Confirm the approved target already has the required migrations 1–5 and the application schema. Preserve its existing records. If prerequisites are absent, stop: any source-backup restore/replacement of the target copy or target-only prerequisite migration requires its own explicit scope/SQL/recovery approval. Never overwrite the target's application copy as an implicit test setup. Preserve Supabase-managed schemas.
2. Apply the exact reviewed migration 006 file once, with stop-on-error handling, its 5-second lock and 30-second statement bounds, and a reviewed bounded execution-session transaction timeout. Do not strip/change its transaction wrapper silently. Record version 6 and all schema/ACL/RLS postconditions.
3. Keep actual delivery disabled: use an isolated test harness with an injected recording sender and synthetic administrator/staff accounts only. Explicit unique IDs avoid changing original users' sequence state. Never exercise links, log in, edit emails/passwords, or create sessions for restored real accounts. No credentials or raw tokens go to console/reports. Transient token data exists only inside the harness when needed. Give all DML-capable test processes only the isolated target URL; do not expose the source URL or load the repository .env in those children. Require an expected target ID and reject the approved source ID before any connection/write. All fixture IDs/related rows must be tracked in a per-run allowlist.
4. Use the new actual PostgreSQL adapter to test status/request/confirm; raw-token non-persistence; exact ID/email binding; expiration; single use; concurrent redemption from separate connections; resend replacement and cooldowns; IP/hour limits; changed-email and change-back trigger invalidation; inactive/staff denial; and rollback after forced errors.
5. Test administrator email uniqueness with synthetic conflicting writes and normalization variants. Expect index/check errors and safe HTTP 409/400 responses, not account rewrites. Test duplicate detection separately through a mock/fault-injection boundary rather than dropping the real uniqueness index to manufacture ambiguity.
6. Verify owner-backed Express database access remains and anon/authenticated clients cannot read/write users or manufacture verification status. Verify the new verification tables/sequences remain inaccessible to those roles. Do not grant test roles persistent new access.
7. Run mocked frontend confirmation/profile flows against the isolated test harness, then establish regression evidence for admin/staff login, Forgot Username, Forgot Password's 20-minute single-use/session-invalidating reset and booking flows using synthetic records. Before starting the existing full Express entrypoint, inspect and contain its automatic seeding and initialization: it can update legacy accounts. Do not run it blindly against a restored copy. If a safe regression harness cannot preserve restored records, stop and request a scoped harness/bootstrap change. Mock all mail/SMS/storage side effects.

Real email delivery is optional and **not included** in this rehearsal unless a recipient and sender test are separately authorized. Delivery acceptance is not proof of receipt; mailbox verification is established only by successful token redemption.

### Required evidence matrix

| Area | Checks required before declaring PASS |
| --- | --- |
| Forward SQL | Exact file hash and standalone transaction execute once; schema_meta gains only 6; verified timestamps initially null; account values not rewritten. |
| Constraints | Synthetic valid emails succeed; synthetic duplicate/noncanonical writes fail; API maps named constraints to 409/400; foreign keys and token-hash uniqueness hold. |
| RLS/permissions | Owner APIs retain access; users/new tables have RLS; anon/authenticated are denied direct SELECT/INSERT/UPDATE/DELETE and sequence access. Probe under transaction-local roles and rollback; do not add persistent grants. Never probe by reading private restored account values. |
| Verification | ID/email binding, hashes only, 20-minute expiry, single use, multi-connection replay, cooldown/hour/IP limits, exact email-change/change-back invalidation, staff/unauthenticated denial. |
| Existing features | Adapted synthetic username tests and isolated cookie-based admin/staff login, password recovery expiry/single-use/session invalidation, synthetic booking/duty flows; original handlers/records remain untouched. |
| Rollback | Exact rollback hash executes; new objects/version removed; known retained RLS/grants reported explicitly; no blanket database overwrite treated as feature rollback. |
| Recovery | Captured original rows, logical schema, ACLs/RLS/policies/defaults, roles/memberships and all sequence states match after separately approved recovery; managed inventories unchanged. |

Compare original account/booking rows using the **pre-test column list and original row IDs**, excluding only registered synthetic fixtures. Adding the nullable verification column changes whole-row JSON hashes even without a value rewrite, so do not report that expected schema addition as original-record mutation. After schema rollback/recovery, require strict baseline equality; no unexplained differences are accepted.

### Concrete stop conditions and risks

- Unknown/live/production target, same project IDs, different approved SQL hashes, unsafe inherited credentials or unverified target recovery: no writes.
- Missing baseline-005 schema or unadapted integration harness: do not start the affected tests or silently introduce prerequisite schema changes.
- Applying the exact migration commits permission/schema changes on the isolated target. An outer rollback cannot undo an already committed migration; preserving/restoring target state requires the verified recovery plan below.
- Unique/check constraints intentionally reject cases that old fixtures accepted. Test expectations must change; constraints must not be removed to make tests pass.
- ALTER TABLE may block reads/writes while locks are held. Use 5-second lock, 30-second statement and bounded transaction/session limits; stop on unexpected failures rather than retrying automatically.
- PostgreSQL sequence increments and committed synthetic rows require explicit fixture cleanup/recovery. Negative explicit user IDs alone do not prevent token/session/booking sequences from advancing.
- Feature rollback deletes newly created verification history and keeps users security hardening. Exact target restoration can therefore require separately authorized ACL/RLS recovery; it cannot be promised from feature rollback alone.
- Existing server startup can seed/change legacy accounts and provider calls can have external effects. Both must be contained before any regression test runs. Missing containment is a blocker, not permission to proceed with partial isolation.

## Rollback and target recovery

1. Disable only the isolated harness/feature, drain requests and export synthetic diagnostics. Confirm no source flag was changed.
2. Apply the exact reviewed rollback file on the isolated target, with bounded execution and stop-on-error handling.
3. Verify removal of version 6, verification column/tables/function/trigger and the email-specific index/check. Compare original account/booking/password/session records against their appropriate pre-migration baseline; account and booking changes must be confined to approved synthetic fixtures.
4. **The reviewed feature rollback intentionally retains users RLS/client-grant hardening.** It is not an exact ACL rollback. If returning the target to its earlier broad client grants is required, that security downgrade must be explicitly approved using the captured ACL snapshot. Never restore those grants on the source as part of rehearsal.
5. Return the isolated project to its captured prior state using its separately approved verified recovery procedure, or retire the disposable test project under the owner's instructions. Do not automatically overwrite/drop schemas, reopen permissions or delete a project. PostgreSQL sequence increments and committed feature-history changes are not undone merely by feature rollback; account for them explicitly.
6. Compare captured application schema/data/grants/RLS/policies/default privileges/roles/memberships/sequences and managed inventories. If exact recovery is required, every captured property must match strictly. If recovery fails, stop, preserve evidence and report; do not retry destructive operations.

## Success and further gates

Report forward migration result, each integration/security/regression check, rollback result, exact remaining differences, target recovery result and any managed-platform limitations. Do not call it a full Supabase clone unless that was actually established.

A successful rehearsal does not approve source migration or verification activation. Reconfirm source project/duplicates/schema/backup freshness, present the results, and wait for final explicit approval to apply migration 006 to the original development/test database. Keep both feature flags off until source migration and readiness are separately approved; activation is a distinct step.
