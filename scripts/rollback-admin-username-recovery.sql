-- Manual rollback ONLY after disabling frontend/backend feature flags and draining requests.
-- Removes only the new username-recovery feature, not users or password recovery.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(8216042, 1);
DROP TRIGGER IF EXISTS invalidate_admin_username_recovery_on_account_change ON users;
DROP FUNCTION IF EXISTS invalidate_admin_username_recovery();
DROP TABLE IF EXISTS admin_username_recovery_tokens;
DROP TABLE IF EXISTS admin_username_recovery_limits;
DELETE FROM schema_meta WHERE version = 5;
COMMIT;
