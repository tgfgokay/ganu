-- 0007 — Anon satın alma yalnız purchase-flow Edge üzerinden.
drop policy if exists "public_apply_customers" on public.customers;
revoke insert on public.customers from public,anon;
revoke all on function public.purchase_submit_receipt(uuid,text,numeric,text,text) from public,anon,authenticated;

create table if not exists public.purchase_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  package_id text not null references public.packages(id),
  amount numeric not null check(amount>=0), list_amount numeric not null check(list_amount>=0),
  price_version integer not null, discount_code text, discount_pct integer,
  currency text not null default 'TL', expires_at timestamptz not null,
  claimed_at timestamptz, use_kind text check(use_kind in ('pos','receipt')),
  used_at timestamptz, created_at timestamptz not null default now()
);
create unique index if not exists purchase_sessions_customer_unique on public.purchase_sessions(customer_id);
alter table public.purchase_sessions enable row level security;
create policy "staff_all_purchase_sessions" on public.purchase_sessions for all to authenticated
 using(public.is_staff()) with check(public.is_staff());

alter table public.pos_orders add column if not exists purchase_session_id uuid references public.purchase_sessions(id);
alter table public.pos_orders add column if not exists init_state text not null default 'creating'
 check(init_state in ('creating','ready','definite_failed','ambiguous'));
alter table public.pos_orders add column if not exists provider_token text;
alter table public.pos_orders add column if not exists provider_url text;
create unique index if not exists pos_orders_purchase_session_unique on public.pos_orders(purchase_session_id) where purchase_session_id is not null;

create table if not exists public.purchase_rate_limits(
  ip_hash text not null, action text not null, window_start timestamptz not null,
  hits integer not null, primary key(ip_hash,action)
);
alter table public.purchase_rate_limits enable row level security;

