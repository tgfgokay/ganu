-- 0009 — Hukuki metin sürümü ve tüketici bilgilendirme/erken ifa kanıtı.
-- Default disabled: staging SQL+HTTP kanıtları kaydedilmeden canlı satış açılamaz.
create table public.legal_sale_config(
 id boolean primary key default true check(id), enabled boolean not null default false,
 text_version text not null check(text_version='2026-08-15.v1'),
 retention_version text not null check(retention_version='2026-08-15.v1'),
 cross_border_status text not null check(cross_border_status in ('none','adequacy','appropriate-safeguards')),
 consent_flow_version text not null check(consent_flow_version='0009'),
 tested_project_ref text, sql_proof_sha256 text, http_proof_sha256 text,
 sql_tested_at timestamptz, http_tested_at timestamptz, activated_at timestamptz,
 updated_at timestamptz not null default now()
);
insert into public.legal_sale_config(id,text_version,retention_version,cross_border_status,consent_flow_version)
 values(true,'2026-08-15.v1','2026-08-15.v1','none','0009');
alter table public.legal_sale_config enable row level security;
revoke all on public.legal_sale_config from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.legal_sale_config from service_role;
grant select on public.legal_sale_config to service_role;

alter table public.customers add column legal_text_version text;
alter table public.customers add column preinfo_accepted_at timestamptz;
alter table public.customers add column early_performance_requested_at timestamptz;
alter table public.purchase_sessions add column legal_text_version text;
alter table public.purchase_sessions add column preinfo_accepted_at timestamptz;
alter table public.purchase_sessions add column early_performance_requested_at timestamptz;
alter table public.purchase_sessions add column legal_ip_hash text;
alter table public.purchase_sessions add column legal_user_agent_hash text;
alter table public.pos_orders add column legal_text_version text;
alter table public.pos_orders add column preinfo_accepted_at timestamptz;
alter table public.pos_orders add column early_performance_requested_at timestamptz;
alter table public.customers add constraint customers_legal_evidence_complete check(
 (legal_text_version is null and preinfo_accepted_at is null and early_performance_requested_at is null) or
 (legal_text_version='2026-08-15.v1' and preinfo_accepted_at is not null and early_performance_requested_at is not null));
alter table public.purchase_sessions add constraint purchase_sessions_legal_evidence_complete check(
 (legal_text_version is null and preinfo_accepted_at is null and early_performance_requested_at is null and legal_ip_hash is null and legal_user_agent_hash is null) or
 (legal_text_version='2026-08-15.v1' and preinfo_accepted_at is not null and early_performance_requested_at is not null and legal_ip_hash ~ '^[0-9a-f]{64}$' and legal_user_agent_hash ~ '^[0-9a-f]{64}$'));
alter table public.pos_orders add constraint pos_orders_legal_evidence_complete check(
 (legal_text_version is null and preinfo_accepted_at is null and early_performance_requested_at is null) or
 (legal_text_version='2026-08-15.v1' and preinfo_accepted_at is not null and early_performance_requested_at is not null));

create function public.legal_evidence_immutable() returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin
 if old.legal_text_version is distinct from new.legal_text_version
  or old.preinfo_accepted_at is distinct from new.preinfo_accepted_at
  or old.early_performance_requested_at is distinct from new.early_performance_requested_at
  or (tg_table_name='purchase_sessions' and ((to_jsonb(old)->>'legal_ip_hash') is distinct from (to_jsonb(new)->>'legal_ip_hash')
    or (to_jsonb(old)->>'legal_user_agent_hash') is distinct from (to_jsonb(new)->>'legal_user_agent_hash'))) then
   raise exception 'hukuki kabul kanıtı değiştirilemez';
 end if;
 return new;
