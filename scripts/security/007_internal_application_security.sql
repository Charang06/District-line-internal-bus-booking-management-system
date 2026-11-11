-- REVIEW ONLY: production fingerprint 868295d24a51. Explicit owner approval required.
-- Not registered in application startup. No application deployment is required.
-- Embedded body SHA-256: ae06b51315b72ef202ba6a7c4d69f68f7f0ddecacc46c50224fd0c9c6e22f261
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
SET LOCAL transaction_timeout='3min';
SET LOCAL district_security.runtime_role='postgres';
SELECT pg_advisory_xact_lock(8216042,7);
DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Unexpected migration role or database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schema_meta WHERE version=6)
    OR EXISTS (SELECT 1 FROM public.schema_meta WHERE version=7) THEN
    RAISE EXCEPTION 'Expected migration baseline 1–6, with 7 absent';
  END IF;
END
$guard$;
-- REVIEW CANDIDATE ONLY. Not registered in startup migrations.
-- Run inside a caller-owned transaction after confirmed target/runtime identity.
-- Does not modify rows, owners, policies or default grants.
DO $hardening$
DECLARE
  names text[] := ARRAY['audit_logs','auth_sessions','bookings','bus_contacts',
    'bus_duties','buses','cargo','crew_members','daily_expenses','duty_adjustments',
    'expense_submissions','password_recovery_rate_limits','password_recovery_tokens',
    'revenue_entries','schema_meta','sms_attempts','trips','users',
    'admin_username_recovery_tokens','admin_username_recovery_limits',
    'admin_recovery_email_verification_tokens','admin_recovery_email_verification_limits'];
  t text; col record; seq text; r text; oid_ oid; runtime_name text;
  before_runtime boolean[]; before_service boolean[]; after_flags boolean[];
  seq_runtime boolean[]; seq_service boolean[];
  table_privs text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
  seq_privs text[] := ARRAY['USAGE','SELECT','UPDATE'];
  schema_runtime_create boolean; schema_service_create boolean;
BEGIN
  -- Explicit inventory is checked by the preparation/rehearsal; never ALL TABLES.
  runtime_name := current_setting('district_security.runtime_role', true);
  IF runtime_name IS NULL OR runtime_name = '' THEN
    RAISE EXCEPTION 'Set LOCAL district_security.runtime_role to the confirmed Express database role';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')) <> cardinality(names) THEN
    RAISE EXCEPTION 'Application table inventory drift; review before applying';
  END IF;
  schema_runtime_create := has_schema_privilege(runtime_name,'public','CREATE');
  schema_service_create := has_schema_privilege('service_role','public','CREATE');
  REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
  -- Preserve existing runtime/service schema capabilities if they came from PUBLIC.
  IF schema_runtime_create THEN EXECUTE format('GRANT CREATE ON SCHEMA public TO %I',runtime_name); END IF;
  IF schema_service_create THEN GRANT CREATE ON SCHEMA public TO service_role; END IF;
  IF NOT has_schema_privilege(runtime_name,'public','USAGE') THEN RAISE EXCEPTION 'Runtime schema USAGE required'; END IF;
  IF has_schema_privilege('anon','public','CREATE') OR has_schema_privilege('authenticated','public','CREATE') THEN
    RAISE EXCEPTION 'Inherited client schema CREATE remains';
  END IF;
  -- Shared schema USAGE is retained: it does not grant access to these internal tables.
  FOREACH t IN ARRAY names LOOP
    oid_ := to_regclass(format('public.%I',t));
    IF oid_ IS NULL THEN RAISE EXCEPTION 'Missing expected table: %',t; END IF;
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid=oid_) THEN
      RAISE EXCEPTION 'Unexpected existing RLS policy on %; review explicitly',t;
    END IF;
    -- Default-deny RLS would break a non-owner runtime without BYPASSRLS.
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_roles p ON p.rolname=runtime_name
      WHERE c.oid=oid_ AND (c.relowner=p.oid OR p.rolbypassrls OR p.rolsuper)) THEN
      RAISE EXCEPTION 'Runtime role needs a separately reviewed RLS policy for %',t;
    END IF;
    SELECT array_agg(has_table_privilege(runtime_name,oid_,p) ORDER BY p) INTO before_runtime FROM unnest(table_privs) p;
    SELECT array_agg(has_table_privilege('service_role',oid_,p) ORDER BY p) INTO before_service FROM unnest(table_privs) p;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated',t);
    FOR col IN SELECT attname FROM pg_attribute WHERE attrelid=oid_ AND attnum>0 AND NOT attisdropped LOOP
      EXECUTE format('REVOKE SELECT (%I), INSERT (%I), UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        col.attname,col.attname,col.attname,col.attname,t);
    END LOOP;
    FOR seq IN SELECT DISTINCT pg_get_serial_sequence(format('public.%I',t),a.attname)
      FROM pg_attribute a WHERE a.attrelid=oid_ AND a.attnum>0 AND NOT a.attisdropped LOOP
      IF seq IS NOT NULL THEN
        SELECT array_agg(has_sequence_privilege(runtime_name,seq,p) ORDER BY p) INTO seq_runtime FROM unnest(seq_privs) p;
        SELECT array_agg(has_sequence_privilege('service_role',seq,p) ORDER BY p) INTO seq_service FROM unnest(seq_privs) p;
        EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE %s FROM PUBLIC, anon, authenticated',seq);
        FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF has_sequence_privilege(r,seq,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Inherited sequence privilege remains'; END IF;
        END LOOP;
        SELECT array_agg(has_sequence_privilege(runtime_name,seq,p) ORDER BY p) INTO after_flags FROM unnest(seq_privs) p;
        IF seq_runtime IS DISTINCT FROM after_flags THEN RAISE EXCEPTION 'Runtime sequence privileges changed'; END IF;
        SELECT array_agg(has_sequence_privilege('service_role',seq,p) ORDER BY p) INTO after_flags FROM unnest(seq_privs) p;
        IF seq_service IS DISTINCT FROM after_flags THEN RAISE EXCEPTION 'Service sequence privileges changed'; END IF;
      END IF;
    END LOOP;
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(r,oid_,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(r,oid_,'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Inherited client privilege remains on %',t;
      END IF;
    END LOOP;
    SELECT array_agg(has_table_privilege(runtime_name,oid_,p) ORDER BY p) INTO after_flags FROM unnest(table_privs) p;
    IF before_runtime IS DISTINCT FROM after_flags THEN RAISE EXCEPTION 'Runtime table privileges changed'; END IF;
    SELECT array_agg(has_table_privilege('service_role',oid_,p) ORDER BY p) INTO after_flags FROM unnest(table_privs) p;
    IF before_service IS DISTINCT FROM after_flags THEN RAISE EXCEPTION 'Service table privileges changed'; END IF;
  END LOOP;
END
$hardening$;

INSERT INTO public.schema_meta(version) VALUES (7);
COMMIT;
