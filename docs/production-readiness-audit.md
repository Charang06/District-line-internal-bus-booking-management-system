# District Line production readiness audit

**Status: NOT YET VERIFIED.** This is a read-only source and documentation review of the active workspace on 11 November 2026. No production or database connection was made, no migrations or application changes were applied, and no load test was run. Capacity claims, production configuration and live database statistics therefore remain unverified.

## Executive assessment

The architecture is reasonable for ten staff users: a React/Vite client, Express API, PostgreSQL accessed through `pg`, and persistent PostgreSQL sessions. Vercel's serverless hosting and the Supabase transaction pooler can support horizontal function instances in principle. The application does not hold login sessions or scheduled jobs in process memory. That does not demonstrate that the deployed Supabase plan, Vercel limits, pooler budget or APIs meet the 10/20/50-user targets.

The most concrete performance risks in source are broad, unpaginated endpoints and reports that aggregate across complete tables. The booking path is guarded by a database partial unique index, which is the correct final defense against double-booking; its simultaneous behavior still needs isolated integration tests. Existing code has request timing and pool-wait telemetry, but no percentile/throughput evidence was found.

## Findings by area

### Architecture and runtime

- `server/server.js` configures a `pg.Pool` with max 5 per Vercel function instance (10 locally), 10s acquisition timeout on Vercel (5s locally), 5s Vercel idle timeout, keepalive, and an idle-client error handler. Per-instance max is not a global cap: total possible connections depend on active function instances and the Supabase pooler/database limits. The deployed connection string/mode and platform limits were not independently verified.
- Session IDs are random, stored hashed in PostgreSQL and carried in an HttpOnly cookie; source sets SameSite and Secure in production and expires after 30 minutes idle/eight hours absolute. This supports multiple instances. The database is a shared dependency; database outages prevent authenticated requests.
- Vercel image uploads are documented to use Supabase Storage, not ephemeral function disk. Local uploads and the single-process local listener are development paths.
- No application cron/scheduler was found. Backup workflow docs describe an inactive/deferred schedule, not an operating job. SMS/email are synchronous external calls on their respective request flows; SMS has a 15-second timeout. They should be excluded from load scenarios.
- Vercel functions can scale horizontally, but the total connection budget, rate-limit behavior, cold-start latency, and external provider constraints need measured staging validation before enabling more instances.

### Database indexes and query shapes

Migration 001 defines primary/unique indexes, `uniq_active_trip_seat` on `(trip_id, seat_number) WHERE status='confirmed'`, `idx_trips_date_route`, `idx_bookings_trip`, `idx_cargo_date`, and duty/date indexes. Migration 002 indexes session user and expiry. These are useful baseline indexes. A source scan does not reveal runtime index usage, duplicate indexes, table sizes, selectivity or sequential scan cost; obtain catalog evidence using `scripts/performance/read-only-database-diagnostics.sql` on the approved target.

Source-backed candidates to measure before proposing migrations:

| Candidate | Evidence and expected benefit | Write cost / decision |
|---|---|---|
| `bookings(trip_id, seat_number) WHERE status='confirmed'` | Existing unique index already serves seat lookup and enforces uniqueness; no additional index proposed. | Already incurs write maintenance; retain. |
| `trips(travel_date, route_code)` | Existing index supports date/route filters. Check `EXPLAIN (ANALYZE, BUFFERS)` for actual trip list and whether bus filtering needs a different key. | No change without plan and selectivity evidence. |
| `bookings(trip_id,status)` and `cargo(travel_date)` | Existing indexes cover common joins/date filters. The bookings list also sorts across trip date, booking timestamp and ID, which may still sort after joins. | Candidate composite indexes require `pg_stat_user_indexes` and actual query plan evidence first. |
| Customer/cargo text search | Booking search uses leading-wildcard `LIKE` over name/contact; cargo search uses several leading-wildcard fields. Ordinary b-tree indexes do not accelerate these patterns. Consider trigram/full-text only if measured and extension support is confirmed. | Adds extension/index write and storage costs; no migration recommended yet. |
| Dashboard/customer analytics | Customer scope normalizes phone strings and aggregates across confirmed bookings; full dashboard reads all daily expenses and groups bookings/cargo without date bounds. Query cost grows with history. | Potentially the highest query-cost risk; measure with representative synthetic data before considering pagination, summary tables or API changes (all currently prohibited). |
| Foreign-key references | PostgreSQL does not automatically index referencing columns. Some hot paths have coverage (booking trip, sessions user); many references do not. | Inspect FK catalog and plans; low row counts may make extra indexes wasteful. No indexes created/deleted. |

No duplicate/unused index determination is possible without live catalog statistics. Use `pg_stat_user_indexes` cautiously: counters reset and low-volume internal systems may have legitimate indexes reported unused.

### Booking concurrency and reliability

