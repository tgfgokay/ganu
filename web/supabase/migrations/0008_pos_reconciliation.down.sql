-- Güvenlik rollback'i fail-closed: dönüş sorgusu ve POS başlatma kapanır;
-- eski unknown-callback ACK davranışı geri yüklenmez.
drop function if exists public.purchase_return_status(text);
drop function if exists public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text,text,timestamptz);
create or replace function public.pos_settle(text,text,bigint) returns text
 language plpgsql security definer set search_path=public,pg_catalog as $$
begin raise exception '0008 rollback sonrası POS callback güvenlik nedeniyle kapalı'; end $$;
revoke all on function public.pos_settle(text,text,bigint) from public,anon,authenticated;
grant execute on function public.pos_settle(text,text,bigint) to service_role;
-- 0007 receipt işlevini settlement_state bağımlılığı olmadan geri yükle.
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
grant execute on function public.purchase_record_claim(uuid,uuid,text,text) to service_role;

-- 0007 rate-limit allowlistini geri yükle; status action rollback ile kapanır.
create or replace function public.purchase_rate_limit(p_ip_hash text,p_action text,p_limit int,p_window_seconds int)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare n int;
begin
 if length(coalesce(p_ip_hash,''))<>64 or p_action not in ('create','claim') or p_limit<1 or p_window_seconds<60 then raise exception 'geçersiz rate-limit girdisi'; end if;
 insert into public.purchase_rate_limits(ip_hash,action,window_start,hits) values(p_ip_hash,p_action,now(),1)
 on conflict(ip_hash,action) do update set
  window_start=case when purchase_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then now() else purchase_rate_limits.window_start end,
  hits=case when purchase_rate_limits.window_start<=now()-make_interval(secs=>p_window_seconds) then 1 else purchase_rate_limits.hits+1 end returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.purchase_rate_limit(text,text,int,int) from public,anon,authenticated;
grant execute on function public.purchase_rate_limit(text,text,int,int) to service_role;
drop index if exists public.pos_orders_return_token_hash_unique;
alter table public.pos_orders drop column if exists settled_at;
alter table public.pos_orders drop column if exists return_expires_at;
alter table public.pos_orders drop column if exists return_token_hash;
alter table public.pos_orders drop constraint if exists pos_orders_init_state_check;
alter table public.pos_orders add constraint pos_orders_init_state_check check(init_state in
 ('creating','ready','definite_failed','ambiguous','callback_success','callback_failed','manual_review'));
-- Terminal değerler veri kaybı olmadan eski constraint'e sığmadığından kolon/constraint
-- geniş bırakılır; POS yeniden açılmadan önce 0008 tekrar uygulanmalıdır.
alter table public.purchase_sessions drop constraint if exists purchase_sessions_settlement_state_check;
alter table public.purchase_sessions drop column if exists settlement_state;
