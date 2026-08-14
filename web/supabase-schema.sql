-- ============================================================
-- GANU Panel · Supabase şeması
-- Supabase → SQL Editor'e yapıştırıp çalıştır.
-- ============================================================

-- İş ortakları (yönlendiren mali müşavir / referans ortakları)
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  email text,
  phone text,
  status text not null default 'aktif',   -- aktif | pasif
  notes text,
  created_at timestamptz not null default now()
);

-- Müşteriler
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact text,
  email text,
  phone text,
  tax_no text,
  tax_office text,
  tc text,
  status text not null default 'aktif',   -- aktif | askıda | ayrıldı
  partner_id uuid references public.partners(id) on delete set null,  -- yönlendiren iş ortağı
  auth_uid uuid,                          -- Faz 2: müşteri giriş kullanıcısı (auth.users.id)
  access_code text,                       -- Faz 2: müşteri portalı erişim kodu (yerel mod)
  notes text,
  created_at timestamptz not null default now()
);

-- Sözleşmeler
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  package text not null default 'Başlangıç',
  start_date date not null,
  end_date date not null,
  price numeric not null default 0,
  status text not null default 'aktif',
  auto_renew boolean not null default false,
  created_at timestamptz not null default now()
);

-- Kargo / Posta
create table if not exists public.mail_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  type text not null default 'kargo',        -- mektup | kargo | tebligat
  sender text,
  received_date date not null default current_date,
  status text not null default 'geldi',       -- geldi | bildirildi | teslim | yönlendirildi | imha
  photo_url text,
  shelf text,                                 -- raf/dolap konumu
  forward_carrier text,                       -- yönlendirme kargo firması (aras|yurtici|mng|ptt)
  forward_tracking text,                      -- yönlendirme kargo takip no
  delivered_to text,                          -- teslim alan kişi
  delivered_at date,                          -- teslim tarihi
  notes text,
  created_at timestamptz not null default now()
);

-- Faturalar
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric not null default 0,
  status text not null default 'bekliyor',    -- bekliyor | ödendi | gecikti
  issue_date date not null default current_date,
  due_date date,
  paid_date date,
  note text,
  einvoice_uuid text,                         -- e-belge UUID (entegratör)
  einvoice_no text,                           -- e-belge numarası
  einvoice_status text,                       -- kesildi | iptal | başarısız
  einvoice_pdf text,                          -- e-belge PDF bağlantısı (Paraşüt)
  created_at timestamptz not null default now()
);
-- mevcut kurulumlar için (tablo zaten varsa kolonu ekle):
alter table public.invoices add column if not exists einvoice_pdf text;
alter table public.invoices add column if not exists payment_link text;      -- kartla ödeme linki (sanal POS)
alter table public.customers add column if not exists kvkk_consent_at timestamptz; -- portal KVKK onay zamanı
alter table public.contracts add column if not exists reminded_at timestamptz;     -- son yenileme hatırlatması
-- NOT: expenses.invoice_id alter'ı, expenses tablosu aşağıda oluşturulduktan SONRA
-- eklenir (bu satırda henüz tablo yok → "relation does not exist" hatasını önler).

-- Belgeler (belge kasası)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  type text not null default 'diger',         -- imza_sirkuleri | vergi_levhasi | kimlik | sozlesme | diger
  file_url text,
  note text,
  created_at timestamptz not null default now()
);

-- Bildirim günlüğü
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  channel text not null,                      -- email | sms | whatsapp
  event text,                                 -- mail_arrived | renewal_due ...
  "to" text,
  message text,
  status text not null default 'kayıt',       -- kayıt | gönderildi | başarısız
  sent_at timestamptz not null default now()
);

-- Müşteri talepleri (Faz 2: yönlendirme / gel-al / tara / imha)
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  mail_id uuid references public.mail_items(id) on delete set null,
  kind text not null default 'yönlendirme',   -- yönlendirme | gel-al | tara | imha | diğer
  note text,
  status text not null default 'yeni',         -- yeni | işlemde | tamamlandı | reddedildi
  created_at timestamptz not null default now()
);

