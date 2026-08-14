-- ============================================================
-- P0.5 — Hassas belgeler için PRIVATE storage + erişim denetimi
-- ------------------------------------------------------------
-- Posta/tebligat fotoğrafı, kimlik, dekont, makbuz, imzalı sözleşme
-- ARTIK public bucket + getPublicUrl ile TUTULMAZ. Private bucket'a
-- yüklenir; erişim yalnız KISA ÖMÜRLÜ signed URL ile verilir.
-- Müşteriye ait dosyanın signed URL'i, sahiplik doğrulandıktan sonra
-- SUNUCUDA (Edge Function / service-role) üretilir.
-- ============================================================

-- 1) Private bucket (dashboard'dan da açılabilir; public=false ŞART).
insert into storage.buckets (id, name, public)
values ('secure-docs', 'secure-docs', false)
on conflict (id) do update set public = false;

-- 2) Nesne yolu kuralı (uygulama tarafı üretir, tahmin edilemez):
--    customers/<customer_id>/<random>.<ext>   → müşteri belgeleri
--    mail/<customer_id>/<random>.<ext>        → posta/tebligat fotoğrafı
--    receipts/<customer_id>/<random>.<ext>    → dekont
--    Not: <random> = uid() (tahmin edilemez), tarih klasörü opsiyonel.

-- 3) RLS (storage.objects):
--    • anon: erişim YOK (bucket private + policy yok).
--    • authenticated (personel): secure-docs üzerinde tam erişim.
--    • müşteri/ortak: doğrudan erişim YOK; signed URL ile erişir.
drop policy if exists "staff_rw_secure_docs" on storage.objects;
create policy "staff_rw_secure_docs" on storage.objects
  for all to authenticated
  using (bucket_id = 'secure-docs')
  with check (bucket_id = 'secure-docs');

-- 4) Müşteriye ait dosya için signed URL üreten RPC (SECURITY DEFINER).
--    Müşteri erişim kodu doğrulanır; yalnız KENDİ customer_id klasöründeki
--    nesne için kısa ömürlü (300 sn) imzalı URL döner.
--    Not: storage.sign() yerine burada yol sahipliği doğrulanır; imzalı URL
--    üretimi Edge Function/service-role tarafında yapılır (bkz. get-file fn).
create or replace function public.owns_secure_object(p_code text, p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.customers c
    where upper(c.access_code) = upper(p_code)
      and p_path like 'customers/' || c.id || '/%'
       or p_path like 'mail/'      || c.id || '/%'
       or p_path like 'receipts/'  || c.id || '/%'
  );
$$;

revoke all on function public.owns_secure_object(text, text) from public;
grant execute on function public.owns_secure_object(text, text) to anon, authenticated;

-- ============================================================
-- MIGRASYON NOTU (eski public 'mail-photos' verisi):
--   • Eski kayıtlar getPublicUrl döndürüyordu (kalıcı public link).
--   • Yeni yüklemeler secure-docs'a gider ve DB'de YOL (path) saklanır,
--     public URL değil. Görüntülemede uygulama signed URL çözer.
--   • Eski public linkler için: 'mail-photos' bucket'ını private yap ve
--     gerekiyorsa nesneleri secure-docs'a taşı (tek seferlik script).
-- ============================================================
