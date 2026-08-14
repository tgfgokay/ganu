-- 0008 — POS callback/state mutabakatı ve güvenli tarayıcı dönüşü.
alter table public.purchase_sessions add column if not exists settlement_state text not null default 'pending'
 check(settlement_state in ('pending','receipt_claimed','paid','failed','manual_review'));
update public.purchase_sessions set settlement_state='receipt_claimed'
 where use_kind='receipt' and claimed_at is not null and settlement_state='pending';

alter table public.pos_orders add column if not exists return_token_hash text;
alter table public.pos_orders add column if not exists return_expires_at timestamptz;
alter table public.pos_orders add column if not exists settled_at timestamptz;
create unique index if not exists pos_orders_return_token_hash_unique
 on public.pos_orders(return_token_hash) where return_token_hash is not null;
alter table public.pos_orders drop constraint if exists pos_orders_init_state_check;
alter table public.pos_orders add constraint pos_orders_init_state_check check(init_state in
 ('creating','ready','definite_failed','ambiguous','callback_success','callback_failed','manual_review'));

-- 0007 imzasını kapat: return token hash'i olmadan yeni POS siparişi açılamaz.
revoke all on function public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text) from public,anon,authenticated,service_role;
drop function public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text);

create function public.purchase_start_pos(p_session uuid,p_customer uuid,p_merchant_oid text,p_amount numeric,p_package text,
 p_provider text,p_price_version int,p_list_amount numeric,p_discount_code text,p_discount_pct int,p_currency text,
 p_return_token_hash text,p_return_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype; o public.pos_orders%rowtype;
begin
 if coalesce(p_return_token_hash,'') !~ '^[0-9a-f]{64}$' or p_return_expires_at is null
   or p_return_expires_at<=now()+interval '5 minutes'
   or p_return_expires_at>now()+interval '2 hours' then return jsonb_build_object('state','rejected'); end if;
 select * into s from public.purchase_sessions where id=p_session and customer_id=p_customer for update;
 if not found or s.claimed_at is not null or s.expires_at<=now() or s.settlement_state<>'pending' then return jsonb_build_object('state','rejected'); end if;
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
  price_version,list_amount,discount_code,discount_pct,currency,return_token_hash,return_expires_at)
 values(p_merchant_oid,p_customer,p_amount,p_package,p_provider,'bekliyor',p_session,'creating',
  p_price_version,p_list_amount,nullif(p_discount_code,''),nullif(p_discount_pct,0),p_currency,p_return_token_hash,p_return_expires_at);
 update public.purchase_sessions set use_kind='pos',used_at=now() where id=s.id;
 return jsonb_build_object('state','new','merchant_oid',p_merchant_oid);
end $$;
revoke all on function public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text,text,timestamptz) to service_role;

