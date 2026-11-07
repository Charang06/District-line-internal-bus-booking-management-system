# Migration 006 review — 7 November 2026

Environment: owner-confirmed development/test Supabase project; no live website uses it.

Migration 006 has NOT been executed on either database. It remains excluded from automatic startup migrations. Recovery email verification is not implemented or enabled.

## Exact SQL and changes

Forward SQL: [006_admin_recovery_email_verification.sql](../server/migrations/006_admin_recovery_email_verification.sql).
SHA-256: `5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`.

Rollback SQL: [rollback-admin-recovery-email-verification.sql](../scripts/rollback-admin-recovery-email-verification.sql).
SHA-256: `5e2d93b0a871dd84821796e0746063b5ced057a72edd942ee8f08f40c81d0c2b`.

The full SQL files are the exact review artifacts, not abbreviated examples.

- Add nullable `users.recovery_email_verified_at`. No existing email becomes verified; no backfill or account-value rewrite.
- Create dedicated verification token and rate-limit tables, indexes, and an invalidation trigger for future email/role/status changes.
- Require canonical administrator recovery email format and uniqueness across administrators. Abort on conflicts; never resolve them automatically.
- Enable RLS on `users` and new tables. Revoke PUBLIC/anon/authenticated access to those tables and the relevant identity sequences. Preserve the current owning server connection and service-role access.
- Record version 6 only after transactional checks succeed. Any statement failure rolls the migration back.

The access change closes existing direct client access to account data. Any external integration using Supabase anon/authenticated roles to query `users` directly would lose that access. The existing frontend uses Express for account operations; no such direct frontend calls were found. This permission change requires explicit approval with the migration.

Existing account IDs, usernames, passwords, recovery email values, roles, sessions, password reset tokens, bookings and dashboards are not rewritten by this SQL. New constraints affect future administrator recovery email writes. Application handling of constraint errors must be ready before activation.

## Backup

Fresh full logical archive created with PostgreSQL 17.11 tools on 7 November 2026. Archive contains 59 application/platform tables, with no schema/data exclusions; role definitions were exported without passwords. Stored outside the repository with restricted user/SYSTEM access.

Directory: `C:\Users\Abbishathanan\AppData\Local\DistrictLine\Backups\migration006-2026-11-07-2f69638c`.
Archive: `database.dump`, 447,268 bytes.
SHA-256: `5039733afba90b2979893c3727c2f7e05d5d41425c4471f7c7c32d6fb11f756b`.
Archive listing and checksum checks passed. Restore-test results are recorded below when complete.

A logical database archive does not include external Storage files, platform encryption secrets, or role passwords. The isolated restore test preserves target Supabase-managed schemas, so it does not establish a complete Supabase platform clone.

## Rollback procedure

1. Disable the verification feature and drain in-flight verification requests.
2. Export verification history if required, then obtain explicit rollback approval.
3. Execute the linked rollback SQL transaction. It removes only the new feature tables/trigger/function, verification timestamp, email index/check and version-6 metadata.
4. Keep the `users` RLS and client-grant hardening. Restoring the old broad access is a separate security change requiring explicit approval using the saved ACL snapshot.
5. Check existing login, profile editing, Forgot Username and Forgot Password using synthetic test accounts. Do not overwrite the full source database as routine rollback.

Rollback removes any verification timestamps/tokens created after activation; original account/email/password values and unrelated records remain. The rollback has not been executed or tested because migration execution is not authorized in this preparation task.

## Approval gate

Review the exact forward SQL, access changes and rollback above. No migration or activation will run until final explicit approval. A stale backup, new duplicate emails, schema drift, or changed project/environment requires fresh checks before execution. Approval of preparation alone is not approval to apply migration 006.

## Restore verification result

**Partially verified; not ready for migration execution.** The archive checksum/listing passed. On the separate project, the restored application data assertions completed for all 20 public tables, then the first ACL/RLS comparison failed for `admin_username_recovery_limits`. The transaction rolled back on error; no restore was committed. The source was never written to.

The archive grants service_role access to this table and enables RLS, but does not explicitly revoke all permissions inherited from target defaults. Target default grants are the suspected cause; entry-order-only comparison was ruled out. Full sequence/permission verification and a post-rollback target-preservation audit remain incomplete, so this report does not claim a fully verified restore.

A proposed retry would temporarily neutralize default table/sequence grants for the restore role in the isolated target, restore the archive, verify, and roll the transaction back. Automatic approval review rejected this action as an unapproved remote security-permission mutation with nontrivial risk, including service_role permissions. It was not executed. No alternative permission mutation was attempted.

Next gate: explicitly approve a narrowly scoped restore-project permission preparation and transactional restore test, or provide a fresh isolated environment with suitable defaults. This is separate from migration 006 approval. Complete restore verification before requesting final migration execution approval.

## Approved isolated verification — final result, 7 November 2026

This section supersedes the earlier incomplete test status above.

**Result: FAILED; rollback VERIFIED. No further database changes or retries were attempted. Migration 006 was not executed.**

