# Recovery email verification — inspection and approval plan

Status: inspection complete on 7 November 2026. **No application feature implemented or enabled yet; no migration applied, records changed, permissions changed, or emails sent.** Only the draft forward SQL, rollback SQL and this plan have been prepared. The migration is deliberately absent from `DATABASE_MIGRATIONS`.

## Read-only findings

- Remote Supabase PostgreSQL 17.11. The owner confirmed on 7 November 2026 that this same project contains only test data, is not used by a live website, and is development/test. This confirmation does not approve migration 006.
- Current migration metadata is 1–5. `users.recovery_email` is nullable text. No email-verification columns or tables exist.
- Aggregate administrator audit: 1 administrator; 0 duplicate email groups; 0 missing, invalid or non-normalized recovery emails. No account addresses, IDs, passwords, token values or usernames were printed. Repeat the checks immediately before any approved migration. A new conflict must stop execution for authorized resolution, never automatic merging or rewriting.
- Existing administrator identification uses the HttpOnly session cookie, hashes its ID, and joins `auth_sessions.user_id` to `users.id`. Existing `authMiddleware` and `requireAdmin` will protect request/status routes; body-provided IDs/emails/roles will not select the verification target.
- The existing password-recovery table is separate, with hashed, single-use 20-minute tokens and session invalidation after reset. It will not be reused or changed. Forgot Username also retains its existing separate tables and behavior.
- Existing email delivery uses the server-side Resend REST API, `RESEND_API_KEY`, `RECOVERY_EMAIL_FROM`, a validated canonical `APP_URL`, idempotency keys and timeouts. Settings are present; live delivery was not tested. No SDK/package installation is needed.
- The Recovery tab currently shows an accurate neutral unverified state. It has no authoritative verification endpoint or send/resend controls yet.

## Relevant access-control finding

Catalog inspection showed `public.users` has **RLS disabled** and direct `anon`/`authenticated` grants for SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE and MAINTAIN; those roles also have all privileges on its identity sequence. This is an existing account-table access issue, not a hypothetical warning. No public API exploitation was attempted.

A frontend-writable verification column would not meet the requirement that only the backend can verify an email. The proposed migration therefore explicitly enables RLS on `users` and revokes direct client-role access to that table and its sequence. The current Express database connection **owns these objects and bypasses RLS**, so its existing cookie-authenticated APIs remain able to read/write them. No frontend direct Supabase account-table calls were found. Server/service-role grants are preserved; RLS is not forced on the owner.

**This permission hardening must be explicitly included in approval.** Test the full existing backend flows on a restored copy before any production rollout. Uninspected external integrations that directly access `users` through client roles could be affected; do not silently assume they are safe. No other application tables are hardened or otherwise altered by this proposal.

## Exact proposed migration

Read `server/migrations/006_admin_recovery_email_verification.sql` for the complete SQL. It:

1. Starts a transaction with the existing migration advisory lock and bounded lock/statement timeouts. Locks `users` while checking duplicates/normalization and establishing constraints.
2. Aborts on duplicate, invalid or non-normalized administrator emails without printing addresses or rewriting any accounts.
3. Adds nullable `users.recovery_email_verified_at`, with **no backfill/default verification**. Every existing account remains unverified.
4. Adds a canonical-format check for future administrator email writes and a partial unique index on normalized, nonempty administrator recovery emails. Null/empty emails remain optional; staff email values are outside these constraints. Inactive administrators are included in uniqueness, avoiding ambiguous mailbox ownership. The existing email API already trims/lowercases values; new duplicate errors will be handled as safe 409 responses.
5. Creates separate verification-token and rate-limit tables. Token records bind the stable user ID and exact normalized email to a unique SHA-256 token hash; raw tokens are never persisted. Backend issuance will enforce 20-minute expiry. Single-use redemption is transactional.
6. Enables RLS and revokes public/client-role access for the new tables/sequences and the existing account table/sequence as described above. Backend/service access remains.
7. Adds a BEFORE UPDATE trigger which clears verification status and invalidates outstanding verification tokens when recovery email, role or account status changes. It does not update account records during migration and does not alter password-reset tokens. An email change-and-revert cannot resurrect an old proof.
8. Checks that no unexpected inherited or column-level client grants still expose the account/token tables or their sequences; aborts if any remain. Records migration version 6 only after those checks pass.

