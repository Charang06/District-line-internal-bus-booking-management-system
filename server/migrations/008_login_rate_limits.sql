-- PREPARED ONLY: manual approval required. Never registered at application startup.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.login_rate_limits (
  scope TEXT NOT NULL CHECK (scope IN ('account', 'ip', 'pair')),
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  window_started_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (scope, key_hash)
);
CREATE INDEX login_rate_limits_expiry ON public.login_rate_limits(window_started_at);
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_rate_limits FROM PUBLIC;
DO $$ DECLARE role_name TEXT; BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    EXECUTE format('REVOKE ALL ON public.login_rate_limits FROM %I', role_name);
  END LOOP;
END $$;
COMMIT;