create or replace function public.purchase_record_claim(p_session uuid,p_customer uuid,p_receipt text,p_sender text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype;
begin
 select * into s from public.purchase_sessions where id=p_session and customer_id=p_customer for update;
 if not found or s.claimed_at is not null or s.use_kind is not null or s.expires_at<=now() or s.settlement_state<>'pending' then return false; end if;
 if not exists(select 1 from public.customers where id=p_customer and status='aday') then return false; end if;
 update public.purchase_sessions set claimed_at=now(),use_kind='receipt',used_at=now(),settlement_state='receipt_claimed' where id=s.id;
 update public.customers set payment_receipt_url=nullif(p_receipt,''),payment_claimed_at=now(),
  payment_expected=s.amount,payment_pkg=s.package_id,payment_sender=left(coalesce(p_sender,''),200)
  where id=p_customer and status='aday';
 if not found then raise exception 'aday müşteri güncellenemedi'; end if;
 return true;
end $$;
revoke all on function public.purchase_record_claim(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.purchase_record_claim(uuid,uuid,text,text) to service_role;

create or replace function public.pos_settle(p_merchant_oid text,p_status text,p_total_amount bigint)
returns text language plpgsql security definer set search_path=public,pg_catalog as $$
declare o public.pos_orders%rowtype; s public.purchase_sessions%rowtype; expected bigint; cust_cnt integer;
begin
 select * into o from public.pos_orders where merchant_oid=p_merchant_oid for update;
 if not found then
  insert into public.security_events(kind,detail) values('pos_unknown_order',jsonb_build_object('merchant_oid',p_merchant_oid));
  return 'unknown';
 end if;
 if o.status='başarılı' then return 'idempotent_success'; end if;
 if o.status='başarısız' then return 'idempotent_failed'; end if;
 if o.status='şüpheli' or o.init_state='manual_review' then return 'mismatch'; end if;
 if o.purchase_session_id is not null then
  select * into s from public.purchase_sessions where id=o.purchase_session_id for update;
  if not found or s.customer_id<>o.customer_id or s.use_kind<>'pos' then
   update public.pos_orders set status='şüpheli',init_state='manual_review',settled_at=now() where id=o.id;
   insert into public.security_events(kind,detail) values('pos_session_mismatch',jsonb_build_object('merchant_oid',p_merchant_oid));
   return 'mismatch';
  end if;
 end if;
 if p_status='success' then
  expected:=round(o.amount*100);
  if p_total_amount<>expected then
   update public.pos_orders set status='şüpheli',init_state='manual_review',settled_at=now() where id=o.id;
   if o.purchase_session_id is not null then update public.purchase_sessions set settlement_state='manual_review',claimed_at=coalesce(claimed_at,now()) where id=o.purchase_session_id; end if;
   insert into public.security_events(kind,detail) values('pos_amount_mismatch',jsonb_build_object('merchant_oid',p_merchant_oid,'expected',expected,'got',p_total_amount));
   return 'mismatch';
  end if;
  update public.pos_orders set status='başarılı',init_state='callback_success',settled_at=now() where id=o.id;
  update public.customers set payment_claimed_at=now(),payment_expected=o.amount,payment_pkg=coalesce(o.pkg,''),
   payment_sender=o.provider||' sanal POS',payment_receipt_url='pos:'||o.provider where id=o.customer_id;
  get diagnostics cust_cnt=row_count;
  if cust_cnt<>1 then raise exception 'pos_settle: müşteri güncellenemedi'; end if;
  if o.purchase_session_id is not null then update public.purchase_sessions set settlement_state='paid',claimed_at=coalesce(claimed_at,now()) where id=o.purchase_session_id; end if;
  return 'ok';
 end if;
 update public.pos_orders set status='başarısız',init_state='callback_failed',settled_at=now() where id=o.id;
 if o.purchase_session_id is not null then update public.purchase_sessions set settlement_state='failed',claimed_at=coalesce(claimed_at,now()) where id=o.purchase_session_id; end if;
 return 'failed';
end $$;
revoke all on function public.pos_settle(text,text,bigint) from public,anon,authenticated;
grant execute on function public.pos_settle(text,text,bigint) to service_role;

create function public.purchase_return_status(p_return_token_hash text)
returns text language plpgsql security definer set search_path=public,pg_catalog as $$
declare o public.pos_orders%rowtype; c_status text;
begin
 if p_return_token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into o from public.pos_orders where return_token_hash=p_return_token_hash and return_expires_at>now();
 if not found then return null; end if;
 if o.status='şüpheli' or o.init_state='manual_review' then return 'manual_review'; end if;
 if o.status='başarısız' or o.init_state in ('definite_failed','callback_failed') then return 'failed'; end if;
 if o.status='başarılı' then
  select status into c_status from public.customers where id=o.customer_id;
  if c_status='aktif' then return 'active'; end if;
  return 'paid_pending_activation';
 end if;
 return 'pending';
end $$;
revoke all on function public.purchase_return_status(text) from public,anon,authenticated;
grant execute on function public.purchase_return_status(text) to service_role;

create or replace function public.purchase_rate_limit(p_ip_hash text,p_action text,p_limit int,p_window_seconds int)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare n int;
begin
 if length(coalesce(p_ip_hash,''))<>64 or p_action not in ('create','claim','status') or p_limit<1 or p_window_seconds<60 then raise exception 'geçersiz rate-limit girdisi'; end if;
 insert into public.purchase_rate_limits(ip_hash,action,window_start,hits) values(p_ip_hash,p_action,now(),1)
 on conflict(ip_hash,action) do update set
  window_start=case when purchase_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then now() else purchase_rate_limits.window_start end,
  hits=case when purchase_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then 1 else purchase_rate_limits.hits+1 end returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.purchase_rate_limit(text,text,int,int) from public,anon,authenticated;
grant execute on function public.purchase_rate_limit(text,text,int,int) to service_role;
