-- 0017 rollback: Paraşüt eşitleme fonksiyonları kaldırılır, ödendi kanıt kuralı 0015 haline döner.
-- Paraşüt'ten alınmış fatura satırları silinmez (source/parasut_synced_at kolonları ile birlikte veri korunur).
drop function if exists public.parasut_mark_paid(uuid, date, text, numeric, text);
drop function if exists public.parasut_import_invoice(uuid, text, numeric, date, date, text, text, text, text);
create or replace function public.invoices_paid_needs_proof() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.status = 'ödendi' and (tg_op = 'INSERT' or old.status is distinct from 'ödendi') and not (
       (new.paytr_merchant_oid is not null and coalesce(auth.role(), '') = 'service_role')
    or (coalesce(btrim(new.payment_reference), '') <> '' and new.payment_verified_by is not null and (public.ganu_flag('manual_payment') or not public.ganu_api_role()))) then
    raise exception 'Ödeme kanıtı olmadan fatura ödendi yapılamaz (PayTR bildirimi ya da banka referansı)' using errcode = 'check_violation';
  end if;
  return new;
end $$;
