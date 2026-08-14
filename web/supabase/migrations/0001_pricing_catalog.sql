-- ============================================================
-- P0.2 — Sunucu tarafı FİYAT KATALOĞU (tek gerçek kaynak)
-- ------------------------------------------------------------
-- Site, checkout, panel ve Edge Function fiyatı buradan okur.
-- İstemciden gelen tutara ASLA güvenilmez (bkz. pos-payment Edge Function).
-- Fiyat sürümü (price_version) siparişlerde saklanır → eski siparişler için
-- fiyat denetlenebilir kalır.
-- ============================================================

create table if not exists public.packages (
  id             text primary key,              -- 'Başlangıç' | 'Pro' | 'Kurumsal' (pkg string ile birebir)
  name           text not null,
  list_amount    numeric not null,              -- KDV DAHİL yıllık ₺ (Kurumsal için null/0 → teklif)
  monthly_amount numeric,                        -- referans aylık ₺ (gösterim)
  currency       text  not null default 'TL',
  tax_rate       numeric not null default 20,    -- % KDV
  price_version  integer not null default 1,
  active         boolean not null default true,
  is_custom      boolean not null default false, -- true → "özel teklif" (sabit fiyat yok)
  sort           integer not null default 0,
  valid_from     timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

alter table public.packages enable row level security;

-- Fiyat vitrini herkese açık okunur (yalnız AKTİF paketler).
drop policy if exists "anyone_read_active_packages" on public.packages;
create policy "anyone_read_active_packages" on public.packages
  for select to anon, authenticated using (active = true);

-- Yazma yalnız personel (authenticated).
drop policy if exists "staff_write_packages" on public.packages;
create policy "staff_write_packages" on public.packages
  for all to authenticated using (true) with check (true);

insert into public.packages (id, name, list_amount, monthly_amount, is_custom, sort) values
  ('Başlangıç', 'Başlangıç',  9990,  999, false, 1),
  ('Pro',       'Pro',       18990, 1899, false, 2),
  ('Kurumsal',  'Kurumsal',      0,    0, true,  3)
on conflict (id) do update
  set list_amount    = excluded.list_amount,
      monthly_amount = excluded.monthly_amount,
      is_custom      = excluded.is_custom,
      name           = excluded.name,
      sort           = excluded.sort;

-- ------------------------------------------------------------
-- İndirim kodları — GİZLİ. anon OKUYAMAZ (ör. BNININSANTASI panelde/sitede
-- ilan edilmez). Edge Function service-role ile okur; personel görebilir.
-- ------------------------------------------------------------
create table if not exists public.discount_codes (
  code       text primary key,                  -- normalize: UPPER, boşluksuz
  pct        integer not null check (pct between 1 and 100),
  active     boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.discount_codes enable row level security;

-- anon için policy YOK → gizli. Yalnız personel okur; service-role RLS'i baypas eder.
drop policy if exists "staff_read_discounts" on public.discount_codes;
create policy "staff_read_discounts" on public.discount_codes
  for select to authenticated using (true);
drop policy if exists "staff_write_discounts" on public.discount_codes;
create policy "staff_write_discounts" on public.discount_codes
  for all to authenticated using (true) with check (true);

insert into public.discount_codes (code, pct, note) values
  ('BNINISANTASI', 10, 'BNI Nişantaşı — gizli üye indirimi (ilan edilmez)')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- pos_orders: fiyat denetimi için sürüm/indirim alanları (P0.2/P0.3)
-- ------------------------------------------------------------
alter table public.pos_orders add column if not exists price_version integer;
alter table public.pos_orders add column if not exists list_amount   numeric;
alter table public.pos_orders add column if not exists discount_code text;
alter table public.pos_orders add column if not exists discount_pct  integer;
alter table public.pos_orders add column if not exists currency      text default 'TL';