create or replace function public.purchase_create_candidate(
 p_customer uuid,p_session uuid,p_title text,p_email text,p_phone text,p_tax_no text,p_tc text,p_tax_office text,p_ref text,p_bni boolean,
 p_package text,p_amount numeric,p_list numeric,p_price_version int,p_discount_code text,p_discount_pct int,p_currency text,p_expires_at timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 insert into public.customers(id,title,email,phone,tax_no,tc,tax_office,status,access_code,bni,notes)
 values(p_customer,p_title,nullif(p_email,''),nullif(p_phone,''),nullif(p_tax_no,''),nullif(p_tc,''),nullif(p_tax_office,''),'aday','',coalesce(p_bni,false),
  'İstenen paket: '||p_package||case when nullif(p_ref,'') is null then '' else ' · Ref: '||p_ref end);
 insert into public.purchase_sessions(id,customer_id,package_id,amount,list_amount,price_version,discount_code,discount_pct,currency,expires_at)
 values(p_session,p_customer,p_package,p_amount,p_list,p_price_version,nullif(p_discount_code,''),nullif(p_discount_pct,0),p_currency,p_expires_at);
 return true;
end $$;
revoke all on function public.purchase_create_candidate(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz) from public,anon,authenticated;

create or replace function public.purchase_rate_limit(p_ip_hash text,p_action text,p_limit int,p_window_seconds int)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare n int;
begin
 if length(coalesce(p_ip_hash,''))<>64 or p_action not in ('create','claim') or p_limit<1 or p_window_seconds<60 then
  raise exception 'geçersiz rate-limit girdisi'; end if;
 insert into public.purchase_rate_limits(ip_hash,action,window_start,hits)
 values(p_ip_hash,p_action,now(),1)
 on conflict(ip_hash,action) do update set
  window_start=case when purchase_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then now() else purchase_rate_limits.window_start end,
  hits=case when purchase_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then 1 else purchase_rate_limits.hits+1 end
 returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.purchase_rate_limit(text,text,int,int) from public,anon,authenticated;

create or replace function public.purchase_record_claim(p_session uuid,p_customer uuid,p_receipt text,p_sender text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype;
begin
 select * into s from public.purchase_sessions where id=p_session and customer_id=p_customer for update;
 if not found or s.claimed_at is not null or s.use_kind is not null or s.expires_at<=now() then return false; end if;
 if not exists(select 1 from public.customers where id=p_customer and status='aday') then return false; end if;
 update public.purchase_sessions set claimed_at=now(),use_kind='receipt',used_at=now() where id=s.id;
 update public.customers set payment_receipt_url=nullif(p_receipt,''),payment_claimed_at=now(),
  payment_expected=s.amount,payment_pkg=s.package_id,payment_sender=left(coalesce(p_sender,''),200)
  where id=p_customer and status='aday';
 if not found then raise exception 'aday müşteri güncellenemedi'; end if;
 return true;
end $$;
revoke all on function public.purchase_record_claim(uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.purchase_start_pos(p_session uuid,p_customer uuid,p_merchant_oid text,p_amount numeric,p_package text,
 p_provider text,p_price_version int,p_list_amount numeric,p_discount_code text,p_discount_pct int,p_currency text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype; o public.pos_orders%rowtype;
begin
 select * into s from public.purchase_sessions where id=p_session and customer_id=p_customer for update;
 if not found or s.claimed_at is not null or s.expires_at<=now() then return jsonb_build_object('state','rejected'); end if;
 if not exists(select 1 from public.customers where id=p_customer and status='aday') then return jsonb_build_object('state','rejected'); end if;
 if s.use_kind='pos' then
  select * into o from public.pos_orders where purchase_session_id=s.id for update;
  if not found then return jsonb_build_object('state','ambiguous'); end if;
  if o.customer_id<>p_customer or o.amount<>p_amount or o.pkg<>p_package or o.provider<>p_provider
    or o.price_version<>p_price_version or o.list_amount<>p_list_amount
    or coalesce(o.discount_code,'')<>coalesce(p_discount_code,'') or coalesce(o.discount_pct,0)<>coalesce(p_discount_pct,0)
    or coalesce(o.currency,'')<>coalesce(p_currency,'') then return jsonb_build_object('state','rejected'); end if;
  if o.init_state='ready' then return jsonb_build_object('state','ready','merchant_oid',o.merchant_oid,'provider_token',o.provider_token,'provider_url',o.provider_url,'amount',o.amount); end if;
  if o.init_state='creating' and o.created_at>now()-interval '2 minutes' then return jsonb_build_object('state','in_progress'); end if;
  if o.init_state='creating' then update public.pos_orders set init_state='ambiguous' where id=o.id; end if;
  return jsonb_build_object('state','ambiguous');
 end if;
 if s.use_kind is not null then return jsonb_build_object('state','rejected'); end if;
 insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,
  price_version,list_amount,discount_code,discount_pct,currency)
 values(p_merchant_oid,p_customer,p_amount,p_package,p_provider,'bekliyor',p_session,'creating',
  p_price_version,p_list_amount,nullif(p_discount_code,''),nullif(p_discount_pct,0),p_currency);
 update public.purchase_sessions set use_kind='pos',used_at=now() where id=s.id;
 return jsonb_build_object('state','new','merchant_oid',p_merchant_oid);
end $$;
revoke all on function public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text) from public,anon,authenticated;

create or replace function public.purchase_finish_pos_init(p_merchant_oid text,p_outcome text,p_provider_token text,p_provider_url text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare o public.pos_orders%rowtype;
begin
 select * into o from public.pos_orders where merchant_oid=p_merchant_oid for update;
 if not found or o.init_state<>'creating' or p_outcome not in ('ready','definite_failed','ambiguous') then return false; end if;
 if p_outcome='ready' then
  if nullif(p_provider_token,'') is null or nullif(p_provider_url,'') is null then return false; end if;
  update public.pos_orders set init_state='ready',provider_token=p_provider_token,provider_url=p_provider_url where id=o.id;
 elsif p_outcome='definite_failed' then
  update public.pos_orders set init_state='definite_failed',status='başarısız',purchase_session_id=null where id=o.id;
  update public.purchase_sessions set use_kind=null,used_at=null where id=o.purchase_session_id and use_kind='pos';
 else update public.pos_orders set init_state='ambiguous' where id=o.id;
 end if;
 return true;
end $$;
revoke all on function public.purchase_finish_pos_init(text,text,text,text) from public,anon,authenticated;
grant execute on function public.purchase_create_candidate(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz),public.purchase_rate_limit(text,text,int,int),public.purchase_record_claim(uuid,uuid,text,text),public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text),public.purchase_finish_pos_init(text,text,text,text) to service_role;

revoke all on public.purchase_sessions,public.purchase_rate_limits from anon,authenticated;
grant select,insert,update,delete on public.purchase_sessions to authenticated;
grant all on public.purchase_sessions,public.purchase_rate_limits to service_role;
