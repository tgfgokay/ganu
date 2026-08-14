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

-- ------------------------------------------------------------
-- P0.3 — POS callback ATOMİK mutabakat (sipariş + müşteri tek transaction)
-- Satır kilidi (FOR UPDATE) + idempotency + tutar doğrulama tek RPC içinde.
-- Dönüş: 'ok' | 'idempotent' | 'mismatch' | 'unknown' | 'failed'
-- ------------------------------------------------------------
create or replace function public.pos_settle(
  p_merchant_oid text,
  p_status       text,
  p_total_amount bigint   -- sağlayıcı tutarı (kuruş)
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  o        public.pos_orders%rowtype;
  expected bigint;
begin
  select * into o from public.pos_orders where merchant_oid = p_merchant_oid for update;
  if not found then
    insert into public.security_events(kind, detail)
      values ('pos_unknown_order', jsonb_build_object('merchant_oid', p_merchant_oid));
    return 'unknown';
  end if;

  -- IDEMPOTENCY: sonuçlanmış sipariş yeniden işlenmez.
  if o.status in ('başarılı', 'başarısız') then
    return 'idempotent';
  end if;

  if p_status = 'success' then
    expected := round(o.amount * 100);
    if p_total_amount <> expected then
      update public.pos_orders set status = 'şüpheli' where merchant_oid = p_merchant_oid;
      insert into public.security_events(kind, detail)
        values ('pos_amount_mismatch',
                jsonb_build_object('merchant_oid', p_merchant_oid, 'expected', expected, 'got', p_total_amount));
      return 'mismatch';
    end if;
    update public.pos_orders set status = 'başarılı' where merchant_oid = p_merchant_oid;
    update public.customers set
      payment_claimed_at  = now(),
      payment_expected    = o.amount,
      payment_pkg         = coalesce(o.pkg, ''),
      payment_sender      = o.provider || ' sanal POS',
      payment_receipt_url = 'pos:' || o.provider
      where id = o.customer_id;
    return 'ok';
  else
    update public.pos_orders set status = 'başarısız' where merchant_oid = p_merchant_oid;
    return 'failed';
  end if;
end $$;

-- Yalnız service-role (Edge Function) çağırır; anon/authenticated erişemez.
revoke all on function public.pos_settle(text, text, bigint) from anon, authenticated;
