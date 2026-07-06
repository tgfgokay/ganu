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
alter table public.expenses add column if not exists invoice_id uuid references public.invoices(id) on delete set null; -- yansıtılan fatura

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

create index if not exists idx_contracts_customer on public.contracts(customer_id);
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

-- Sitedeki online başvuru formu: anonim ziyaretçi yalnız 'aday' kaydı EKLEYEBİLİR
-- (okuyamaz, güncelleyemez; erişim kodu boş geldiğinden portala giremez)
create policy "public_apply_customers" on public.customers
  for insert to anon with check (status = 'aday' and access_code = '');

-- NOT: Faz 2'de müşteri girişi eklenince, müşterinin SADECE kendi
-- kayıtlarını görmesi için ek policy'ler tanımlanacak (auth_uid eşleşmesi).

-- ------------------------------------------------------------
-- Fotoğraf depolama için (opsiyonel, kargo etiketi):
-- Storage → New bucket → "mail-photos" (private) oluştur.
-- ------------------------------------------------------------