-- Talep mesajları (panel ↔ müşteri konuşma dizisi)
create table if not exists public.request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  "from" text not null default 'ganu',         -- ganu | musteri
  text text not null,
  created_at timestamptz not null default now()
);

-- Masraflar (ofis giderleri + müşteriye yansıtılacak harcamalar)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  category text not null default 'diger',      -- kira | aidat | fatura | kargo | harc | kirtasiye | personel | diger
  amount numeric not null default 0,
  customer_id uuid references public.customers(id) on delete set null,
  billable boolean not null default false,     -- müşteriye yansıtılacak mı
  note text,
  created_at timestamptz not null default now()
);
-- yansıtılan fatura bağı (expenses tablosu var olduktan sonra — fresh install güvenli)
alter table public.expenses add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

-- Yoklama kayıtları (vergi dairesi adres yoklaması · VUK 127)
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  date date not null default current_date,
  result text not null default 'bekleniyor',   -- bekleniyor | olumlu | olumsuz
  officer text,                                 -- gelen memur (ad/sicil)
  attendee text,                                -- adreste hazır bulunan kişi
  note text,
  created_at timestamptz not null default now()
);

-- Toplantı odası rezervasyonları (randevu takvimi)
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  date date not null default current_date,
  start text not null default '10:00',          -- HH:MM
  "end" text not null default '11:00',          -- HH:MM
  attendees int not null default 1,
  note text,
  status text not null default 'talep',         -- talep | onaylandı | reddedildi | iptal
  created_by text not null default 'ganu',      -- ganu | musteri
  created_at timestamptz not null default now()
);

create index if not exists idx_contracts_customer on public.contracts(customer_id);
create index if not exists idx_bookings_date on public.bookings(date);
create index if not exists idx_bookings_customer on public.bookings(customer_id);
create index if not exists idx_requests_customer on public.requests(customer_id);
create index if not exists idx_inspections_customer on public.inspections(customer_id);
create index if not exists idx_contracts_end on public.contracts(end_date);
create index if not exists idx_mail_customer on public.mail_items(customer_id);
create index if not exists idx_mail_date on public.mail_items(received_date);
create index if not exists idx_invoices_customer on public.invoices(customer_id);
create index if not exists idx_documents_customer on public.documents(customer_id);
create index if not exists idx_customers_partner on public.customers(partner_id);
create index if not exists idx_reqmsg_request on public.request_messages(request_id);
create index if not exists idx_expenses_date on public.expenses(date);
create index if not exists idx_expenses_customer on public.expenses(customer_id);

-- ------------------------------------------------------------
-- RLS (Row Level Security)
-- Faz 1: sadece giriş yapmış (authenticated) kullanıcı = GANU personeli
--        her şeyi görür/yönetir. Faz 2'de müşteri tabanlı kural eklenir.
-- ------------------------------------------------------------
alter table public.partners      enable row level security;
alter table public.customers     enable row level security;
alter table public.contracts     enable row level security;
alter table public.mail_items    enable row level security;
alter table public.invoices      enable row level security;
alter table public.documents     enable row level security;
alter table public.notifications enable row level security;
alter table public.requests      enable row level security;
alter table public.inspections   enable row level security;
alter table public.request_messages enable row level security;
alter table public.expenses      enable row level security;
alter table public.bookings      enable row level security;

create policy "staff_all_partners"      on public.partners      for all to authenticated using (true) with check (true);
create policy "staff_all_customers"     on public.customers     for all to authenticated using (true) with check (true);
create policy "staff_all_contracts"     on public.contracts     for all to authenticated using (true) with check (true);
create policy "staff_all_mail"          on public.mail_items    for all to authenticated using (true) with check (true);
create policy "staff_all_invoices"      on public.invoices      for all to authenticated using (true) with check (true);
create policy "staff_all_documents"     on public.documents     for all to authenticated using (true) with check (true);
create policy "staff_all_notifications" on public.notifications for all to authenticated using (true) with check (true);
create policy "staff_all_requests"      on public.requests      for all to authenticated using (true) with check (true);
create policy "staff_all_inspections"   on public.inspections   for all to authenticated using (true) with check (true);
create policy "staff_all_reqmsg"        on public.request_messages for all to authenticated using (true) with check (true);
create policy "staff_all_expenses"      on public.expenses      for all to authenticated using (true) with check (true);
create policy "staff_all_bookings"      on public.bookings      for all to authenticated using (true) with check (true);