No usernames, roles, email values, passwords, user IDs, bookings or historical records are changed by the migration. Constraint/index validation scans rows but does not normalize/overwrite them. The unique/canonical constraints change which future administrator-email values can be registered; that is an intentional, approval-required safety change. A new index/constraint/trigger does not grant frontend verification capability.

## Application changes after approval

Planned files, limited to this feature:

- `server/server.js`: mount authenticated admin-only status/request routes and a token-confirmation route; handle the new email constraint conflicts gracefully in the existing own-email save handler. Keep login, staff, password-reset, session, booking and other handlers unchanged.
- `server/admin-recovery-email-verification.js` (new): trusted-origin configuration, email sender, token/status handling, transaction-safe issuance/redemption and persistent rate limits. Reuse the existing Resend credentials and delivery pattern without refactoring the password-reset sender.
- `server/admin-recovery-email-verification.test.js` (new): synthetic/mocked service and HTTP tests. Real database tests require an explicitly approved isolated environment.
- `src/components/AdminProfile.jsx`: fetch verification state from the backend for the persisted recovery email; show the green check and “Email verified” only from that response. Keep unsaved email drafts distinct; save a changed email before allowing verification. Add gold Send/Resend controls and backend-derived cooldown guidance without discarding other profile drafts.
- `src/components/AdminProfile.css`: only scoped status/check/button styling within the current Recovery layout.
- `src/api.js`: own-status, own-request and token-confirmation calls through the existing credentialed fetch path.
- `src/components/RecoveryEmailVerification.jsx` (new) and its scoped styles if required: explicit link-confirmation/result UI, with no automatic token consumption on GET/render.
- `src/main.jsx`: recognize only the new verification-link fragment and render the confirmation entry point; all ordinary login/reset/username-recovery entry points continue to render the existing App unchanged. Returning from verification reloads the normal entry point so profile status is fetched from the backend.
- `.env.example`: disabled-by-default verification rollout flags if needed. Actual local/host flags will not be enabled before the target schema and environment are approved.
- The two draft SQL files, this plan, related tests and review artifacts.

### Request and confirmation behavior

- Request/status: existing valid administrator session required. Read and lock the authenticated database account, ensure it is active, and select its saved email from the database. No arbitrary frontend target account or destination email is accepted.
- Request: cryptographically random 32-byte token, base64url link and SHA-256 stored hash. Invalidate older pending verification tokens; expiry is 20 minutes. An already verified email does not require another message. Recheck ambiguity before issuance and redemption; rely on the database unique index to close concurrency races.
- Persistent limits: proposed 60-second per-admin resend cooldown, maximum 5 requests/admin/hour and 20 requests/IP/15 minutes. Confirmation has an independent 20-attempt/IP/15-minute limit. Keys are hashed; password-recovery and Forgot Username counters are not reused. Enforce limits on the backend, not merely a disabled button.
- Link: use only validated `APP_URL` (HTTPS in production), never the request Host header. Carry the token in a URL fragment, remove it from the address bar into temporary component state, never localStorage, analytics or logs. API confirmation sends it only in a POST body; disable caching and use a no-referrer policy for the verification surface.
- Require an explicit confirmation action so email security scanners or page loads do not consume tokens. The bearer token proves mailbox access; it does not create a login session or reveal account identity. At redemption the backend checks token validity, user ID, current normalized email, active administrator role, uniqueness and one-time use before setting the timestamp and consuming the token in the same transaction. Follow consistent user-row/token-row lock ordering to prevent email-change races/deadlocks.
- Return generic invalid/expired/already-used errors; do not disclose which account owns a link. Never log raw email-provider/SQL payloads, account addresses or sensitive tokens. A successful request is not proof of mail delivery or verification; only validated redemption sets the timestamp.

## Backup and execution gates

