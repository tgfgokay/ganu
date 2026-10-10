-- 0015 rollback: denetim düzeltmelerinin fonksiyon, tetikleyici ve kolonları kaldırılır; convert_quote 0014 sürümüne döner.
-- UYARI: yenileme zinciri (previous_contract_id), hizmet dönemleri, ödeme/e-belge kanıtları, damga vergisi durumları,
-- tebligat ve ayrılış alanları ile imza doğrulama kayıtları silinir. Geri almadan önce ilgili tabloları dışa aktarın.
-- 'hazırlık' durumundaki sözleşmeler olduğu gibi kalır (0014 panelinde durum metni olarak görünür); gerekirse elle düzeltin.
drop function if exists public.activate_customer(uuid, uuid, uuid);
drop function if exists public.prepare_monthly_invoices(date, uuid);
drop function if exists public.renew_contract(uuid, text, numeric, date, integer, uuid);
drop function if exists public.renew_contract(uuid, text, numeric, date, integer);
drop function if exists public.register_manual_einvoice(uuid, text, text, date, text, text);
drop function if exists public.mark_invoice_paid_manual(uuid, date, text, numeric, text);
drop function if exists public.mark_quote_sent(uuid, text);
drop trigger if exists contracts_signature_guard on public.contracts;
drop function if exists public.contracts_signature_guard();
drop function if exists public.signed_document_ok(uuid, uuid);
drop trigger if exists invoices_einvoice_guard on public.invoices;
drop function if exists public.invoices_einvoice_guard();
drop trigger if exists customers_activation_gate on public.customers;
drop function if exists public.customers_activation_gate();
drop trigger if exists mail_items_notice on public.mail_items;
drop function if exists public.mail_items_notice();
drop trigger if exists stamp_taxes_insert_check on public.stamp_taxes;
drop function if exists public.stamp_taxes_insert_check();
drop trigger if exists stamp_taxes_freeze on public.stamp_taxes;
drop function if exists public.stamp_taxes_freeze();
drop trigger if exists invoices_paid_needs_proof on public.invoices;
drop function if exists public.invoices_paid_needs_proof();
drop trigger if exists quotes_freeze on public.quotes;
drop function if exists public.quotes_freeze();
alter table public.mail_items drop constraint if exists mail_items_tebligat_not_destroyed;
alter table public.mail_items drop constraint if exists mail_items_legal_result_check;
alter table public.mail_items drop column if exists issuer, drop column if exists reference_no, drop column if exists attempted_at,
  drop column if exists legal_result, drop column if exists receiver_capacity, drop column if exists notified_at, drop column if exists notify_channel;
alter table public.customers drop column if exists termination_notice_at, drop column if exists service_last_day, drop column if exists address_change_filed_at,
  drop column if exists address_change_verified_at, drop column if exists mail_handover_at, drop column if exists privacy_notice_version,
  drop column if exists privacy_notice_delivered_at, drop column if exists etebligat_informed_at, drop column if exists address_activated_at;
alter table public.stamp_taxes drop constraint if exists stamp_taxes_signed_needs_date;
alter table public.stamp_taxes drop constraint if exists stamp_taxes_paper_status_check;
alter table public.stamp_taxes drop column if exists paper_status, drop column if exists signed_document_id, drop column if exists filed_at, drop column if exists tax_paid_at;
update public.stamp_taxes set doc_date = coalesce(doc_date, created_at::date);
alter table public.stamp_taxes alter column doc_date set not null;
drop index if exists public.invoices_einvoice_uuid_unique;
drop index if exists public.invoices_one_per_period;
alter table public.invoices drop constraint if exists invoices_service_period_check;
alter table public.invoices drop column if exists service_period_start, drop column if exists service_period_end, drop column if exists payment_reference,
  drop column if exists payment_verified_by, drop column if exists payment_verified_at, drop column if exists einvoice_verified_by, drop column if exists einvoice_verified_at;
drop index if exists public.contracts_one_successor;
alter table public.contracts drop constraint if exists contracts_renewal_basis_check;
alter table public.contracts drop column if exists previous_contract_id, drop column if exists renewal_basis, drop column if exists price_notice_at,
  drop column if exists signed_document_id, drop column if exists signed_verified_at, drop column if exists signed_verified_by;