-- Sitedeki online başvuru formu: anonim ziyaretçi yalnız 'aday' kaydı EKLEYEBİLİR
-- (okuyamaz, güncelleyemez; erişim kodu boş geldiğinden portala giremez)
create policy "public_apply_customers" on public.customers
  for insert to anon with check (status = 'aday' and access_code = '');

-- ============================================================
-- ŞEMA KAYMASI DÜZELTMELERİ (store.js'in kullandığı kolonlar)
-- ============================================================
alter table public.partners  add column if not exists profession text;
alter table public.partners  add column if not exists iban text;
alter table public.partners  add column if not exists tax_no text;
alter table public.partners  add column if not exists commission_rate numeric not null default 0;
alter table public.partners  add column if not exists access_code text;

alter table public.customers add column if not exists portal_password text;
alter table public.customers add column if not exists payment_receipt_url text;
alter table public.customers add column if not exists payment_claimed_at timestamptz;
alter table public.customers add column if not exists payment_expected numeric;
alter table public.customers add column if not exists payment_pkg text;
alter table public.customers add column if not exists payment_sender text;
alter table public.customers add column if not exists bni boolean default false; -- BNI Nişantaşı kaynaklı: ödeme onayında %indirim uygulanır

alter table public.mail_items add column if not exists sla_reminded_at timestamptz; -- SLA ikinci bildirim damgası

-- ------------------------------------------------------------
-- Komisyon ödemeleri (iş ortağı hakediş ödemesi — dönem kesimi)
-- ------------------------------------------------------------
create table if not exists public.commission_payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  amount numeric not null default 0,
  date date not null default current_date,
  note text,
  expense_id uuid references public.expenses(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_compay_partner on public.commission_payments(partner_id);
alter table public.commission_payments enable row level security;
create policy "staff_all_compay" on public.commission_payments for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Sanal POS siparişleri (kart tahsilatı — pos-payment Edge Function)
-- merchant_oid ↔ customer eşlemesi; callback ödemeyi buradan doğrular.
-- Tabloya yalnız Edge Function (service role) ve personel erişir; anon ERİŞEMEZ.
-- ------------------------------------------------------------
create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  merchant_oid text unique not null,          -- sağlayıcı sipariş no
  customer_id uuid references public.customers(id) on delete set null,
  amount numeric not null default 0,
  pkg text,
  provider text not null default 'paytr',     -- paytr | iyzico
  status text not null default 'bekliyor',    -- bekliyor | başarılı | başarısız
  created_at timestamptz not null default now()
);
create index if not exists idx_pos_orders_oid on public.pos_orders(merchant_oid);
create index if not exists idx_pos_orders_customer on public.pos_orders(customer_id);
alter table public.pos_orders enable row level security;
create policy "staff_all_pos_orders" on public.pos_orders for all to authenticated using (true) with check (true);

-- Güvenlik olayları (P0.3): POS tutar uyuşmazlığı, bilinmeyen sipariş vb.
-- Edge Function service-role ile yazar; yalnız personel okur.
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_security_events_kind on public.security_events(kind);
alter table public.security_events enable row level security;
create policy "staff_read_security_events" on public.security_events for select to authenticated using (true);

-- ------------------------------------------------------------
-- İş ortaklığı başvuru formu (anon INSERT — sadece 'başvuru' statüsü)
-- ------------------------------------------------------------
create policy "public_apply_partners" on public.partners
  for insert to anon with check (status = 'başvuru' and access_code = '' and commission_rate = 0);

-- ============================================================
-- PORTAL RPC KATMANI (anon erişim — RLS'i delmeden, kod doğrulamalı)
-- Müşteri/ortak portalları tabloları doğrudan OKUMAZ; bu SECURITY
-- DEFINER fonksiyonlar erişim kodu/parola doğrulayıp sadece ilgili
-- müşterinin/ortağın verisini döner.
-- ============================================================
create extension if not exists pgcrypto;

-- parola eşleşmesi: 'sha256:<hex>' hash veya düz metin (eski kayıt) desteği
create or replace function public._pw_match(stored text, given text)
returns boolean language sql immutable as $$
  select case
    when stored is null or stored = '' then false
    when stored like 'sha256:%' then stored = 'sha256:' || encode(digest(given, 'sha256'), 'hex')
    else stored = given
  end
$$;

-- müşteri girişi: e-posta + (portal parolası VEYA erişim kodu) → müşteri satırı
create or replace function public.portal_login(p_email text, p_pass text)
returns setof public.customers
language plpgsql security definer set search_path = public as $$
begin
  return query
    select c.* from customers c
    where lower(c.email) = lower(p_email)
      and c.status <> 'ayrıldı'
      and ( _pw_match(c.portal_password, p_pass)
            or (coalesce(c.access_code,'') <> '' and upper(c.access_code) = upper(p_pass)) );
end $$;

-- müşteri portal verisi (tek pakette): kod doğrula → ilgili kayıtlar
create or replace function public.portal_bundle(p_customer_id uuid, p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then
    return null;
  end if;
  return jsonb_build_object(
    'customer',  to_jsonb(c),
    'contracts', coalesce((select jsonb_agg(to_jsonb(x)) from contracts x where x.customer_id = c.id), '[]'::jsonb),
    'mail',      coalesce((select jsonb_agg(to_jsonb(x)) from mail_items x where x.customer_id = c.id), '[]'::jsonb),
    'invoices',  coalesce((select jsonb_agg(to_jsonb(x)) from invoices x where x.customer_id = c.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(x)) from documents x where x.customer_id = c.id), '[]'::jsonb),
    'requests',  coalesce((select jsonb_agg(to_jsonb(x)) from requests x where x.customer_id = c.id), '[]'::jsonb),
    'messages',  coalesce((select jsonb_agg(to_jsonb(m)) from request_messages m
                            join requests r on r.id = m.request_id where r.customer_id = c.id), '[]'::jsonb),
    'bookings',  coalesce((select jsonb_agg(to_jsonb(x)) from bookings x where x.customer_id = c.id), '[]'::jsonb)
  );
end $$;

-- müşteri talebi aç
create or replace function public.portal_create_request(p_customer_id uuid, p_code text, p_mail_id uuid, p_kind text, p_note text)
returns setof public.requests
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then return; end if;
  return query
    insert into requests (customer_id, mail_id, kind, note, status)
    values (c.id, p_mail_id, coalesce(p_kind,'yönlendirme'), p_note, 'yeni') returning *;
end $$;

-- talep mesajı gönder
create or replace function public.portal_send_message(p_customer_id uuid, p_code text, p_request_id uuid, p_text text)
returns setof public.request_messages
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then return; end if;
  if not exists (select 1 from requests r where r.id = p_request_id and r.customer_id = c.id) then return; end if;
  return query
    insert into request_messages (request_id, "from", text)
    values (p_request_id, 'musteri', p_text) returning *;
end $$;

-- toplantı odası talebi
create or replace function public.portal_create_booking(p_customer_id uuid, p_code text, p_date date, p_start text, p_end text, p_attendees int, p_note text)
returns setof public.bookings
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then return; end if;
  return query
    insert into bookings (customer_id, date, start, "end", attendees, note, status, created_by)
    values (c.id, p_date, coalesce(p_start,'10:00'), coalesce(p_end,'11:00'), coalesce(p_attendees,1), p_note, 'talep', 'musteri') returning *;
end $$;

-- KVKK onayı
create or replace function public.portal_set_kvkk(p_customer_id uuid, p_code text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then return false; end if;
  update customers set kvkk_consent_at = now() where id = c.id and kvkk_consent_at is null;
  return true;
end $$;

-- portal parolası değiştir (hash'lenerek saklanır)
create or replace function public.portal_change_password(p_customer_id uuid, p_old text, p_new text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found then return false; end if;
  if not ( _pw_match(c.portal_password, p_old)
           or (coalesce(c.access_code,'') <> '' and upper(c.access_code) = upper(p_old)) ) then
    return false;
  end if;
  update customers set portal_password = 'sha256:' || encode(digest(p_new, 'sha256'), 'hex') where id = c.id;
  return true;
end $$;

-- havale dekontu bildir
create or replace function public.portal_submit_receipt(p_customer_id uuid, p_code text, p_url text, p_expected numeric, p_pkg text, p_sender text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare c customers%rowtype;
begin
  select * into c from customers where id = p_customer_id;
  if not found or coalesce(c.access_code,'') = '' or upper(c.access_code) <> upper(p_code) then return false; end if;
  update customers set payment_receipt_url = p_url, payment_claimed_at = now(),
    payment_expected = p_expected, payment_pkg = p_pkg, payment_sender = p_sender
  where id = c.id;
  return true;
end $$;

-- erişim koduyla müşteri girişi (eski akış desteği)
create or replace function public.portal_login_code(p_code text)
returns setof public.customers
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_code),'') = '' then return; end if;
  return query
    select c.* from customers c
    where coalesce(c.access_code,'') <> '' and upper(c.access_code) = upper(trim(p_code))
      and c.status not in ('ayrıldı','aday');
end $$;

-- satın alma akışı: yeni 'aday' kaydına dekont bildirimi (henüz kodu yok)
create or replace function public.purchase_submit_receipt(p_customer_id uuid, p_url text, p_expected numeric, p_pkg text, p_sender text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update customers set payment_receipt_url = p_url, payment_claimed_at = now(),
    payment_expected = p_expected, payment_pkg = p_pkg, payment_sender = p_sender
  where id = p_customer_id and status = 'aday';
  return found;
end $$;

-- iş ortağı portal girişi: erişim kodu → ortak + bağlı müşteriler + faturalar + ödemeler
create or replace function public.partner_portal(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare p partners%rowtype;
begin
  select * into p from partners
    where coalesce(access_code,'') <> '' and upper(access_code) = upper(p_code) and status = 'aktif';
  if not found then return null; end if;
  return jsonb_build_object(
    'partner',   to_jsonb(p),
    'customers', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', c.id, 'title', c.title, 'contact', c.contact, 'phone', c.phone, 'status', c.status))
                    from customers c where c.partner_id = p.id), '[]'::jsonb),
    'invoices',  coalesce((select jsonb_agg(jsonb_build_object(
                    'id', i.id, 'customer_id', i.customer_id, 'amount', i.amount, 'status', i.status, 'paid_date', i.paid_date))
                    from invoices i join customers c on c.id = i.customer_id
                    where c.partner_id = p.id and i.status = 'ödendi'), '[]'::jsonb),
    'payments',  coalesce((select jsonb_agg(jsonb_build_object(
                    'id', cp.id, 'amount', cp.amount, 'date', cp.date, 'note', cp.note))
                    from commission_payments cp where cp.partner_id = p.id), '[]'::jsonb)
  );
end $$;

-- anon'a sadece RPC izinleri (tablo erişimi yok)
grant execute on function public.portal_login(text, text) to anon;
grant execute on function public.portal_login_code(text) to anon;
grant execute on function public.purchase_submit_receipt(uuid, text, numeric, text, text) to anon;
grant execute on function public.portal_bundle(uuid, text) to anon;
grant execute on function public.portal_create_request(uuid, text, uuid, text, text) to anon;
grant execute on function public.portal_send_message(uuid, text, uuid, text) to anon;
grant execute on function public.portal_create_booking(uuid, text, date, text, text, int, text) to anon;
grant execute on function public.portal_set_kvkk(uuid, text) to anon;
grant execute on function public.portal_change_password(uuid, text, text) to anon;
grant execute on function public.portal_submit_receipt(uuid, text, text, numeric, text, text) to anon;
grant execute on function public.partner_portal(text) to anon;

-- ------------------------------------------------------------
-- Fotoğraf/dekont depolama:
-- Storage → New bucket → "mail-photos" (public okuma önerilir; dekont
-- ve kargo fotoğrafları buraya yüklenir, DB'ye sadece URL yazılır).
-- ------------------------------------------------------------
