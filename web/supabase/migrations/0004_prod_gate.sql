-- ============================================================
-- PROD READINESS GATE — admin RPC audit kaydı.
-- UYARI / TEHDİT MODELİ: RLS ve REVOKE anon/authenticated rollerini engeller,
-- fakat Supabase SQL Editor ayrıcalıklı postgres/supabase_admin bağlamında bu
-- tabloya yazabilir. Bu kayıt tek başına taklit edilemez kanıt değildir. CI,
-- admin-gate'in kendi nonce'ına verdiği HMAC imzasını DB dışında doğrular.
-- ============================================================

-- Kanıt tablosu — yalnız service-role yazar/okur (RLS policy YOK → anon/auth erişemez).
create table if not exists public.prod_gate_proof (
  id         uuid primary key default gen_random_uuid(),
  uid        uuid not null,
  role       text not null,
  method     text not null,             -- 'jwt' = gateway-doğrulamalı gerçek JWT
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_prod_gate_proof_uid on public.prod_gate_proof(uid);
create index if not exists idx_prod_gate_proof_time on public.prod_gate_proof(created_at);
alter table public.prod_gate_proof enable row level security;
-- Bilerek policy tanımlanmaz: anon/authenticated erişemez; service-role ve
-- ayrıcalıklı DB yöneticileri erişebilir. Bu tablo operasyonel audit içindir.
revoke all on public.prod_gate_proof from anon, authenticated;

-- ------------------------------------------------------------
-- GATE PROBE müşterisi — admin-gate, set_portal_password'ı GERÇEK JWT ile bu
-- throwaway kayıt üzerinde çalıştırıp admin RPC yolunu kanıtlar (gerçek müşteri
-- verisi değişmez). Sabit uuid; parolası her koşuda değişebilir (önemsiz).
-- ------------------------------------------------------------
insert into public.customers (id, title, status, notes)
  values ('00000000-0000-4000-8000-0000000000aa', 'GATE_PROBE (silinebilir)', 'askıda', 'prod-gate probe')
on conflict (id) do nothing;
