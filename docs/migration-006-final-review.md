# Migration 006 final pre-migration review

Reviewed 7 November 2026, 10:59 Asia/Colombo (05:29 UTC).

**Decision: NOT READY for execution as a complete application rollout. Database/environment/backup preconditions pass; application compatibility work and migration rehearsal remain. No migration, permission changes, account changes, or activation occurred.**

## Confirmed read-only findings

| Item | Result |
| --- | --- |
| Configured source project | Same approved owner-confirmed development/test project; fingerprint `868295d24a51` matches the successful restore report |
| Database connection mode during review | `transaction_read_only=on` |
| Existing migration versions | 1, 2, 3, 4, 5; version 6 absent |
| Schema comparison with successful test | Match; no differences |
| Default privileges, required roles/memberships | Unchanged |
| Administrator recovery emails | 1 administrator, 0 missing, invalid, noncanonical or duplicate groups |
| Application data vs backup | All 20 table counts/checksums unchanged |
| Sequence states vs successful-test source snapshot | No changes |
| Full archive checksum | Valid; same SHA-256 as successful restore test |
| Backup age at audit | 59 minutes; sufficiently recent for this review, supported by no application-data/schema/sequence drift |
| Backup restore result | Previous approved isolated test passed 20 data checks, schema/security comparisons and all 17 sequences; rollback verified |

A Supabase project ID alone does not prove its environment. Classification comes from the owner's explicit confirmation, with the currently configured ID matching that confirmed source. No live-site usage is inferred from unset NODE_ENV/VERCEL_ENV. No production database was used.

Backup created at `2026-11-07T04:30:27.972Z` (10:00 Asia/Colombo). Archive SHA-256:
`5039733afba90b2979893c3727c2f7e05d5d41425c4471f7c7c32d6fb11f756b`.

Forward SQL SHA-256 matches the reviewed version exactly:
`5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`.

Rollback SQL SHA-256 is unchanged:
`5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`.

Backup limitations remain: application restoration was verified, not an exact Supabase platform clone. Managed schemas/default grants were preserved; existing required roles were compared rather than recreated. Role passwords, external Storage files and platform secrets are outside the tested restoration scope.

## Express/RLS compatibility

The existing Express Pool uses DATABASE_URL directly. The configured database connection owns `users` as postgres and owns all captured application tables/sequences. It currently has required users SELECT/UPDATE and sequence USAGE privileges. The proposed migration enables RLS without FORCE RLS, revokes PUBLIC/anon/authenticated direct access, and leaves owner/server/service-role access intact. The owning backend connection will therefore retain access; no SET ROLE switches were found in its query path. Frontend account operations use credentialed Express API fetches; no direct browser Supabase users-table access was found.

This supports compatibility by code/catalog inspection, not a live post-006 integration test. External consumers using client roles directly against users would lose access and must be accounted for before execution. Changing DATABASE_URL to a non-owning role later would require another access review.

## Blocking application findings

1. `server/server.js` recovery-email PATCH normalizes and validates the email, then writes it without handling the proposed unique index or check-constraint errors. SQLSTATE 23505 for `users_admin_recovery_email_unique` or 23514 for `users_admin_recovery_email_canonical` reaches the generic error handler and becomes HTTP 500. Add narrowly scoped safe 409/400 responses with tests; avoid disclosing another administrator's identity. The database should remain the race-safe authority. No handler was changed during this review.
2. Recovery-email verification application code is absent. Implement authenticated own-account status/request endpoints, secure hashed 20-minute single-use tokens, exact email/ID binding, cooldown/rate limits, dedicated sender/trusted origin, transactional redemption and tests. Do not reuse password-reset tokens.
3. `src/api.js` has no verification API calls. `AdminProfile.jsx` still explicitly says the system does not verify ownership; it has no authoritative verified-state rendering or Send/Resend controls. `src/main.jsx` has no verification-link entry point. Implement these within the current design and add default-off rollout gates.
4. The successful restore test did not execute migration 006 or its rollback. A separately authorized isolated migration/rollback rehearsal plus synthetic account/API tests is still needed before claiming post-migration behavior is verified. This review does not authorize it.

