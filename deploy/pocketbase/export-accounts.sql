-- Run with psql -X -qAt -v ON_ERROR_STOP=1, redirect into a PRIVATE encrypted directory.
-- Exports account identity and application rows, never sessions/refresh tokens/password hashes.
\set ON_ERROR_STOP on
begin isolation level repeatable read read only;
create temporary table account_export (name text primary key, rows jsonb);
DO $$
DECLARE used_storage boolean; t text; allowed text[] := array['lessons','profiles','user_info','payments','quizzes','quiz_questions','quiz_results',
  'shared_materials','site_admins','bot_links','base_materials','site_rules','promo_codes','ai_keys','img_keys','free_usage'];
BEGIN
  IF EXISTS (select 1 from pg_tables where schemaname='public' and not (tablename = any(allowed))) THEN
    RAISE EXCEPTION 'Unreviewed public tables exist: inventory them before exporting';
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'select exists(select 1 from storage.objects)' INTO used_storage;
    IF used_storage THEN RAISE EXCEPTION 'Storage files exist; prepare and verify a separate file migration first'; END IF;
  END IF;
  FOREACH t IN ARRAY allowed LOOP
    IF to_regclass(format('public.%I',t)) IS NOT NULL THEN
      EXECUTE format('insert into account_export select %L, coalesce(jsonb_agg(to_jsonb(x)), %L::jsonb) from public.%I x',t,'[]',t);
    END IF;
  END LOOP;
END $$;
select jsonb_build_object('users',
  (select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'phone',phone,'email_confirmed_at',email_confirmed_at)), '[]'::jsonb) from auth.users),
  'tables',(select coalesce(jsonb_object_agg(name, rows), '{}'::jsonb) from account_export));
rollback;
