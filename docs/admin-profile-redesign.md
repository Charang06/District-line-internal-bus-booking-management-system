# Admin Profile redesign and secure Change Username

Implemented on 7 November 2026. Scope is the existing administrator profile and its new self-service username endpoint. No migrations, live profile operations, storage uploads, or remote account mutations were performed. The configured remote database was treated as production for this task; inspection used `BEGIN READ ONLY` and read catalog definitions only, not account values.

## Inspection findings

- `AdminProfile.jsx` already supported display names, photos (JPEG/PNG/WebP/GIF, maximum 2 MB), password changes and recovery-email editing. Those existing API routes and upload/storage mechanism are retained.
- The actual PostgreSQL `users.username` column is text with deterministic default collation and an existing `UNIQUE (username)` constraint, backed by `users_username_key`. Login uses exact `WHERE username = ?` matching. Case-sensitive uniqueness therefore remains unchanged across administrators and staff.
- User relationships reference `users.id`: sessions, booking creators/cancellers, crew, trips, finance, recovery tokens and related ownership. Audit records also use internal IDs; historical audit text need not be rewritten. Profile-photo filenames use internal IDs. No permanent relationship depends on a username foreign key.
- Authentication joins sessions to the current user row on each request. Ordinary profile edits retain these ID-based sessions. The new username action follows that policy and refreshes the visible account using the existing `publicUser` serializer. Password changes continue using the existing session-revocation/rotation handler.
- Existing general username validation allows 3–32 letters/numbers/dots/underscores/hyphens. It is unchanged. Only the new administrator action uses the requested compatible subset: trim surrounding whitespace, 4–30 ASCII letters/numbers/underscores/periods. Existing legacy usernames are not rewritten or rejected at login.
- An existing database trigger invalidates outstanding Forgot Username tokens when a username changes. The new action uses that existing protection; it does not change password-reset tokens or the Forgot Password process.
- Email ownership verification is not implemented. The UI accurately shows “Email ownership not verified,” or that no recovery email is registered. No false verification state or automatic verification is introduced.

## Files changed for this task

- `src/components/AdminProfile.jsx`: profile redesign, three keyboard-accessible tabs, preserved drafts, photo controls, password visibility, safe close/dirty handling, and the Change Username dialog.
- `src/components/AdminProfile.css`: scoped navy/gold theme with modern sans-serif typography, fixed modal header/footer, scrollable content and responsive/visual-viewport behavior. It does not style other pages or modals.
- `src/api.js`: `changeUsername` method, using existing credentialed fetch behavior.
- `server/server.js`: new authenticated, administrator-only `PATCH /api/profile/username` route and handler import. Existing login/profile/photo/password/recovery routes are unchanged.
- `server/admin-profile-username.js`: validation, password reauthentication, locked account lookup, atomic username update, safe response and audit entry.
- `server/admin-profile-username.test.js`: backend service/HTTP tests using synthetic accounts, actual bcrypt and an isolated fake transaction store. No configured database connection.
- `artifacts/admin-profile-review/`: local mocked browser harness, repeatable browser check, result JSON, and desktop/mobile screenshots. These artifacts are not included in the application entry point or production build.
- This report.

## Security and behavior

The endpoint uses the existing cookie authentication and administrator middleware. It derives the account ID from the authenticated request and checks the locked database account's role/status again. Body-provided IDs, roles and permissions cannot select or modify another account. The current password is checked using the existing bcrypt comparison method.

The username update and ID-based audit entry occur in a single transaction. There is no availability-check/update race: the existing database unique constraint determines collisions, including staff usernames and concurrent changes. A conflict returns 409 without revealing which account owns the username. Audit/update failure rolls the transaction back. Raw SQL errors, password hashes and passwords are not logged or returned. Incorrect reauthentication returns 400 so the frontend does not mistakenly expire a valid login session on a 401.

The update changes only the authenticated administrator's username; ID, role, permissions, password hash and relationships remain intact. The returned sanitized account immediately updates the profile and application state. Future logins use the updated exact username through the existing login query. Other browser sessions read the updated account on subsequent authenticated requests; their existing cookie lifetimes are unchanged.

Native modal dialogs provide inert backgrounds and dialog semantics, with explicit focus wrapping, Escape handling, focus restoration and pending-operation guards. Closing warns before discarding drafts; switching tabs retains them. Only the outer modal locks body scrolling, so nested-dialog unmounts cannot leave scrolling locked after an external logout/unmount. Inputs use the requested palette and autofill overrides. The modal tracks the visual viewport and reduces nonessential header content in short viewports.

## Verification

- Ten new backend tests passed: validation/normalization; successful self-update and safe serialization; wrong password; missing/invalid fields; role/target spoofing; stale role/status; unique conflicts; exact/case-sensitive equality; audit/DB failure rollback; HTTP response without a new session cookie.
- Browser checks passed with a synthetic account and **all API calls mocked**: open/close; keyboard tabs; focus traps in both dialogs; focus restoration; unsaved drafts and discard warning; name save; password mismatch/visibility/clearing; recovery save/neutral verification status; oversize-photo rejection and existing upload payload; username wrong-password/conflict/success; close blocking during pending operations; forced unmount/body-scroll cleanup.
- Bounds and horizontal-overflow checks passed at 360×800, 390×844, 768×1024, 1024×768 and 1440×1000. A 390×400 short-viewport check passed. Desktop/mobile screenshots are in `artifacts/admin-profile-review/`.
- Final `npm test`: 35 passed, 3 skipped (the two explicitly opt-in PostgreSQL tests from the earlier recovery work, and one existing legacy integration test). No remote database tests were enabled for this task. Build passed. Lint completed with existing warnings; the new profile source, tests and review harness pass targeted lint without warnings. No dedicated type-check script is configured.

Not exercised against remote records: actual name/photo/email/password/username writes, real administrator/staff sign-in, live password recovery, real storage upload and session-cookie changes. These existing authentication/profile handlers were preserved and the new handler was tested locally. The PostgreSQL unique constraint/ID references were confirmed by read-only inspection; no live collision/race test was run. Browser checks used Chrome, not physical mobile keyboards, Firefox or Edge.

Restart an already-running backend/development server to register the new route. No database migration or configuration change is required.
