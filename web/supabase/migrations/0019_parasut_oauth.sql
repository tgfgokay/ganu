-- 0019: confidential OAuth+PKCE. Only Edge service role can see encrypted credentials.
create table public.parasut_oauth_flows (
  state_hash text primary key check (state_hash ~ '^[A-Za-z0-9_-]{43}$'),
  user_id uuid not null,
  verifier_ciphertext text not null check (verifier_ciphertext like 'v1.%' and length(verifier_ciphertext) < 32768),
  client_id text not null,
  company_id text not null,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
create table public.parasut_oauth_connections (
  company_id text primary key,
  client_id text not null,
  subject text not null,
  status text not null check (status in ('connected', 'reconnect_required')),
  tokens_ciphertext text check (tokens_ciphertext like 'v1.%' and length(tokens_ciphertext) < 32768),
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  connected_by uuid not null,
  connected_at timestamptz not null default now(),
  generation bigint not null default 1,
  refresh_owner uuid,
  refresh_claimed_at timestamptz,
  check ((status = 'connected' and tokens_ciphertext is not null and access_expires_at is not null and refresh_expires_at is not null)
    or (status = 'reconnect_required' and tokens_ciphertext is null)),
  check ((refresh_owner is null) = (refresh_claimed_at is null))
);
alter table public.parasut_oauth_flows enable row level security;
alter table public.parasut_oauth_connections enable row level security;
revoke all on public.parasut_oauth_flows, public.parasut_oauth_connections from public, anon, authenticated;
grant all on public.parasut_oauth_flows, public.parasut_oauth_connections to service_role;

create function public.parasut_oauth_begin(p_state_hash text, p_user uuid, p_verifier text, p_client text, p_company text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  delete from public.parasut_oauth_flows where expires_at <= now() or user_id = p_user;
  insert into public.parasut_oauth_flows(state_hash,user_id,verifier_ciphertext,client_id,company_id)
    values(p_state_hash,p_user,p_verifier,p_client,p_company);
end $$;

create function public.parasut_oauth_consume(p_state_hash text, p_user uuid, p_client text, p_company text) returns text
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  delete from public.parasut_oauth_flows where state_hash = p_state_hash and user_id = p_user and client_id = p_client
    and company_id = p_company and expires_at > now() returning verifier_ciphertext into v;
  return v;
end $$;

create function public.parasut_oauth_connect(p_company text, p_client text, p_subject text, p_tokens text,
  p_expires timestamptz, p_refresh_expires timestamptz, p_user uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if p_expires <= now() or p_refresh_expires <= now() then raise exception 'Token süresi geçersiz'; end if;
  if coalesce(p_subject,'') = '' then raise exception 'Hesap kimliği eksik'; end if;
  insert into public.parasut_oauth_connections(company_id,client_id,subject,status,tokens_ciphertext,access_expires_at,refresh_expires_at,connected_by)
    values(p_company,p_client,p_subject,'connected',p_tokens,p_expires,p_refresh_expires,p_user)
  on conflict (company_id) do update set client_id = excluded.client_id, subject = excluded.subject, status = 'connected',
    tokens_ciphertext = excluded.tokens_ciphertext, access_expires_at = excluded.access_expires_at, refresh_expires_at = excluded.refresh_expires_at,
    connected_by = excluded.connected_by, connected_at = now(), generation = parasut_oauth_connections.generation + 1,
    refresh_owner = null, refresh_claimed_at = null
    where parasut_oauth_connections.subject = excluded.subject;
  return found;
end $$;

create function public.parasut_oauth_read(p_company text, p_client text, p_subject text) returns jsonb
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select jsonb_build_object('status',status,'subject',subject,'tokens_ciphertext',tokens_ciphertext,'access_expires_at',access_expires_at,
    'refresh_expires_at',refresh_expires_at,'generation',generation) into v
    from public.parasut_oauth_connections where company_id = p_company and client_id = p_client and (p_subject = '' or subject = p_subject);
  return v;
end $$;

-- Deliberately no lease expiry/takeover: the IdP may have rotated the token while its response was lost.
-- A crashed owner requires a fresh consent; an old refresh token is never automatically replayed.
create function public.parasut_oauth_claim(p_company text, p_client text, p_subject text, p_generation bigint) returns uuid
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.parasut_oauth_connections set refresh_owner = gen_random_uuid(), refresh_claimed_at = now()
    where company_id = p_company and client_id = p_client and subject = p_subject and generation = p_generation
      and status = 'connected' and refresh_owner is null and access_expires_at <= now() + interval '60 seconds'
      and refresh_expires_at > now() + interval '60 seconds'
    returning refresh_owner into v;
  return v;
end $$;

create function public.parasut_oauth_complete(p_company text, p_client text, p_subject text, p_owner uuid, p_generation bigint,
  p_tokens text, p_expires timestamptz, p_refresh_expires timestamptz) returns boolean
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if p_expires <= now() or p_refresh_expires <= now() then raise exception 'Token süresi geçersiz'; end if;
  update public.parasut_oauth_connections set tokens_ciphertext = p_tokens, access_expires_at = p_expires,
    refresh_expires_at = p_refresh_expires, generation = generation + 1, refresh_owner = null, refresh_claimed_at = null
    where company_id = p_company and client_id = p_client and subject = p_subject and refresh_owner = p_owner
      and generation = p_generation and status = 'connected';
  return found;
end $$;

create function public.parasut_oauth_fail(p_company text, p_client text, p_subject text, p_owner uuid, p_generation bigint) returns boolean
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.parasut_oauth_connections set status = 'reconnect_required', tokens_ciphertext = null,
    refresh_owner = null, refresh_claimed_at = null, generation = generation + 1
    where company_id = p_company and client_id = p_client and subject = p_subject and refresh_owner = p_owner and generation = p_generation;
  return found;
end $$;

create function public.parasut_oauth_reject(p_company text, p_client text, p_subject text, p_generation bigint) returns boolean
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.parasut_oauth_connections set status = 'reconnect_required', tokens_ciphertext = null,
    refresh_owner = null, refresh_claimed_at = null, generation = generation + 1
    where company_id = p_company and client_id = p_client and subject = p_subject and generation = p_generation;
  return found;
end $$;

-- Safe status excludes subject, user ID, verifier and credentials; only staff Edge endpoint returns it.
create function public.parasut_oauth_status(p_company text, p_client text, p_subject text) returns jsonb
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select jsonb_build_object('status',status,'connected_at',connected_at,'access_expires_at',access_expires_at,
    'refresh_expires_at',refresh_expires_at,'refresh_pending',refresh_owner is not null) into v
    from public.parasut_oauth_connections where company_id = p_company and client_id = p_client and (p_subject = '' or subject = p_subject);
  return v;
end $$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'parasut_oauth_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.signature);
    execute format('grant execute on function %s to service_role', f.signature);
  end loop;
end $$;