1. Confirm the current source project and its environment with the owner. Production needs separate explicit approval. Confirm the intended restore target is a different, approved test project.
2. Create a fresh complete logical backup, plus exact schema/ACL/RLS snapshots of `users`, its identity sequence, migration metadata and authentication tables. Store credentials/data outside the repository with restricted permissions. The earlier migration-005 backup is not a substitute for a fresh migration-006 backup.
3. Verify archive integrity, then restore and compare the application schema, grants/policies, row counts/data checksums and sequence states on the isolated target. Document Supabase-managed metadata differences and any platform assets/keys not covered; do not claim an exact platform clone from an application-only test.
4. With explicit authorization for that isolated target, apply migration 006 there first and test verification, security roles, existing admin/staff login, profile operations and unchanged password-reset behavior. Verify clients cannot set verification status directly while the server role still works. Never test against live administrator records automatically.
5. Present the environment, fresh backup/restore result, exact SQL, permission changes and rollback outcome. Wait for explicit approval before applying the migration to the source. Do not register it for automatic startup or deploy to production as part of merely approving local implementation.

## Rollback

Operational rollback: disable the verification feature and drain in-flight verification requests, while retaining users-table security hardening. Existing username/password login, recovery email editing and Forgot Password remain available through the existing backend APIs.

Full feature-schema rollback is in `scripts/rollback-admin-recovery-email-verification.sql`. With explicit approval it removes only the new verification trigger/function/tables, email-specific index/check, verification column and version-6 metadata. It preserves account identities, email values, passwords, sessions, bookings and original recovery tokens. Export verification records first if their audit history must be retained.

The rollback **deliberately does not disable users RLS or restore the pre-existing client grants**. Reopening direct client access to account data is a security downgrade and would require separate explicit approval using the captured ACL snapshot. Server access remains supported with hardening retained. No blanket full-database overwrite is part of normal rollback.

## Testing plan and current limits

Not yet executed: migration, rollback, verification code, real email delivery or any account mutation. This phase is inspection and approval preparation only. No claim of working verification is made yet.

After implementation, test active-admin-only requests; staff/unauthenticated denial; current-account/destination binding; hashing; 20-minute expiry; single-use/concurrent redemption; email change-and-revert; duplicate/case/whitespace conflicts; backend-only status; resend/IP/account limits; trusted-origin links; safe errors/logs; verified/unverified UI and stale draft behavior; explicit confirmation; existing login/reset/session behavior; mobile/desktop layout; build/lint and related tests. Tests of real database writes or real mail require an approved test environment/recipient; mocked tests must be identified as such.


## Preparation update — 7 November 2026

The owner confirmed the current project is development/test and authorized preparation only. See [migration-006-review.md](migration-006-review.md) for the exact SQL hashes, fresh backup, permission changes, rollback and verification limitation. A full logical backup was created; archive integrity and 20 restored application-table data checks passed. The transactional restore test failed at permission equivalence and rolled back. Automatic approval review rejected a proposed remote default-privilege adjustment, so full backup restore verification is incomplete. Migration 006 remains unexecuted and unregistered. No application feature was enabled.

### Approved test outcome — supersedes the preparation limitation

The owner explicitly approved isolated temporary permissions and rollback testing. Distinct project IDs were confirmed. Required role attributes/memberships matched; 20 restored application-table data assertions passed. The combined schema/security equivalence check failed, so testing stopped without a retry. A before/after audit verified the restore project's data, schema, sequence values, role memberships and default permissions returned to their prior state. The original database was read-only; migration 006 remains unexecuted. Full details and remaining verification gaps are in [migration-006-review.md](migration-006-review.md).

### Latest verification update — PASS

The one additionally authorized isolated restore test on 7 November 2026 passed: 20/20 application data assertions, strict schema/security comparisons, matching required roles/memberships and 17/17 sequence checks. Only harmless function-definition line endings were normalized. Rollback was independently verified against the captured target state. Secure evidence is in `diagnostic-NGHI2k` under the backup directory. See [the review](migration-006-review.md) for every sequence result and the full limitations. The original database was read-only; migration 006 and feature activation remain unapproved and unexecuted. The application backup prerequisite is met; this was not a test of migration 006 itself.