end $$;
create trigger customers_legal_evidence_immutable before update on public.customers for each row execute function public.legal_evidence_immutable();
create trigger purchase_sessions_legal_evidence_immutable before update on public.purchase_sessions for each row execute function public.legal_evidence_immutable();
create trigger pos_orders_legal_evidence_immutable before update on public.pos_orders for each row execute function public.legal_evidence_immutable();
revoke all on function public.legal_evidence_immutable() from public,anon,authenticated;

create function public.legal_activate_sale(p_project_ref text,p_sql_sha text,p_http_sha text,p_cross_border text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(p_project_ref,'')!~ '^[a-z0-9]{20}$' or coalesce(p_sql_sha,'')!~ '^[0-9a-f]{64}$'
  or coalesce(p_http_sha,'')!~ '^[0-9a-f]{64}$' or coalesce(p_cross_border,'') not in ('none','adequacy','appropriate-safeguards') then
  raise exception 'geçersiz canlı test kanıtı'; end if;
 update public.legal_sale_config set enabled=true,cross_border_status=p_cross_border,tested_project_ref=p_project_ref,
  sql_proof_sha256=p_sql_sha,http_proof_sha256=p_http_sha,sql_tested_at=now(),http_tested_at=now(),activated_at=now(),updated_at=now()
  where id=true and not enabled and tested_project_ref is null and sql_proof_sha256 is null and http_proof_sha256 is null
   and sql_tested_at is null and http_tested_at is null and activated_at is null
   and text_version='2026-08-15.v1' and retention_version='2026-08-15.v1' and consent_flow_version='0009';
 return found;
end $$;
revoke all on function public.legal_activate_sale(text,text,text,text) from public,anon,authenticated;
grant execute on function public.legal_activate_sale(text,text,text,text) to service_role;
alter function public.legal_activate_sale(text,text,text,text) owner to postgres;

-- 0007'nin hukuki kanıtsız create RPC'si Edge/service-role için kapalı kalır.
revoke all on function public.purchase_create_candidate(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz) from service_role;

create function public.purchase_create_candidate_legal(
 p_customer uuid,p_session uuid,p_title text,p_email text,p_phone text,p_tax_no text,p_tc text,p_tax_office text,p_ref text,p_bni boolean,
 p_package text,p_amount numeric,p_list numeric,p_price_version int,p_discount_code text,p_discount_pct int,p_currency text,p_expires_at timestamptz,
 p_legal_text_version text,p_preinfo_accepted boolean,p_early_performance_requested boolean,p_ip_hash text,p_user_agent_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare accepted_at timestamptz:=clock_timestamp(); cfg public.legal_sale_config%rowtype;
begin
 select * into cfg from public.legal_sale_config where id=true for share;
 if not found or not cfg.enabled or p_legal_text_version<>'2026-08-15.v1' or cfg.text_version<>p_legal_text_version
  or cfg.retention_version<>'2026-08-15.v1' or cfg.cross_border_status not in ('none','adequacy','appropriate-safeguards')
  or cfg.consent_flow_version<>'0009' or coalesce(cfg.tested_project_ref,'') !~ '^[a-z0-9]{20}$'
  or coalesce(cfg.sql_proof_sha256,'') !~ '^[0-9a-f]{64}$' or coalesce(cfg.http_proof_sha256,'') !~ '^[0-9a-f]{64}$'
  or cfg.sql_tested_at is null or cfg.http_tested_at is null or cfg.activated_at is null
  or p_preinfo_accepted is not true or p_early_performance_requested is not true
  or coalesce(p_ip_hash,'')!~ '^[0-9a-f]{64}$' or coalesce(p_user_agent_hash,'')!~ '^[0-9a-f]{64}$' then
  raise exception 'hukuki satış kapısı kapalı veya kabul kanıtı eksik'; end if;
 insert into public.customers(id,title,email,phone,tax_no,tc,tax_office,status,access_code,bni,notes,
  legal_text_version,preinfo_accepted_at,early_performance_requested_at)
 values(p_customer,p_title,nullif(p_email,''),nullif(p_phone,''),nullif(p_tax_no,''),nullif(p_tc,''),nullif(p_tax_office,''),'aday','',coalesce(p_bni,false),
  'İstenen paket: '||p_package||case when nullif(p_ref,'') is null then '' else ' · Ref: '||p_ref end,
  p_legal_text_version,accepted_at,accepted_at);
 insert into public.purchase_sessions(id,customer_id,package_id,amount,list_amount,price_version,discount_code,discount_pct,currency,expires_at,
  legal_text_version,preinfo_accepted_at,early_performance_requested_at,legal_ip_hash,legal_user_agent_hash)
 values(p_session,p_customer,p_package,p_amount,p_list,p_price_version,nullif(p_discount_code,''),nullif(p_discount_pct,0),p_currency,p_expires_at,
  p_legal_text_version,accepted_at,accepted_at,p_ip_hash,p_user_agent_hash);
 return true;
end $$;
revoke all on function public.purchase_create_candidate_legal(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz,text,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.purchase_create_candidate_legal(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz,text,boolean,boolean,text,text) to service_role;

create function public.pos_order_bind_legal_evidence() returns trigger language plpgsql set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype;
begin
 select * into s from public.purchase_sessions where id=new.purchase_session_id;
 if not found or s.legal_text_version<>'2026-08-15.v1' or s.preinfo_accepted_at is null or s.early_performance_requested_at is null
  or s.customer_id is distinct from new.customer_id or s.package_id is distinct from new.pkg
  or s.amount is distinct from new.amount or s.price_version is distinct from new.price_version
  or s.list_amount is distinct from new.list_amount or coalesce(s.discount_code,'')<>coalesce(new.discount_code,'')
  or coalesce(s.discount_pct,0)<>coalesce(new.discount_pct,0) or coalesce(s.currency,'')<>coalesce(new.currency,'')
  or not exists(select 1 from public.legal_sale_config where id=true and enabled and text_version=s.legal_text_version) then
  raise exception 'POS hukuki kabul kanıtı eksik'; end if;
 new.legal_text_version:=s.legal_text_version;new.preinfo_accepted_at:=s.preinfo_accepted_at;new.early_performance_requested_at:=s.early_performance_requested_at;
 return new;
end $$;
create trigger pos_orders_bind_legal_evidence before insert on public.pos_orders for each row execute function public.pos_order_bind_legal_evidence();
revoke all on function public.pos_order_bind_legal_evidence() from public,anon,authenticated;

create or replace function public.purchase_record_claim(p_session uuid,p_customer uuid,p_receipt text,p_sender text)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare s public.purchase_sessions%rowtype;
begin
 select * into s from public.purchase_sessions where id=p_session and customer_id=p_customer for update;
 if not found or s.claimed_at is not null or s.use_kind is not null or s.expires_at<=now() or s.settlement_state<>'pending'
  or s.legal_text_version<>'2026-08-15.v1' or s.preinfo_accepted_at is null or s.early_performance_requested_at is null
  or not exists(select 1 from public.legal_sale_config where id=true and enabled and text_version=s.legal_text_version) then return false; end if;
 if not exists(select 1 from public.customers where id=p_customer and status='aday' and legal_text_version=s.legal_text_version
  and preinfo_accepted_at=s.preinfo_accepted_at and early_performance_requested_at=s.early_performance_requested_at) then return false; end if;
 update public.purchase_sessions set claimed_at=now(),use_kind='receipt',used_at=now(),settlement_state='receipt_claimed' where id=s.id;
 update public.customers set payment_receipt_url=nullif(p_receipt,''),payment_claimed_at=now(),payment_expected=s.amount,
  payment_pkg=s.package_id,payment_sender=left(coalesce(p_sender,''),200) where id=p_customer and status='aday';
 if not found then raise exception 'aday müşteri güncellenemedi'; end if;
 return true;
end $$;
revoke all on function public.purchase_record_claim(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.purchase_record_claim(uuid,uuid,text,text) to service_role;
