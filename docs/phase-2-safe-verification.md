# District Line Phase 2 — safe verification preparation

**Outcome: NOT RUN; staging verification is not ready to execute.** Completed 11 November 2026 by static review and secret-safe local configuration inspection. No database socket was opened, no SQL was executed, no load test was run, and no database or application records were changed.

## 1. Database diagnostics

Reviewed `scripts/performance/read-only-database-diagnostics.sql`. It uses a `BEGIN READ ONLY` transaction, a bounded local statement timeout, catalog/statistics SELECTs, and `ROLLBACK`. It does not call `EXPLAIN ANALYZE`, reset counters, or issue DDL/DML. It reports estimated table rows and sizes, table/index scan counters, index definitions/sizes, possible missing leading FK indexes, database counters, visible connection settings, and aggregate connection activity without query text or client addresses.

The connection-activity and `pg_settings` views can be permission-limited by the Supabase role; an empty/permission-denied result is not proof that connections or limits are absent. Table/index counters are cumulative since the reported statistics reset and must be read with that reset time. `pg_stat_user_tables` row counts are estimates. This SQL does not return CPU/memory/storage quota metrics or workload-specific plans. A plan should be run separately with synthetic literals on staging, after checking the exact query, using a short timeout; `EXPLAIN ANALYZE` executes the SELECT and may consume resources.

**Target gate:** The root `.env` was parsed with the application's environment loader without displaying credentials. Its database URL matches the production project fingerprint documented in this repository and uses Supabase pooler port `6543`. It does not contain a database maintenance target digest. No explicit approval for production diagnostics was provided; the request authorizes only an explicitly approved target. Therefore no connection was attempted and this script must not be run from the current configuration. Set up an owner-approved staging/disposable target in a separately reviewed environment, then independently confirm its identity before any connection.

## 2. Connection pooling

- **Observed locally (source + non-secret URL metadata):** `server/server.js` creates a `pg.Pool` with max 5 connections per Vercel function process, acquisition timeout 10,000 ms when `VERCEL` is set (5,000 ms locally), idle timeout 5,000 ms on Vercel (30,000 ms locally), and keepalive. The local URL is on pooler port 6543, the Supabase transaction-pooler port. The runtime preserves that URL port.
- **Compatibility:** Application transactions acquire one `PoolClient` and issue `BEGIN`/queries/`COMMIT` on that same client; this is compatible with transaction pooling. Inspected normal query code does not depend on session-local temporary tables or persistent session advisory locks. Startup's baseline verification is read-only. Do not infer that every serverless invocation holds one DB connection for the user's whole session.
- **Scaling implication:** `max: 5` is per Node process, not a deployment-wide cap. Aggregate pooler client demand can approach active function instances × 5, plus other clients. Vercel instance count/concurrency and Supabase pooler limits are plan/project settings unavailable here. No safe aggregate maximum can be calculated from the repository.
- **Not verified:** Current Vercel production variables, function concurrency/instance ceilings, Supabase compute tier, pooler configured limits, direct-vs-pooler setting outside this local `.env`, and observed pool wait/connection exhaustion behavior. Local process environment had no Vercel deployment markers. No settings were changed.

The server emits per-request pool `total`, `idle`, and `waiting` counts plus acquisition timing; use these staging log fields with provider metrics. The code's acquisition timeout is a failure bound, not evidence that the chosen values fit current provider limits.

## 3. Staging readiness and load script

The current workspace is **not staging-ready**: it points at the documented production database project; no approved staging host, isolated staging database identity, 50 synthetic accounts, synthetic trip fixture, or cleanup procedure has been supplied/verified. This phase did not make a network request.

Review found the original script's substring-only host check was insufficient to establish an approved target; it also treated a documented expected 403 like a success status. The script has been tightened as a test artifact (no application code changed): it now requires an exact `STAGING_APPROVED_HOST` for remote execution, a host with a `staging` or `preview` label, a separate explicit marker, a non-production-like label, 50 distinct test accounts, and an explicit synthetic trip ID/date. Redirect following is disabled. It reports request rate, HTTP error rate and latency p50/p95/p99. Permission-denied accounts expect and separately check HTTP 403.

The remote-host check reduces accidental targeting but cannot prove from a hostname that the deployment is connected to an isolated database. The owner must independently approve the exact host and confirm the deployment's API environment points to the approved isolated database. Do not set approval variables until those checks are complete.

The script performs only reads of trip/booking/cargo/dashboard resources; it does not call booking mutation, cargo mutation, SMS, or email endpoints. Login creates persistent `auth_sessions` rows, and auth middleware may touch session activity timestamps. These are staging-only session writes, not business-record writes. Session rows expire by application policy; use a staging-only account cleanup after testing. The script assumes every test user can view trips, bookings, cargo, dashboard and customer scope; only Accounts access is permission-conditional. Validate those permissions before execution.