- Confirmed source and restore project IDs differ before any writes. Private ID fingerprints: source `868295d24a51`, restore `3ae16e4ead10`. Connection credentials and project URLs were not printed.
- The original database connection was read-only. All writes were restricted to the separate restore project.
- Snapshotted the target's application schema, rows/checksums, sequences, ownership, ACLs, RLS/policies, relevant roles/memberships and all visible default privileges before testing.
- Compared `postgres`, `anon`, `authenticated`, and `service_role` attributes and memberships: matching. Existing roles were used; roles/passwords were not recreated.
- Temporarily revoked only the six postgres/public default table/sequence grants for anon/authenticated/service_role that could add access to restored objects. These and all restore operations ran in one transaction, with automatic rollback on error and an explicit ROLLBACK on success.
- The archive restored and **all 20 application-table row count/data checksum assertions passed**.
- The subsequent combined schema/security assertion failed. This covers columns/defaults, constraints, indexes, triggers/functions, owners, ACLs, RLS flags and policies. The exact differing component has not been isolated; do not claim schema, grants or policy equivalence.
- The 17 restored-sequence checks occur after that assertion and were not reached. They are planned checks, not passed results.
- After failure, a separate read-only snapshot confirmed the target's pre-test state was restored exactly for all captured application schema/data/sequence/role/membership/default-grant properties. **No temporary permission adjustment remained.**
- Supabase-managed schemas were preserved. This did not test recreation of platform-managed roles, their passwords, managed policies, Storage files or platform secrets.

Private evidence: `approved-restore-verification-report.json`, `approved-source-expected-state.json`, `approved-target-before-state.json`, `approved-target-after-state.json`, and private restore stdout/stderr in the backup directory above. Verification script: [verify-migration006-backup.cjs](../scripts/verify-migration006-backup.cjs). No credentials are embedded in the script.

The backup passes archive-integrity and application-data restoration checks, but **full schema/security restoration is not verified**. Per the owner's stop-on-failure condition, no further remote changes will be made. Keep migration 006 unexecuted while the discrepancy is reviewed. A subsequent diagnostic restore would require further authorization; it is not part of this completed test.

## Latest authorized isolated test — PASS, 7 November 2026

This result supersedes the earlier failed verification status. Exactly one additional restore test was run under the owner's separate approval.

- Distinct source and restore project IDs confirmed before writes. The source connection enforced read-only transactions. No production connection was used.
- All temporary restore operations and the six reviewed default-grant adjustments ran only in the separate restore project. Lock timeout: 5 seconds; statement timeout: 60 seconds; transaction timeout: 10 minutes.
- All 20 application-table row-count/checksum assertions passed.
- Application columns/defaults, constraints, indexes, triggers, functions, owners, table/sequence/column/function grants, RLS flags and policies matched. Required role attributes and memberships matched; roles were not recreated.
- Exact schema/security difference list: empty. Only harmless CRLF/LF differences outside function literals were normalized for `public.invalidate_admin_username_recovery()` and `public.prevent_duplicate_duty_trip()`. Neither function's logic, ownership or grants differed.
- All 17 sequence assertions passed, including both `last_value` and `is_called`.
- Explicit transaction rollback completed. An independent strict before/after comparison verified the target's captured application schema, row checksums, sequence values, role attributes/memberships and default privileges returned to their prior state. Temporary grants were not retained.
- Diagnostic errors: none. Restore exit status: 0. No retry was performed.
- Original development database modified: no. Migration 006 executed: no. Recovery email verification activated: no.

| Sequence | Result |
| --- | --- |
| admin_username_recovery_tokens_id_seq | PASS |
| audit_logs_id_seq | PASS |
| auth_sessions_id_seq | PASS |
| bookings_id_seq | PASS |
| bus_contacts_id_seq | PASS |
| bus_duties_id_seq | PASS |
| buses_id_seq | PASS |
| cargo_id_seq | PASS |
| crew_members_id_seq | PASS |
| daily_expenses_id_seq | PASS |
| duty_adjustments_id_seq | PASS |
| expense_submissions_id_seq | PASS |
| password_recovery_tokens_id_seq | PASS |
| revenue_entries_id_seq | PASS |
| sms_attempts_id_seq | PASS |
| trips_id_seq | PASS |
| users_id_seq | PASS |

Secure local evidence is in the backup directory's `diagnostic-NGHI2k` subfolder: `approved-restore-verification-report.json`, `approved-restored-catalog.json`, `approved-restored-diagnostics.json`, before/after snapshots and native logs. Folder ACL inspection confirmed access is limited to the current Windows user and SYSTEM. Existing evidence from earlier runs was retained.

**Assessment:** the application-database backup restore prerequisite is satisfied for considering migration 006 on the owner-confirmed development/test source. This is not an exact Supabase platform clone: managed schemas/default grants were preserved; required roles were compared rather than recreated; role passwords, external Storage files and platform secrets were not restored. Migration 006 itself and its rollback/application feature have not been exercised by this test. Recheck drift/backup freshness before any separately approved migration execution.

**Approval gate remains:** do not execute migration 006 or activate verification without the owner's separate explicit approval.
