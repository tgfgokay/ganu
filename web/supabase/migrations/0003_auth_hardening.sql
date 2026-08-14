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

-- Parola belirleme/güncelleme — YETKİ: owner/admin personel VEYA müşterinin kendisi
-- (auth.uid() = customers.auth_user_id, OTP geçişi sonrası). bcrypt saklar.
create or replace function public.set_portal_password(p_customer_id uuid, p_new text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  is_staff boolean;
  is_self  boolean;
begin
  if length(coalesce(p_new,'')) < 8 then
    raise exception 'parola en az 8 karakter olmalı';
  end if;
  is_staff := exists (select 1 from public.staff_roles r
                      where r.user_id = auth.uid() and r.role in ('owner','admin'));
  -- self = müşterinin kendi auth kullanıcısı (customers.auth_uid, OTP geçişinde bağlanır).
  is_self := auth.uid() is not null and exists (
    select 1 from public.customers c where c.id = p_customer_id and c.auth_uid = auth.uid()
  );
  if not (is_staff or is_self) then
    raise exception 'yetki yok: parola yalnız owner/admin ya da müşterinin kendisi tarafından belirlenebilir';
  end if;
  update public.customers
     set portal_password = 'bcrypt:' || crypt(p_new, gen_salt('bf', 12))
   where id = p_customer_id;
end $$;
revoke all on function public.set_portal_password(uuid, text) from anon;
grant execute on function public.set_portal_password(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- ESKİ (düz metin / sha256:) PAROLA GEÇİŞ PLANI — zorunlu sıfırlama
-- _pw_match artık yalnız bcrypt kabul ettiği için eski hash'ler otomatik
-- GEÇERSİZDİR. Bu kayıtları açıkça işaretle ve temizle → kullanıcı parola
-- sıfırlama (OTP / e-posta) ile yeni bcrypt parola belirleyene kadar
-- parola ile giremez (geçici olarak access_code/OTP kullanılır).
-- ------------------------------------------------------------
alter table public.customers add column if not exists must_reset_password boolean not null default false;

update public.customers
   set must_reset_password = true,
       portal_password = ''          -- eski düz metin/sha256 hash'i sıfırla (login edilemez)
 where coalesce(portal_password,'') <> ''
   and portal_password not like 'bcrypt:%';

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
  for select to authenticated using (false); -- 0005 gerçek is_staff() policy'sini açar

drop policy if exists "owner_admin_write_roles" on public.staff_roles;
create policy "owner_admin_write_roles" on public.staff_roles
  for all to authenticated
  using (false) with check (false); -- 0005 recursion-safe is_staff_admin() kullanır

-- rol yardımcıları
create or replace function public.current_staff_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.staff_roles where user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- portal_change_password: sha256 yazımını BCRYPT'e çevir (P0.6). access_code ile
-- eski parola doğrulama korunur → legacy/reset kullanıcısı access_code'unu p_old
-- vererek yeni bcrypt parola belirler (kontrollü geçiş; must_reset_password=false).
create or replace function public.portal_change_password(p_customer_id uuid, p_old text, p_new text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare c public.customers%rowtype;
begin
  if length(coalesce(p_new,'')) < 8 then
    raise exception 'parola en az 8 karakter olmalı';
  end if;
  select * into c from public.customers where id = p_customer_id;
  if not found then return false; end if;
  if not ( _pw_match(c.portal_password, p_old)
           or (coalesce(c.access_code,'') <> '' and upper(c.access_code) = upper(p_old)) ) then
    return false;
  end if;
  update public.customers
     set portal_password = 'bcrypt:' || crypt(p_new, gen_salt('bf', 12)),
         must_reset_password = false
   where id = c.id;
  return true;
end $$;

-- ------------------------------------------------------------
-- NOT: portal_login / portal_bundle RPC'leri şimdilik access_code'a dayanıyor.
-- OTP akışı devreye alınınca bu RPC'ler auth.uid() + customer eşlemesine
-- taşınacak ve access_code login sırrı olmaktan çıkacak. Bu migrasyon,
-- düz metin/sha256 parola kabulünü bitirir; access_code geçişi ayrı adımdır.
-- ============================================================
