-- REVIEW ONLY. Run only with explicit rollback approval, after disabling the feature
-- and draining verification requests. Export verification audit data first if needed.
-- This intentionally RETAINS users RLS/client-access hardening; it does not reopen
-- the audited pre-existing anonymous/authenticated direct access to account data.
-- Restoring those old permissions would require separate explicit security approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(8216042, 1);

DROP TRIGGER IF EXISTS invalidate_admin_recovery_email_verification_on_change ON public.users;
DROP FUNCTION IF EXISTS public.invalidate_admin_recovery_email_verification();
DROP TABLE IF EXISTS public.admin_recovery_email_verification_tokens;
DROP TABLE IF EXISTS public.admin_recovery_email_verification_limits;
DROP INDEX IF EXISTS public.users_admin_recovery_email_unique;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_admin_recovery_email_canonical;
ALTER TABLE public.users DROP COLUMN IF EXISTS recovery_email_verified_at;
DELETE FROM public.schema_meta WHERE version = 6;

COMMIT;
