-- PREPARED ONLY. Apply manually after approval; not part of startup migrations.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.admin_mfa (
  user_id INTEGER PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE public.auth_sessions ADD COLUMN mfa_verified_at TIMESTAMPTZ;
ALTER TABLE public.admin_mfa ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_mfa FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.admin_mfa FROM %I', role_name);
  END LOOP;
END $$;
COMMIT;