Prepared load levels are staged 10, 20, then 50 VUs, with two minutes at each level and a one-minute ramp-down by default. p95 read API target remains under 500 ms and p99 under 1,000 ms as an added observation threshold; the global unexpected HTTP error threshold is under 1%. The script summary includes p50/p95/p99, requests per second, error rate, and check counts. Run each level as a separately recorded trial as well as the combined ramp, if interpretable per-level percentiles are required. k6 defaults do not provide CPU/memory/database metrics; collect those from Vercel/Supabase dashboards during the approved run.

100 VUs remain excluded; it is an optional future test requiring separate scope and approval.

## 4. Booking concurrency test plan (isolated staging only)

Use a dedicated synthetic trip and known-free seats, synthetic accounts with booking-manage permission, unique synthetic passenger values, and an isolated database snapshot. Confirm a cleanup plan before creating fixtures. Do not use live customer records. No tests were executed in this phase.

| Case | Controlled action | Acceptance evidence |
|---|---|---|
| Two clients, same seat | Synchronize two POSTs to the same trip/seat | Exactly one 201; one conflict (409); exactly one confirmed row for that trip/seat |
| Ten clients, same seat | Barrier-release ten POSTs to one trip/seat | Exactly one 201; nine 409 conflicts; one confirmed row; no 5xx |
| Different seats | Concurrent POSTs to distinct free seats | Every expected request succeeds; all seats distinct and confirmed |
| Booking/cancellation overlap | Race a create on a free seat against cancel of a separate synthetic booking; repeat with coordinated timing where meaningful | Each final state matches one serializable order; no duplicate confirmed seat and no partial booking/cancel state |
| Failure rollback | Cause a deterministic failure after a transaction begins in a test-only harness/proxy, then inspect synthetic rows | Failed operation leaves no partial booking; pool client returned; subsequent request succeeds |
| Duplicate submit/retry | Replay identical create after success; simulate timeout after server commit then retry same body | Existing uniqueness invariant prevents a second active booking for that seat. Record response semantics and exactly one active row. API has no explicit idempotency key, so a lost response is not guaranteed to replay the original 201; do not claim exactly-once request semantics. |

The partial unique index `uniq_active_trip_seat` on confirmed `(trip_id, seat_number)` is present in migration 001 and is the final database invariant. The route also checks availability inside a transaction and maps unique violations to 409. This is promising source evidence, not a completed concurrency result. The test harness must assert DB rows after the race, not only HTTP responses. Avoid adding test-only triggers/schema to any shared or production database.

## 5. Monitoring checklist for an approved staging run

- **Vercel API:** request count/RPS, p50/p95/p99 duration, 4xx/5xx, function duration, timeout/cold-start signals, CPU and memory if exposed by plan.
- **Application logs:** `api_perf` request IDs, route/status, `db_acquire_ms`, `db_query_ms`, pool total/idle/waiting; `db_acquire_error` and `db_query_error`; booking 409 vs 5xx. Inspect for sensitive values before sharing logs.
- **Supabase:** CPU, memory, disk/storage, database connections/connection limit, pooler client/backend counts, query latency, locks/deadlocks and storage growth. Record plan and sample interval.
- **Booking outcomes:** count 201/409/5xx and query synthetic fixture rows before/after. Require zero duplicate confirmed trip-seat pairs.
- **Stop conditions:** sustained p95 over 500 ms for reads, booking p95 over 1,000 ms once write tests are separately approved, unexpected 5xx over 1%, rising pool waiters/acquisition timeouts, resource limits approaching exhaustion, or any unexpected fixture/data change.

No new monitoring vendor/service is proposed.

## 6. Critical risks and next approvals

1. **Critical operational guard:** this workspace's local `DATABASE_URL` points to the documented production project. Do not run diagnostics or local application startup against this environment. No connection was made. Configure a separate staging environment and prove its project identity first.
2. **Connection budget unknown:** the local runtime pool is five per process, but active Vercel instance count and Supabase plan/pooler caps are unknown. The 10–50 user capacity cannot be inferred from pool configuration.
3. **Unknown-commit retry semantics:** seat uniqueness protects against simultaneous active duplicates, but booking requests have no idempotency key. A retry after a lost response can return 409 rather than the original booking result; assert one active row and document this behavior.
4. **Unmeasured report/query costs:** customer analytics and broad cargo/dashboard lists may grow with data. Live query plans and stats remain uncollected.

**Approvals/information needed before any execution:**

1. Approve the exact isolated staging Supabase project/database fingerprint and its use for read-only diagnostics; provide/confirm a staging-only connection through an approved secret channel. Do not provide the production URL for this task.
2. Approve the exact staging API hostname and confirm its Vercel deployment targets that isolated database. Confirm synthetic-only accounts/trip data and cleanup owner.
3. Approve the precise k6 read workload and time window. This is separate from approval for write/concurrency tests.
4. Separately approve synthetic booking/cancellation concurrency tests and the isolated failure-injection method/cleanup. No production test approval is requested or appropriate.
5. Provide owner-visible Vercel/Supabase plan and limit information (or approve read-only dashboard review) to calculate the actual connection budget and resource headroom.

Until those items are met, do not run the SQL diagnostics, k6, or integration writes. Verdict remains **NOT YET VERIFIED** for 10, 20, and 50 concurrent users.