Schema installation could technically be separated from feature activation, but it immediately changes recovery-email write constraints and direct-client access. Do not call the current application fully ready merely because the migration is additive.

## Existing feature compatibility and testing

- Administrator and staff username/password login use the same owner-backed users lookup, password hashes, IDs and session tables. None are rewritten by this SQL; RLS owner bypass preserves that lookup.
- Forgot Password retains its administrator checks, separate token table, 20-minute expiry, single-use consumption and session invalidation. The SQL does not alter its tables/handlers. Its email lookup remains compatible with the new canonical unique administrator emails.
- Booking handlers retain the same tables/API paths and owner-backed account/session authorization. No booking data or role assignments are changed.
- These are inspection-based compatibility findings. Actual login/reset/booking writes against either remote database were intentionally not tested during this read-only review.

Targeted local suite: **39 passed, 0 failed, 1 skipped**. It covers the verifier's synthetic logic, administrator Change Username and Forgot Username mocked service/HTTP tests. The legacy duty/booking integration harness is explicitly skipped because it targets an obsolete SQLite setup and could otherwise write to PostgreSQL. It does not establish post-006 login, Forgot Password or booking integration coverage.

## Rollback and effects

The forward migration is transactional and performs no verification backfill or account-value rewrite. Failures before COMMIT should roll back its schema/ACL changes. It is not registered for automatic startup execution.

For a committed migration: keep verification disabled/drain requests, export any new verification history, obtain explicit rollback approval, then run the reviewed rollback SQL. It removes the feature tables/function/trigger, email check/index, timestamp and version-6 marker. It preserves original usernames, emails, passwords, account IDs, sessions, bookings and existing recovery-token records.

Caveats:

- Dropping the verification column/tables permanently loses subsequently created verification timestamps, token history and rate-limit history unless exported/backed up first.
- The rollback deliberately retains users RLS and revoked client grants. It is not an exact permission rollback. Reopening the previous broad direct-client access requires separate explicit security approval and the captured ACL snapshot.
- Legitimate account edits or consumed links after activation would not be undone by schema rollback.
- A complete database overwrite is not the normal rollback procedure.

## Final execution plan — requires future approval

1. Complete the narrow constraint handling and verification application work behind disabled gates; run synthetic/security/UI tests. Do not change login/reset/booking behavior.
2. Obtain separate authorization to rehearse exact migration 006 and rollback on an isolated restored project using synthetic accounts. Verify owner access, client-role denial, email constraints/invalidation, and unchanged admin/staff login, password reset and booking flows.
3. Immediately before source execution, reconfirm project identity, schema/role state, duplicate/canonical email aggregates and backup freshness. Any drift requires reassessment and, when needed, a fresh verified backup. Preserve exact approved SQL hashes.
4. Present those results and obtain the owner's final explicit approval to apply migration 006 to the original development/test source, including users-table access hardening. This review is not that approval.
5. During an agreed quiet window, manually execute the exact SQL with stop-on-error handling and credentials kept out of command arguments/output. The SQL uses a transaction, advisory lock, 5-second lock timeout and 30-second statement timeout. ALTER TABLE may briefly block login/account queries; stop rather than retry indefinitely if locks/conflicts occur. Any added transaction timeout should be a reviewed execution-session setting, not an unreviewed change to the hashed SQL.
6. Check schema version 6, column/tables/index/trigger and ACL/RLS postconditions; confirm no existing account values were backfilled. Run only explicitly approved synthetic checks. On failure stop and use the approved rollback procedure as appropriate.
7. Keep verification disabled after schema installation. Activation and actual email delivery require separate approval after application readiness checks.

## Evidence

Sanitized read-only database report: `final-premigration-readonly-review.json` in the secure backup folder's `diagnostic-NGHI2k` directory. Full restore review: [migration-006-review.md](migration-006-review.md). Forward SQL: [006_admin_recovery_email_verification.sql](../server/migrations/006_admin_recovery_email_verification.sql). Rollback: [rollback-admin-recovery-email-verification.sql](../scripts/rollback-admin-recovery-email-verification.sql).
