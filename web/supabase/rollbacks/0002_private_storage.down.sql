-- ============================================================
-- DOWN — 0002_private_storage.sql geri alma
-- ============================================================

drop function if exists public.owns_secure_object(text, text);
drop policy if exists "staff_rw_secure_docs" on storage.objects;

-- Bucket silinmeden önce nesneleri boşalt (aksi halde silinmez).
-- DİKKAT: bu, secure-docs içindeki TÜM dosyaları siler.
delete from storage.objects where bucket_id = 'secure-docs';
delete from storage.buckets where id = 'secure-docs';
