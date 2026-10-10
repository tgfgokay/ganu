-- 0014 rollback: teklif dönüştürme fonksiyonu, teklifler ve damga vergisi defteri kaldırılır.
-- UYARI: damga vergisi kayıtları beyan dayanağıdır; geri almadan önce dışa aktarın (select * from public.stamp_taxes).
-- Teklifle açılmış müşteri, sözleşme ve faturalar silinmez.
drop function if exists public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb);
drop trigger if exists audit_row on public.stamp_taxes;
drop trigger if exists audit_row on public.quotes;
drop table if exists public.stamp_taxes;
drop table if exists public.quotes;
