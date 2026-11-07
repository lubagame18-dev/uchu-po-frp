\set ON_ERROR_STOP on
-- Run on both source and target; keep output private, compare before cutover.
select version();
select extname, extversion from pg_extension order by extname;
select count(*) as users, count(*) filter (where encrypted_password <> '') as passwords_present from auth.users;
select count(*) as identities from auth.identities;
select count(*) as lessons from public.lessons;
select count(*) as profiles from public.profiles;
select count(*) as user_info from public.user_info;
select count(*) as payments from public.payments;
-- Full-table fingerprints without exporting raw rows. Retain output privately.
select md5(string_agg(md5(row_to_json(u)::text), '' order by id)) as users_fingerprint from auth.users u;
select md5(string_agg(md5(row_to_json(l)::text), '' order by id)) as lessons_fingerprint from public.lessons l;
select md5(string_agg(md5(row_to_json(p)::text), '' order by id)) as payments_fingerprint from public.payments p;
select schemaname, tablename, policyname, roles, cmd, qual, with_check from pg_policies
where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select n.nspname, c.relname, c.relrowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname;
select p.oid::regprocedure, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef order by 1;
DO $$
BEGIN
  IF EXISTS (select 1 from public.lessons l left join auth.users u on u.id=l.user_id where u.id is null) THEN
    RAISE EXCEPTION 'Orphan lessons';
  END IF;
  IF EXISTS (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) THEN
    RAISE EXCEPTION 'Public table without RLS; review before cutover';
  END IF;
END $$;
-- Storage metadata counts do not prove object files transferred.
select bucket_id, count(*) from storage.objects group by bucket_id order by bucket_id;
create temporary table migration_inventory (schema_name text, table_name text, rows bigint, fingerprint text);
DO $$
DECLARE t record;
BEGIN
  FOR t IN select schemaname, tablename from pg_tables where schemaname in ('public','auth') order by 1,2 LOOP
    EXECUTE format('insert into migration_inventory select %L,%L,count(*),md5(string_agg(h, %L order by h)) from (select md5(row_to_json(x)::text) h from %I.%I x) q',
       t.schemaname,t.tablename,'',t.schemaname,t.tablename);
  END LOOP;
END $$;
select * from migration_inventory order by schema_name,table_name;
