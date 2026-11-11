-- Read-only catalog snapshot for an owner-approved staging session.
-- Run in a read-only transaction. Does not execute ANALYZE, EXPLAIN ANALYZE,
-- reset statistics, or modify database state.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

-- PostgreSQL/Supabase version, current database, and session identity.
SELECT current_database() AS database_name,
       current_user AS database_role,
       current_setting('server_version') AS postgres_version,
       pg_postmaster_start_time() AS server_started_at;

-- Relation size and estimated row count (planner estimates, not exact counts).
SELECT schemaname, relname AS table_name, n_live_tup AS estimated_rows,
       n_dead_tup AS estimated_dead_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       seq_scan, seq_tup_read, idx_scan, idx_tup_fetch,
       n_tup_ins, n_tup_upd, n_tup_del, last_vacuum, last_autovacuum, last_analyze
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- Index definitions and usage since the statistics were last reset.
SELECT s.schemaname, s.relname AS table_name, s.indexrelname AS index_name,
       s.idx_scan, s.idx_tup_read, s.idx_tup_fetch,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
       i.indisunique AS is_unique, i.indisprimary AS is_primary,
       pg_get_indexdef(s.indexrelid) AS definition
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
ORDER BY s.schemaname, s.relname, s.indexrelname;

-- Foreign keys whose referencing columns have no leading index column.
WITH fk AS (
  SELECT c.oid, c.conname, c.conrelid, c.conkey,
         n.nspname AS schema_name, t.relname AS table_name,
         pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE c.contype = 'f' AND n.nspname = 'public'
)
SELECT fk.schema_name, fk.table_name, fk.conname, fk.definition
FROM fk
WHERE NOT EXISTS (
  SELECT 1 FROM pg_index i
  WHERE i.indrelid = fk.conrelid
    AND i.indkey[0] = fk.conkey[1]
)
ORDER BY fk.table_name, fk.conname;

-- Available database-level connection and utilization snapshot.
SELECT datname, numbackends, xact_commit, xact_rollback,
       blks_read, blks_hit, deadlocks, conflicts, stats_reset
FROM pg_stat_database
WHERE datname = current_database();

-- Connection settings visible to the current database role.
SELECT name, setting, unit, source
FROM pg_settings
WHERE name IN ('max_connections', 'superuser_reserved_connections');

-- Aggregate activity only; deliberately excludes query text and client addresses.
SELECT COALESCE(application_name, '') AS application_name,
       COALESCE(state, '') AS state,
       COALESCE(wait_event_type, '') AS wait_event_type,
       COALESCE(wait_event, '') AS wait_event,
       COUNT(*) AS connection_count
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY application_name, state, wait_event_type, wait_event
ORDER BY connection_count DESC;

ROLLBACK;

-- For query plans, copy the exact representative SELECT from the current
-- application source, substitute synthetic staging values, and run separately:
-- EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT TEXT) <SELECT ...>;
-- Never explain mutating SQL with ANALYZE. Record row counts and plan output;
-- do not share passenger values or credentials in the report.
