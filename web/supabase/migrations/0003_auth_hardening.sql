-- ============================================================
-- P0.6 — Portal/panel kimlik doğrulama sertleştirme
-- ------------------------------------------------------------
-- • Tuzsuz SHA-256 ve DÜZ METİN parola desteği KALDIRILIR.
-- • Portal parolaları bcrypt (pgcrypto) ile tuzlu saklanır.
-- • Personel için RBAC iskeleti (staff_roles).
-- • HEDEF (bu migrasyonun ötesinde, lansman öncesi zorunlu):
--     - Müşteri/personel girişi Supabase Auth (e-posta OTP / magic link).
--     - access_code = kimlik SIRRI DEĞİL; tek kullanımlık davet/bağlama kodu.
--     - Rate limit + artan gecikme + geçici kilit (Edge/Gateway katmanı).
--     - Personel MFA (Supabase Auth MFA).
--   Bu adımlar portal kodu + Edge ile birlikte uygulanır; aşağıdaki bcrypt
--   değişikliği güvenli ara adımdır (düz metin/sha256 kabulünü bitirir).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- Parola eşleşmesi: YALNIZ bcrypt. Düz metin ve sha256 ARTIK reddedilir.
create or replace function public._pw_match(stored text, given text)
returns boolean
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when stored is null or stored = '' then false
    when stored like 'bcrypt:%' then substr(stored, 8) = crypt(given, substr(stored, 8))
    else false   -- P0.6: düz metin ve 'sha256:' KABUL EDİLMEZ
  end
$$;

-- Parola belirleme/güncelleme — personel panelinden çağrılır; bcrypt saklar.
create or replace function public.set_portal_password(p_customer_id uuid, p_new text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update public.customers
     set portal_password = 'bcrypt:' || crypt(p_new, gen_salt('bf', 12))
   where id = p_customer_id;
$$;
revoke all on function public.set_portal_password(uuid, text) from anon;
grant execute on function public.set_portal_password(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- RBAC iskeleti (P1 başlangıcı) — personel rolleri
-- ------------------------------------------------------------
create table if not exists public.staff_roles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'operations'
             check (role in ('owner','admin','operations','finance','support')),
  created_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;

drop policy if exists "staff_read_roles" on public.staff_roles;
create policy "staff_read_roles" on public.staff_roles
  for select to authenticated using (true);

drop policy if exists "owner_admin_write_roles" on public.staff_roles;
create policy "owner_admin_write_roles" on public.staff_roles
  for all to authenticated
  using (exists (select 1 from public.staff_roles r where r.user_id = auth.uid() and r.role in ('owner','admin')))
  with check (exists (select 1 from public.staff_roles r where r.user_id = auth.uid() and r.role in ('owner','admin')));

-- rol yardımcıları
create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff_roles where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- NOT: portal_login / portal_bundle RPC'leri şimdilik access_code'a dayanıyor.
-- OTP akışı devreye alınınca bu RPC'ler auth.uid() + customer eşlemesine
-- taşınacak ve access_code login sırrı olmaktan çıkacak. Bu migrasyon,
-- düz metin/sha256 parola kabulünü bitirir; access_code geçişi ayrı adımdır.
-- ============================================================
