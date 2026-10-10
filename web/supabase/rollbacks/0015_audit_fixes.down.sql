-- 0015 rollback: denetim düzeltmelerinin fonksiyon, tetikleyici ve kolonları kaldırılır; convert_quote 0014 sürümüne döner.
-- UYARI: yenileme zinciri (previous_contract_id), hizmet dönemleri, ödeme/e-belge kanıtları, damga vergisi durumları,
-- tebligat ve ayrılış alanları silinir. Geri almadan önce ilgili tabloları dışa aktarın.
drop function if exists public.prepare_monthly_invoices(date, uuid);
drop function if exists public.renew_contract(uuid, text, numeric, date, integer);
drop function if exists public.register_manual_einvoice(uuid, text, text, date, text, text);
drop function if exists public.mark_invoice_paid_manual(uuid, date, text, numeric, text);
drop function if exists public.mark_quote_sent(uuid, text);
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
alter table public.contracts drop column if exists previous_contract_id, drop column if exists renewal_basis, drop column if exists price_notice_at;
drop index if exists public.quotes_one_direct_revision;
alter table public.quotes drop constraint if exists quotes_sent_channel_check;
alter table public.quotes drop column if exists replaces_quote_id, drop column if exists superseded_at, drop column if exists sent_channel;
drop function if exists public.term_months(date, date);
drop function if exists public.billing_anchor(date, integer);
drop function if exists public.term_end(date, integer);
-- convert_quote'un 0014 sürümünü geri yüklemek için 0014_quotes_stamp_tax.sql içindeki fonksiyon tanımını yeniden çalıştırın.
