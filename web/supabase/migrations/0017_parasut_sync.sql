-- 0017 — Paraşüt → panel eşitleme (parasut-sync Edge Function, her sabah einvoice-daily + panel düğmesi).
-- Paraşüt arayüzünde kesilen belge, vergi numarası tutan müşteriye panel faturası olarak bağlanır; parasut_invoice_id
-- dolu olduğu için panel o belgeyi ikinci kez kesmez (einvoice_claim / einvoice_auto_candidates). Paraşüt'te kapanan
-- fatura (iyzico ile kartla "Tahsilat talep et" ödemesi ya da Paraşüt'e girilen havale) panelde de ödendi olur;
-- kanıt Paraşüt tahsilat numarasıdır. İki yazma yolu da yalnız service role'e açıktır.
alter table public.invoices add column if not exists source text not null default 'panel';
alter table public.invoices drop constraint if exists invoices_source_check;
alter table public.invoices add constraint invoices_source_check check (source in ('panel','paraşüt'));
alter table public.invoices add column if not exists parasut_synced_at timestamptz;

-- Ödendi geçişi kanıt ister (0015) + üçüncü yol: Paraşüt tahsilatı (parasut_mark_paid, service role, bağlı fatura).
create or replace function public.invoices_paid_needs_proof() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.status = 'ödendi' and (tg_op = 'INSERT' or old.status is distinct from 'ödendi') and not (
       (new.paytr_merchant_oid is not null and coalesce(auth.role(), '') = 'service_role')
    or (coalesce(btrim(new.payment_reference), '') <> '' and new.payment_verified_by is not null and (public.ganu_flag('manual_payment') or not public.ganu_api_role()))
    or (public.ganu_flag('parasut_payment') and coalesce(auth.role(), '') = 'service_role'
        and new.parasut_invoice_id is not null and coalesce(btrim(new.payment_reference), '') <> '')) then
    raise exception 'Ödeme kanıtı olmadan fatura ödendi yapılamaz (PayTR bildirimi ya da banka referansı)' using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Paraşüt'te kesilmiş belgeyi panele fatura olarak bağlar. Aynı Paraşüt faturası ikinci kez gelirse mevcut kayıt döner.
-- Sözleşme yalnız müşterinin tek bir aktif/hazırlık sözleşmesi varsa bağlanır.
create or replace function public.parasut_import_invoice(p_customer uuid, p_parasut_id text, p_amount numeric, p_issue date, p_due date,
  p_kind text, p_no text, p_uuid text, p_note text) returns uuid
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v_id uuid; v_contract uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if coalesce(btrim(p_parasut_id), '') !~ '^[0-9]+$' then raise exception 'Paraşüt fatura numarası geçersiz'; end if;
  select id into v_id from public.invoices where parasut_invoice_id = btrim(p_parasut_id);
  if found then return v_id; end if;
  if not exists (select 1 from public.customers where id = p_customer) then raise exception 'Müşteri bulunamadı'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Tutar sıfırdan büyük olmalı'; end if;
  if p_issue is null or p_issue > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Fatura tarihi boş ya da ileri tarihli'; end if;
  if p_kind is not null and p_kind not in ('e-arşiv','e-fatura') then raise exception 'Belge türü e-arşiv ya da e-fatura olmalı'; end if;
  if p_kind is not null and coalesce(btrim(p_no), '') = '' then raise exception 'Belge numarası zorunlu'; end if;
  select (array_agg(id))[1] into v_contract from public.contracts
   where customer_id = p_customer and status in ('aktif','hazırlık') having count(*) = 1;
  insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, source, parasut_invoice_id,
                              einvoice_status, einvoice_kind, einvoice_no, einvoice_uuid, einvoice_verified_at, parasut_synced_at)
  values (p_customer, v_contract, round(p_amount, 2), p_issue, coalesce(p_due, p_issue), 'bekliyor', nullif(btrim(p_note), ''), 'paraşüt', btrim(p_parasut_id),
          case when p_kind is null then null else 'kesildi' end, p_kind, nullif(btrim(p_no), ''), nullif(lower(btrim(p_uuid)), ''),
          case when p_kind is null then null else now() end, now())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from public.invoices where parasut_invoice_id = btrim(p_parasut_id); end if;
  return v_id;
end $$;
revoke all on function public.parasut_import_invoice(uuid, text, numeric, date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.parasut_import_invoice(uuid, text, numeric, date, date, text, text, text, text) to service_role;

-- Paraşüt'te tamamen kapanmış faturayı panelde ödendi yapar. Zaten ödendiyse bir şey yapmaz.
create or replace function public.parasut_mark_paid(p_invoice uuid, p_paid_date date, p_method text, p_amount numeric, p_reference text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare inv public.invoices;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Fatura bulunamadı'; end if;
  if inv.status = 'ödendi' then return; end if;
  if inv.parasut_invoice_id is null then raise exception 'Faturanın Paraşüt bağlantısı yok'; end if;
  if inv.payment_review is not null then raise exception 'PayTR ödeme incelemesi açık; önce inceleyin'; end if;
  if p_method is null or p_method not in ('havale','kart','diğer') then raise exception 'Ödeme yöntemi havale, kart ya da diğer olmalı'; end if;
  if p_amount is null or abs(p_amount - inv.amount) > 0.02 then raise exception 'Paraşüt tahsilatı fatura tutarını tutmuyor'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Paraşüt tahsilat numarası zorunlu'; end if;
  if p_paid_date is null or p_paid_date > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Ödeme tarihi boş ya da ileri tarihli'; end if;
  perform set_config('ganu.parasut_payment', 'on', true);
  update public.invoices set status = 'ödendi', paid_date = p_paid_date, payment_method = p_method, payment_reference = btrim(p_reference),
         payment_verified_at = now(), parasut_payment_at = coalesce(parasut_payment_at, now()), parasut_synced_at = now()
   where id = p_invoice;
  perform set_config('ganu.parasut_payment', '', true);
end $$;
revoke all on function public.parasut_mark_paid(uuid, date, text, numeric, text) from public, anon, authenticated;
grant execute on function public.parasut_mark_paid(uuid, date, text, numeric, text) to service_role;
