-- ============================================================
-- DOWN — 0001_pricing_catalog.sql geri alma
-- Not: git revert KODU geri alır, VERİTABANINI GERİ ALMAZ. DB için bu dosya.
-- Sırayla çalıştır (bağımlılık: pos_settle önce, sonra kolonlar, sonra tablolar).
-- Staging'de veri yok → güvenli. Production'da ÖNCE PITR/yedek.
-- ============================================================

drop function if exists public.pos_settle(text, text, bigint);

alter table public.pos_orders
  drop column if exists price_version,
  drop column if exists list_amount,
  drop column if exists discount_code,
  drop column if exists discount_pct,
  drop column if exists currency;

drop table if exists public.discount_codes;
drop table if exists public.packages;
