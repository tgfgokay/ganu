-- Only an empty isolated local PostgreSQL database. This is a fixture, not a Supabase service implementation.
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin;end if;if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls;end if;if not exists(select 1 from pg_roles where rolname='postgres') then create role postgres nologin;end if;end $$;
create schema auth;create schema storage;create schema extensions;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role',nullif(current_setting('request.jwt.claim.role',true),'')) $$;
create table storage.buckets(id text primary key,name text,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema auth,storage,public,extensions to anon,authenticated,service_role;
grant select on auth.users to authenticated,service_role;
grant all on storage.objects,storage.buckets to authenticated,service_role;
alter default privileges in schema public grant all on tables to authenticated,service_role;
alter default privileges in schema public grant usage,select on sequences to authenticated,service_role;
