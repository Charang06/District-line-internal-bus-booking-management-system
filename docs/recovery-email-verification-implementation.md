# Recovery email verification — local implementation

Status: application code implemented locally; migration 006 NOT executed; verification NOT enabled. No remote database connections, account changes, permissions changes or real email deliveries occurred in this implementation stage.

## Changes

- `server/admin-recovery-email-verification.js`: own-email validation/update handler, PostgreSQL adapter, verification service, router and sender using existing Resend REST credentials. No dependency added.
- `server/server.js`: mounts the default-off verification router and replaces only the existing own-email update callback. Existing login, Forgot Password, Forgot Username and booking handlers are unchanged.
- `.env.example`: documents disabled backend/frontend rollout flags. Actual `.env` was not edited; both new flags were confirmed absent/off.
- `src/api.js`: three verification API calls.
- `src/components/AdminProfile.jsx` / `.css`: existing Recovery tab shows backend-derived status, green verified icon, gold send/resend controls and cooldown. Unsaved changed email cannot be sent or shown as verified. Existing account/security layout and drafts are retained.
- `src/components/RecoveryEmailVerification.jsx` / `.css`, `src/data/recoveryEmailVerification.js`, `src/main.jsx`: dedicated explicit confirmation entry point for `#verify-recovery-email?token=...`. The fragment is stripped before rendering; no token is placed in storage or visible form fields. Other existing entry points remain unchanged.
- `server/admin-recovery-email-verification.test.js`, `src/data/recoveryEmailVerification.test.js`: mocked backend/storage/HTTP and pure URL tests.
- `artifacts/recovery-email-review/browser-check.cjs` / `results.json`: entirely mocked local-browser review; no real email or remote database access.

## Endpoints and security

`GET /api/recovery-email-verification/status` and `POST /api/recovery-email-verification/request` require the existing authenticated administrator session. The stable user ID comes only from the session; request-body IDs/emails/roles do not select the destination. Each storage operation rechecks current active administrator status. Registered emails are normalized and duplicate administrators (including inactive administrators) fail closed.

`POST /api/recovery-email-verification/confirm` uses the one-time bearer token and does not create or modify login sessions. GET/page render never consumes a token. Confirmation does not disclose account identity or its email.

Tokens are 32 cryptographically random bytes encoded as base64url. Only SHA-256 hashes are persisted, with stable user ID, exact canonical email, 20-minute expiration and used timestamp. Issuance retires prior pending tokens. Redemption locks the account before the token, checks current exact email/role/status/duplicates, consumes once, and sets the database verification timestamp in one transaction. Failure rolls back both writes.

Migration 006's reviewed trigger is the authority for atomically clearing verification and retiring pending verification tokens on recovery-email/role/status changes, including change-and-revert. The application updates the email within a transaction and preserves existing password-link invalidation. It does not reference new verification columns when saving email before the migration. The approved SQL is unchanged:

`5557a1be44b2ade93d362545265a3fab52ee1d026554abcef3f29e901e5180fe`.

The recovery-email save handler returns 400 for invalid addresses/canonical-check violations and 409 for duplicate emails/unique-index races. Unknown SQL failures return safe 503 responses without forwarding raw errors to the global logger. Its duplicate check works before migration; the approved database unique index closes concurrent-write races after migration.

Persistent independent limits use only the approved new table/scopes: request-IP 20/15 minutes, administrator resend cooldown 60 seconds, administrator requests 5/hour, confirmation-IP 20/15 minutes. Keys are hashed. Status/request responses give server-derived cooldowns; frontend timers are convenience only. Blocked/rejected requests can consume limit budget. No password/username-recovery counters are reused.

Email links use validated configured APP_URL, never request Host; HTTPS is required in production. Sender uses the existing server-side Resend REST pattern, a dedicated idempotency namespace and a 10-second timeout. Failed delivery invalidates the new token. Raw tokens, email-provider bodies, credentials and SQL payloads are not logged. Verification endpoints disable caching and set no-referrer; the link surface also sets a no-referrer meta policy.

## Disabled rollout

Both flags default false:

```
ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false
VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false
```

The disabled backend router rejects before auth/database access. Even with the flag enabled, the service requires valid sender/origin configuration plus recorded migration 006, the dedicated tables and verification column. There is no automatic schema migration or activation. The frontend does not request status/send while its flag is off; a verification link displays an unavailable message instead of consuming its token.

Only the local mocked browser's Vite process temporarily received the frontend flag. No actual configuration was changed. Tests never import/start `server/server.js`, avoiding its migration/seeding startup.

## Validation and remaining limits

Synthetic tests cover valid issuance/confirmation, hashing/binding, expiry at 20 minutes, replay/concurrent replay, malformed tokens, duplicate email refusal, current-role/status checks, unauthorized access, email change-and-revert, resend/hour/IP limits, failed delivery, safe errors, PostgreSQL adapter transaction ordering, constraint handling, schema gating, immutable SQL hash, explicit confirmation and existing URL-route preservation.

Browser review passed at 1440, 768, 390 and 360 pixel widths. It exercised send/resend/cooldown, verified status fetched from the backend, dirty-email blocking, email-save proof reset, status errors, explicit confirmation, fragment stripping and mobile overflow. All API responses were mocked.

The actual PostgreSQL verification adapter, migration trigger/index, concurrent transactions, role permissions, real delivery, and full existing login/reset/booking flows after migration still require the separately approved isolated rehearsal. Mocked tests are not represented as database integration evidence. The application-only backup restore pass remains separate from testing migration 006.

Next: review [the isolated rehearsal plan](migration-006-rehearsal-plan.md). No remote operation is authorized by this document.

Final local validation: `npm test` completed with **69 passed, 0 failed, 3 skipped** (two explicitly gated PostgreSQL tests and the legacy duty integration harness). The new feature/URL suite has 19 passing tests. Production frontend build, server syntax check, focused lint and whitespace checks passed. Mocked browser results are in `artifacts/recovery-email-review/results.json`. No remote integration or actual email test was run.
