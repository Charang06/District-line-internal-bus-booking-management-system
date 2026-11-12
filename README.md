# District Line Bus Booking

Internal React/Vite frontend with Express API functions and PostgreSQL-backed sessions.
Current release assessment: [final blocker resolution](docs/handover/districtline-final-blocker-resolution.md).
Previous evidence: [complete readiness report](docs/handover/districtline-complete-release-readiness.md).
Historical Phase 12-14 reports retain their original scope/results.

## Local startup

Use only an independently verified disposable synthetic database. Never point development,
Preview, integration tests or browser tests at production or protected backup/restore projects.
Normal startup **verifies the existing database baseline read-only**. It applies no migrations,
seeds no data and creates/updates no administrator accounts. Required schema_meta versions
are 1-4; existing approved recovery features have additional schema dependencies.
Missing prerequisites fail readiness instead of being repaired automatically.

Dependencies must already be installed for the current offline verification workflow.
For a separately authorized development setup, npm ci installs the lockfile dependencies;
npm run dev starts frontend/API and will attempt database readiness checks. Do not run
startup with protected configuration. Initialization/seeding/migrations require a separate
reviewed disposable-target procedure; they are never deployment hooks.

## Approved financial access and policy

Explicit Accounts View + Manage permits staff financial writes. View alone is read-only;
legacy Accounts permission does not grant Manage. Staff/crew administration stays admin-only.
Booking and cancellation permissions remain independent. Server guards enforce every write.
Accounts selector reads return only required crew fields and scoped duty financial data.

Manual revenue accepts exactly Standard, Intermediate, Special and Agent / Extra positional
rows: each count and the combined count must be at most 49. Fares use original nonnegative
whole-rupee validation, up to Rs. 100,000,000 per fare. Cargo has its own original 30-row,
description/tag and whole-rupee validation. No extra manual seat rows are supported.
Totals, locked persistence, dashboard arithmetic and duty finalization follow the verified
production baseline; expense-submission limits are independent of manual-revenue limits.

## Safe verification

Do not use broad npm test without reviewing every included test; it includes integration
and backup-related files. The final readiness report records the exact offline selection.
The release preparation scripts use installed dependencies, disable environment-file loading,
and never start the real API. Browser checks use synthetic fetch responses and fresh profiles.
An offline mock success is not PostgreSQL, provider, delivery or production acceptance.

npm run build normally writes dist and copies public files, including local uploads if present.
Release verification instead compiles a reviewed clean candidate in memory. Never build/upload
the complete working directory or copy historical dist/node_modules/artifacts into a candidate.

## Existing Vercel project: future authorized release only

Target the existing project serving https://districtlinebooking.com/; do not create/import a
new project or push the current HEAD wholesale. Tracked artifacts include browser profiles and
personal-image copies; .gitignore does not remove these from Git history or ordinary Git uploads.
Use only the final reviewed explicit manifest and checksums, without .git, environment files,
credentials, uploads, backups, artifacts, operational tools, tests or unapproved SQL.

Local configuration uses Vite, npm run build, dist, sin1 and existing API/SPA rewrites.
Only inert registered baseline SQL 001-004 plus the public TLS CA/helper are explicitly included;
008/009 are explicitly excluded. This does not run migrations or certify Vercel tracing.
No Node engine is pinned; confirm the provider runtime matches installed build requirements.
Native sqlite3 clean-Linux installation and function tracing still require external verification.

Before any Preview approval, independently confirm project identity, source/deployment IDs,
non-secret build settings/flag states and isolation of Preview database/storage/providers.
Never connect Preview to production Supabase. Keep unapproved MFA/login-limiter/recovery flags
off; frontend VITE flags are build-time and must match approved server feature states.
Keep secrets server-side and never expose them through VITE variables. No secret values belong
in repository documentation or candidate manifests.

Normal hosted uploads require separately approved persistent storage; the function filesystem
is ephemeral. Preserve strict certificate/hostname verification and the included public CA.
Sessions remain persistent hashed tokens in HttpOnly cookies with existing idle/absolute expiry;
verify origin/CORS/Secure/SameSite behavior on an isolated target. Existing recovery flows require
their original approved schema/provider configuration; release preparation sends no email/SMS.

Promotion requires actual isolated database/browser/Preview acceptance, verified compatible
rollback deployment and explicit production approval. Code rollback does not restore data,
schema, storage or feature configuration. Follow the exact gates in the final readiness report.