`POST /api/bookings` begins a transaction on one checked-out client, checks availability, inserts, commits, and translates unique violations to HTTP 409. `uniq_active_trip_seat` supplies the cross-request invariant even if two transactions pass the pre-check concurrently. Cancellation updates status in a transaction, releasing the partial unique key. This is strong source evidence, but not proof of correct behavior under contention, network disconnect/retry, or transaction-pooler failure. There is no visible request idempotency key for booking creates; a retry after an unknown commit outcome could create a second booking on another seat if the client resubmits changed data. Test this only with synthetic data in isolated staging.

The booking transaction has a small number of DB round trips and no external SMS inside the transaction. Request logs record query/acquisition durations. Confirm rollback/release behavior under injected failures and ensure no client leaks using staging integration tests.

### API performance and capacity

- `/api/trips` returns all matching trips and hydrates each trip; it has no pagination.
- `/api/bookings` supports page/pageSize (max 200; trip scoped max 500) and performs separate count plus page queries.
- `/api/cargo` returns all matches without pagination; unfiltered search can return the full table.
- Dashboard customer analysis scans and normalizes confirmed booking history. Accounts/dashboard scope fetches all expenses and grouped booking/cargo summaries. The broad default dashboard runs many parallel queries and loads several capped 200-row lists, then performs JS aggregation/sorting.
- Express JSON body limit is 8 MB. This may be larger than necessary, but changing it requires separate review.
- Dynamic SQL values are parameterized in inspected booking/trip/cargo paths; query fragments are built from fixed application clauses.
- No p50/p95/p99, RPS, HTTP error rate, DB query percentiles, or representative concurrent results are present in the source evidence. They must be collected from staging before the 10/20/50-user thresholds can be judged.

### Security and permissions

The inspected routes apply authentication and admin/staff page/action middleware; staff creation cannot assign admin role, and staff-management writes require admin. Database-backed session and authorization behavior should still be covered by direct API tests for each representative role/permission combination. Static source review is not a runtime permission verification.

Production CORS uses a configured allowlist; credentials are enabled. Login rate limiting is explicitly disabled by default in `.env.example`; MFA is also off by default. Confirm production env and compensating controls. Parameterized SQL is common in examined routes. HTTPS termination, secret values, Supabase grants/RLS and actual deployed CORS origin were not inspected.

Logging assigns request IDs and records route/status/elapsed time, DB acquisition/query totals, statement labels and pool counts without SQL values. Some handlers call `console.error(error)` directly; review production log redaction because driver/provider error messages may include sensitive details. User/pass/session tokens should never be added to request logs. Error middleware and all routes need a full pass before certifying this area.

### Backups, recovery, monitoring

Existing docs state an encrypted database backup and isolated application restore were completed earlier, while the automated backup workflow and R2 destination remain inactive/deferred. This audit did not revalidate those artifacts or key availability. Confirm the owner-held recovery key, current backup age, independent copy, restore runbook, external Storage object coverage and recent restore drill before relying on recovery objectives.

Source logs expose API/DB timings and pool pressure, but CPU, memory, event-loop delay, garbage collection, Supabase utilization and disk metrics are provider/runtime monitoring tasks. Set alerts after measuring normal staging/production baselines; useful initial signals include sustained pool waiters/acquisition timeouts, elevated 5xx, DB CPU/storage thresholds, function memory near limits, and booking conflict/error spikes.

## Readiness matrix

| Requirement | Evidence status |
|---|---|
| Architecture appropriate in principle for ~10 staff | Supported by source; capacity not measured |
| Persistent multi-instance sessions | Source supports it; staging instance-switch test pending |
| 10 concurrent users | Not tested |
| 20 concurrent users | Not tested |
| 50 concurrent users | Not tested |
| Optional 100-user stress | Not tested |
| No double bookings under contention | Database invariant present; isolated concurrency test pending |
| Database index usage / slow plans | Not verified against live catalog/statistics |
| CPU, memory, DB utilization | Not measured |
| Permission enforcement by direct API | Partial source evidence; role matrix runtime test pending |
| Backup restore readiness | Historical docs only; current artifact/key/drill not revalidated |

**Verdict: NOT YET VERIFIED.** Do not represent the application as production-ready for the requested concurrency levels until staging tests and live configuration checks are completed and reviewed.

## Safe next steps

1. Provision/identify an isolated staging database with synthetic records and known-empty booking fixtures; confirm the correct Supabase pooler URL/mode and plan limits.
2. Run the read-only catalog diagnostics and capture representative `EXPLAIN (ANALYZE, BUFFERS)` plans there; do not create indexes based on estimates alone.
3. Review test accounts/permissions and prepare a synthetic trip plus documented cleanup for load scripts. Disable SMS/email delivery in staging.
4. After explicit approval, run 10, 20, then 50 VU staged tests with ramp-up, think time and stop thresholds; record duration, RPS, p50/p95/p99, errors, successful bookings/conflicts, pool counts, CPU and memory. Stop if 5xx exceeds 1%, p95 targets are exceeded persistently, or resource limits approach exhaustion.
5. Run same-seat races with 2 and 10 synthetic clients and verify exactly one confirmed booking; test different seats, rollback and cancellation/retry scenarios. Do not use production records.

No code, schema, index, hosting setting, or database configuration change is recommended at this stage. Any future change should follow the evidence and approval process in the request.
