-- 0014 — Teklif → kabul (sözleşme onayı) → ödeme → e-Belge → aktif müşteri akışı.
-- Durumlar ayrı tutulur: teklif = quotes.status; tahsilat = invoices.status; e-Belge = invoices.einvoice_status;
-- sözleşme kabulü = contracts.accepted_at; adres belgesi = quotes.address_doc; hizmet = customers.status.
-- Tablolara personel yalnız OKUR; her geçiş service-role RPC'leriyle (Edge Function'lar) yapılır.

-- Sözleşme şablonu: onaylı metin sürüm olarak eklenir, değiştirilemez; aynı anda tek etkin sürüm.
create table if not exists public.contract_templates(
  version text primary key check (version ~ '^[0-9A-Za-z._-]{3,40}$'),
  title text not null,
  body_md text not null check (length(body_md) between 200 and 200000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  active boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists contract_templates_one_active on public.contract_templates(active) where active;
create or replace function public.contract_templates_immutable() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
begin
  if tg_op='DELETE' then raise exception 'sözleşme şablonu silinemez (kabul kanıtları buna dayanır)'; end if;
  if new.body_md is distinct from old.body_md or new.sha256 is distinct from old.sha256 or new.version is distinct from old.version then
    raise exception 'sözleşme şablon metni değiştirilemez; yeni sürüm ekleyin';
  end if;
  return new;
end $$;
drop trigger if exists contract_templates_immutable on public.contract_templates;
create trigger contract_templates_immutable before update or delete on public.contract_templates
  for each row execute function public.contract_templates_immutable();

-- Özet sunucuda hesaplanır (istemcinin gönderdiği değere güvenilmez).
create or replace function public.contract_templates_hash() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
begin new.sha256 := encode(sha256(convert_to(new.body_md,'UTF8')),'hex'); new.created_at := now(); return new; end $$;
drop trigger if exists contract_templates_hash on public.contract_templates;
create trigger contract_templates_hash before insert on public.contract_templates
  for each row execute function public.contract_templates_hash();

create sequence if not exists public.quote_no_seq;

create table if not exists public.quotes(
  id uuid primary key default gen_random_uuid(),
  quote_no text not null unique,
  customer_id uuid not null references public.customers(id) on delete restrict,
  -- şahıs: gerçek kişi / şahıs işletmesi; şirket: kurulu şirket (VKN); kuruluş: şirket kurulmamış, taraf kurucu gerçek kişi.
  party_type text not null check (party_type in ('şahıs','şirket','kuruluş')),
  planned_company text,               -- kuruluş: kurulacak şirketin unvanı (yalnız bilgi; taraf değildir)
  representative text,                -- şirket: yetkili temsilci adı
  package_id text not null references public.packages(id),
  billing_period text not null default 'yıllık' check (billing_period in ('aylık','yıllık')),
  list_amount numeric not null check (list_amount >= 0),
  discount_pct integer not null default 0 check (discount_pct between 0 and 100),
  amount numeric not null check (amount > 0),         -- KDV dahil, kesin teklif tutarı (snapshot)
  currency text not null default 'TL',
  price_version integer not null default 1,
  start_date date,                    -- hizmet başlangıcı (kabulde yoksa ödeme günü)
  valid_until date not null,
  status text not null default 'taslak' check (status in ('taslak','gönderildi','kabul','reddedildi','süresi_doldu','iptal')),
  token_hash text unique check (token_hash is null or token_hash ~ '^[0-9a-f]{64}$'),
  sent_at timestamptz, sent_to text, send_count integer not null default 0,
  viewed_at timestamptz,
  otp_hash text, otp_expires_at timestamptz, otp_attempts integer not null default 0, otp_sent_count integer not null default 0, otp_last_sent_at timestamptz,
  template_version text references public.contract_templates(version),
  contract_text text,                 -- kabul anında gösterilen metnin değişmez kopyası (doldurulmuş)
  contract_sha256 text check (contract_sha256 is null or contract_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at timestamptz,
  acceptance_method text check (acceptance_method is null or acceptance_method in ('otp_email','ıslak_imza')),
  acceptance_evidence jsonb,
  rejected_at timestamptz, reject_reason text,
  cancelled_at timestamptz,
  invoice_id uuid references public.invoices(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  address_doc text not null default 'bekliyor' check (address_doc in ('bekliyor','yüklendi','gerekmiyor')),
  address_doc_note text, address_doc_by uuid, address_doc_at timestamptz,
  paid_mail_at timestamptz, welcome_mail_at timestamptz, activated_at timestamptz,
  last_error text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- kabul edilmiş teklifin kanıtı eksiksiz olmalı
  constraint quotes_accept_complete check (status<>'kabul' or (accepted_at is not null and acceptance_method is not null
    and contract_text is not null and contract_sha256 is not null and template_version is not null and acceptance_evidence is not null)),
  constraint quotes_gerekmiyor_reason check (address_doc<>'gerekmiyor' or length(coalesce(address_doc_note,''))>=5)
);
create index if not exists quotes_customer_idx on public.quotes(customer_id);
create index if not exists quotes_status_idx on public.quotes(status, created_at desc);
create unique index if not exists quotes_invoice_unique on public.quotes(invoice_id) where invoice_id is not null;

alter table public.invoices add column if not exists quote_id uuid references public.quotes(id) on delete set null;
create unique index if not exists invoices_quote_unique on public.invoices(quote_id) where quote_id is not null;
alter table public.contracts add column if not exists quote_id uuid references public.quotes(id) on delete set null;
alter table public.contracts add column if not exists accepted_at timestamptz;
alter table public.contracts add column if not exists acceptance_method text;
alter table public.contracts add column if not exists contract_sha256 text;

alter table public.contract_templates enable row level security;
alter table public.quotes enable row level security;
revoke all on public.contract_templates, public.quotes from public, anon, authenticated;
grant select on public.contract_templates, public.quotes to authenticated;
grant insert on public.contract_templates to authenticated;
grant update(active) on public.contract_templates to authenticated;
grant all on public.contract_templates, public.quotes to service_role;
grant usage on sequence public.quote_no_seq to service_role;
drop policy if exists quotes_staff_read on public.quotes;
create policy quotes_staff_read on public.quotes for select to authenticated using (public.is_staff());
drop policy if exists contract_templates_staff_read on public.contract_templates;
create policy contract_templates_staff_read on public.contract_templates for select to authenticated using (public.is_staff());
drop policy if exists contract_templates_admin_insert on public.contract_templates;
create policy contract_templates_admin_insert on public.contract_templates for insert to authenticated with check (public.is_staff_admin());
drop policy if exists contract_templates_admin_activate on public.contract_templates;
create policy contract_templates_admin_activate on public.contract_templates for update to authenticated using (public.is_staff_admin()) with check (public.is_staff_admin());

-- İşlem kaydı: gizli/uzun alanlar yazılmaz.
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  diff jsonb := '{}'::jsonb; rid text; cid text; k text; claims jsonb;
begin
  rid := coalesce(n->>'id', o->>'id');
  cid := case when tg_table_name='customers' then rid else coalesce(n->>'customer_id', o->>'customer_id') end;
  if tg_op='UPDATE' then
    for k in select key from jsonb_each(n) loop
      if (o->k) is distinct from (n->k) then diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k)); end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  elsif tg_op='INSERT' then diff := n;
  else diff := o;
  end if;
  diff := diff - 'portal_password' - 'access_code' - 'token_hash' - 'otp_hash' - 'contract_text' - 'body_md';
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  insert into public.audit_log(actor, actor_email, table_name, row_id, customer_id, action, changes)
  values (auth.uid(), claims->>'email', tg_table_name, rid, nullif(cid,'')::uuid, tg_op, diff);
  return null;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;
drop trigger if exists audit_row on public.quotes;
create trigger audit_row after insert or update or delete on public.quotes for each row execute function public.audit_row();

create or replace function public.quotes_touch() returns trigger language plpgsql set search_path=public,pg_catalog as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before update on public.quotes for each row execute function public.quotes_touch();

-- Teklif numarası: GANU-T-YYYY-0001 (yıl İstanbul saatine göre).
create or replace function public.quote_next_no() returns text
language sql security definer set search_path=public,pg_catalog as $$
  select 'GANU-T-'||to_char(now() at time zone 'Europe/Istanbul','YYYY')||'-'||lpad(nextval('public.quote_no_seq')::text,4,'0');
$$;

-- Kabul (OTP doğrulandıktan sonra Edge çağırır). Tek seferlik: yalnız 'gönderildi' + süresi geçmemiş + aynı token.
-- Fatura (tahsilat kaydı) ve sözleşme satırı aynı işlemde açılır; sözleşme 'bekliyor' durumunda kalır, aktivasyonda 'aktif'.
create or replace function public.quote_accept(p_quote uuid, p_token_hash text, p_template text, p_text text, p_sha text,
  p_method text, p_evidence jsonb, p_party jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare q public.quotes%rowtype; t public.contract_templates%rowtype; inv uuid; con uuid; s date; e date;
begin
  select * into q from public.quotes where id=p_quote for update;
  if not found then return jsonb_build_object('state','yok'); end if;
  if q.status='kabul' then return jsonb_build_object('state','zaten','invoice_id',q.invoice_id); end if;
  if p_method='otp_email' and (q.status<>'gönderildi' or q.token_hash is distinct from p_token_hash) then return jsonb_build_object('state','geçersiz'); end if;
  if p_method='ıslak_imza' and q.status not in ('taslak','gönderildi') then return jsonb_build_object('state','geçersiz'); end if;
  if p_method not in ('otp_email','ıslak_imza') then return jsonb_build_object('state','geçersiz'); end if;
  if q.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    update public.quotes set status='süresi_doldu' where id=q.id; return jsonb_build_object('state','süresi_doldu');
  end if;
  select * into t from public.contract_templates where version=p_template;
  if not found or p_sha !~ '^[0-9a-f]{64}$' or coalesce(p_text,'')='' then return jsonb_build_object('state','geçersiz'); end if;
  -- taraf bilgisi (müşteri sayfasında tamamlanır/teyit edilir)
  update public.customers set
    title=coalesce(nullif(trim(p_party->>'title'),''),title),
    contact=coalesce(nullif(trim(p_party->>'contact'),''),contact),
    tc=coalesce(nullif(p_party->>'tc',''),tc),
    tax_no=coalesce(nullif(p_party->>'tax_no',''),tax_no),
    tax_office=coalesce(nullif(trim(p_party->>'tax_office'),''),tax_office),
    address=coalesce(nullif(trim(p_party->>'address'),''),address),
    city=coalesce(nullif(trim(p_party->>'city'),''),city),
    district=coalesce(nullif(trim(p_party->>'district'),''),district)
  where id=q.customer_id;
  s := coalesce(q.start_date,(now() at time zone 'Europe/Istanbul')::date);
  e := (case when q.billing_period='aylık' then s + interval '1 month' else s + interval '1 year' end)::date - 1;
  insert into public.contracts(customer_id,package,start_date,end_date,price,status,billing_period,quote_id,accepted_at,acceptance_method,contract_sha256)
  values(q.customer_id,q.package_id,s,e,q.amount,'bekliyor',q.billing_period,q.id,now(),p_method,p_sha) returning id into con;
  insert into public.invoices(customer_id,amount,status,issue_date,due_date,note,contract_id,quote_id)
  values(q.customer_id,q.amount,'bekliyor',(now() at time zone 'Europe/Istanbul')::date,(now() at time zone 'Europe/Istanbul')::date+7,
    q.quote_no||' · '||q.package_id||' ('||q.billing_period||')',con,q.id) returning id into inv;
  update public.quotes set status='kabul',accepted_at=now(),acceptance_method=p_method,acceptance_evidence=p_evidence,
    template_version=p_template,contract_text=p_text,contract_sha256=p_sha,invoice_id=inv,contract_id=con,
    otp_hash=null,otp_expires_at=null where id=q.id;
  return jsonb_build_object('state','kabul','invoice_id',inv,'contract_id',con);
end $$;

-- OTP denemesi: kilitli satırda sayaç artırılır; 5 hatalı denemeden sonra yeni kod istenmeli.
create or replace function public.quote_otp_check(p_quote uuid, p_token_hash text, p_otp_hash text) returns text
language plpgsql security definer set search_path=public,pg_catalog as $$
declare q public.quotes%rowtype;
begin
  select * into q from public.quotes where id=p_quote for update;
  if not found or q.status<>'gönderildi' or q.token_hash is distinct from p_token_hash then return 'geçersiz'; end if;
  if q.otp_hash is null or q.otp_expires_at is null or q.otp_expires_at<now() then return 'süre'; end if;
  if q.otp_attempts>=5 then return 'kilit'; end if;
  if q.otp_hash=p_otp_hash then return 'ok'; end if;
  update public.quotes set otp_attempts=otp_attempts+1 where id=q.id;
  return 'hatalı';
end $$;

-- Aktivasyon: tekrar çağrılabilir. Koşullar: teklif kabul, kabul kanıtı, faturası bu teklife ait ve tutarı eşit ve ödenmiş,
-- adres belgesi çözülmüş, sözleşme iptal/bitmiş değil. Müşteri yalnız 'aday' ise 'aktif'e geçer (askıda/ayrıldı değişmez).
create or replace function public.quote_try_activate(p_quote uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare q public.quotes%rowtype; i public.invoices%rowtype; c public.contracts%rowtype; missing text[] := '{}';
begin
  select * into q from public.quotes where id=p_quote for update;
  if not found then return jsonb_build_object('state','yok'); end if;
  if q.activated_at is not null then return jsonb_build_object('state','zaten'); end if;
  if q.status<>'kabul' or q.accepted_at is null or q.contract_sha256 is null then missing := array_append(missing,'kabul'); end if;
  select * into i from public.invoices where id=q.invoice_id;
  if not found or i.quote_id is distinct from q.id or i.status<>'ödendi' or i.amount<>q.amount then missing := array_append(missing,'ödeme'); end if;
  select * into c from public.contracts where id=q.contract_id;
  if not found or c.quote_id is distinct from q.id or c.status in ('iptal','bitti') then missing := array_append(missing,'sözleşme'); end if;
  if q.address_doc='bekliyor' then missing := array_append(missing,'adres_belgesi'); end if;
  if cardinality(missing)>0 then return jsonb_build_object('state','eksik','missing',to_jsonb(missing)); end if;
  update public.contracts set status='aktif' where id=c.id and status='bekliyor';
  update public.customers set status='aktif' where id=q.customer_id and status='aday';
  update public.quotes set activated_at=now(), last_error=null where id=q.id;
  return jsonb_build_object('state','aktif');
end $$;

-- Tek seferlik e-posta: kolon boşsa doldurur ve true döner (iki işçi aynı postayı göndermez).
create or replace function public.quote_claim_mail(p_quote uuid, p_kind text) returns boolean
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
  if p_kind='paid' then update public.quotes set paid_mail_at=now() where id=p_quote and paid_mail_at is null;
  elsif p_kind='welcome' then update public.quotes set welcome_mail_at=now() where id=p_quote and welcome_mail_at is null and activated_at is not null;
  else return false; end if;
  return found;
end $$;

revoke all on function public.quote_next_no(), public.quote_accept(uuid,text,text,text,text,text,jsonb,jsonb),
  public.quote_otp_check(uuid,text,text), public.quote_try_activate(uuid), public.quote_claim_mail(uuid,text)
  from public, anon, authenticated;
grant execute on function public.quote_next_no(), public.quote_accept(uuid,text,text,text,text,text,jsonb,jsonb),
  public.quote_otp_check(uuid,text,text), public.quote_try_activate(uuid), public.quote_claim_mail(uuid,text) to service_role;

-- Teklif sayfası hız sınırı (purchase_rate_limits tablosu, ayrı eylem adları).
create or replace function public.quote_rate_limit(p_ip_hash text,p_action text,p_limit int,p_window_seconds int)
returns boolean language plpgsql security definer set search_path=public,pg_catalog as $$
declare n int;
begin
 if length(coalesce(p_ip_hash,''))<>64 or p_action not in ('quote_view','quote_otp','quote_accept') or p_limit<1 or p_window_seconds<60 then
  raise exception 'geçersiz rate-limit girdisi'; end if;
 insert into public.purchase_rate_limits(ip_hash,action,window_start,hits)
 values(p_ip_hash,p_action,now(),1)
 on conflict(ip_hash,action) do update set
  window_start=case when purchase_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then now() else purchase_rate_limits.window_start end,
  hits=case when purchase_rate_limits.window_start <= now()-make_interval(secs=>p_window_seconds) then 1 else purchase_rate_limits.hits+1 end
 returning hits into n;
 return n<=p_limit;
end $$;
revoke all on function public.quote_rate_limit(text,text,int,int) from public,anon,authenticated;
grant execute on function public.quote_rate_limit(text,text,int,int) to service_role;
