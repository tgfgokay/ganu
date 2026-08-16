-- ============================================================
-- DOWN — 0003_auth_hardening.sql geri alma
-- ============================================================

drop function if exists public.set_portal_password(uuid, text);
drop function if exists public.current_staff_role();
drop policy if exists "owner_admin_write_roles" on public.staff_roles;
drop policy if exists "staff_read_roles" on public.staff_roles;
drop table if exists public.staff_roles;
alter table public.customers drop column if exists must_reset_password;

-- _pw_match: GÜVENLİK GEREĞİ eski (sha256/düz metin kabul eden) sürüme
-- OTOMATİK DÖNÜLMEZ. Zorunlu ise ana şemadaki (supabase-schema.sql) eski
-- tanımı elle geri yükleyin — ÖNERİLMEZ.
-- Örn. (yalnız acil durumda, bilerek):
--   create or replace function public._pw_match(stored text, given text) ... (eski gövde)

-- GERİ ALINAMAZ VERİ: 0003, legacy (bcrypt olmayan) portal_password değerlerini
-- '' yaptı ve must_reset_password=true işaretledi. down bu parolaları GERİ
-- GETİRMEZ (tek yönlü). Staging'de sorun değil; production'da bu migration
-- öncesi PITR/yedek ZORUNLU.