drop index if exists public.quotes_one_direct_revision;
alter table public.quotes drop constraint if exists quotes_sent_channel_check;
alter table public.quotes drop column if exists replaces_quote_id, drop column if exists superseded_at, drop column if exists sent_channel;
drop function if exists public.term_months(date, date);
drop function if exists public.billing_anchor(date, integer);
drop function if exists public.term_end(date, integer);
drop function if exists public.ganu_api_role();
drop function if exists public.ganu_flag(text);
-- convert_quote 0014 sürümüne döner (0014_quotes_stamp_tax.sql ile aynı tanım).
create or replace function public.convert_quote(p_quote uuid, p_customer jsonb, p_contract jsonb, p_invoice jsonb default null, p_stamp jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_catalog as $$
declare
  q public.quotes; cu public.customers; ct public.contracts; inv public.invoices; st public.stamp_taxes;
  c_id uuid; k_id uuid; i_id uuid; s_id uuid;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Teklif bulunamadı'; end if;
  if q.contract_id is not null then raise exception 'Bu teklif zaten müşteriye dönüştürülmüş'; end if;
  if q.status = 'red' then raise exception 'Reddedilmiş teklif dönüştürülemez'; end if;

  if nullif(p_customer->>'id', '') is not null then
    c_id := (p_customer->>'id')::uuid;
    if not exists (select 1 from public.customers where id = c_id) then raise exception 'Müşteri bulunamadı'; end if;
  else
    cu := jsonb_populate_record(null::public.customers, p_customer - 'id');
    insert into public.customers(title, contact, email, phone, tax_no, tc, tax_office, address, city, district, status, partner_id, bni, notes)
    values (cu.title, cu.contact, cu.email, cu.phone, cu.tax_no, cu.tc, cu.tax_office, cu.address, cu.city, cu.district,
            coalesce(cu.status, 'aktif'), cu.partner_id, coalesce(cu.bni, q.bni, false), cu.notes)
    returning id into c_id;
  end if;

  ct := jsonb_populate_record(null::public.contracts, p_contract);
  insert into public.contracts(customer_id, package, billing_period, start_date, end_date, price, status, auto_renew)
  values (c_id, coalesce(ct.package, q.package), coalesce(ct.billing_period, q.billing_period), ct.start_date, ct.end_date,
          coalesce(ct.price, q.price), 'aktif', coalesce(ct.auto_renew, false))
  returning id into k_id;

  if p_invoice is not null then
    inv := jsonb_populate_record(null::public.invoices, p_invoice);
    if coalesce(inv.amount, 0) <= 0 then raise exception 'Fatura tutarı sıfırdan büyük olmalı'; end if;
    insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note)
    values (c_id, k_id, inv.amount, coalesce(inv.issue_date, current_date), inv.due_date, 'bekliyor', inv.note)
    returning id into i_id;
  end if;

  if p_stamp is not null then
    st := jsonb_populate_record(null::public.stamp_taxes, p_stamp);
    insert into public.stamp_taxes(customer_id, contract_id, party_title, party_tax_id, kind, doc_date, period_start, period_end,
                                   base, rate_per_mille, payer, notes)
    select c_id, k_id, c.title, coalesce(nullif(c.tax_no, ''), nullif(c.tc, '')), 'sözleşme', coalesce(st.doc_date, current_date),
           coalesce(st.period_start, ct.start_date), coalesce(st.period_end, ct.end_date), st.base, coalesce(st.rate_per_mille, 9.48),
           coalesce(st.payer, 'müşteri'), st.notes
      from public.customers c where c.id = c_id
    returning id into s_id;
  end if;

  update public.quotes set status = 'kabul', customer_id = c_id, contract_id = k_id, decided_at = coalesce(decided_at, now())
   where id = p_quote;
  return jsonb_build_object('customer_id', c_id, 'contract_id', k_id, 'invoice_id', i_id, 'stamp_tax_id', s_id);
end $$;
revoke all on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
