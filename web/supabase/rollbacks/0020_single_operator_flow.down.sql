-- Önce işleri tamamlayın/uzlaştırın; bekleyen veya belirsiz gönderim kanıtı silinmez.
do $$ begin if exists(select 1 from public.operation_jobs where state not in ('sent','done')) then raise exception 'Önce operasyon işlerini tamamlayın/uzlaştırın';end if;end $$;
drop trigger if exists invoice_contract_customer_guard on public.invoices;
drop function if exists public.invoice_contract_customer_guard();
drop trigger if exists operation_records_owner_guard on public.contracts;
drop trigger if exists operation_records_owner_guard on public.invoices;
drop trigger if exists operation_records_owner_guard on public.mail_items;
drop function if exists public.operation_records_owner_guard();
drop trigger if exists mail_provider_notice_guard on public.mail_items;
drop function if exists public.mail_provider_notice_guard();
drop trigger if exists invoice_operation_jobs on public.invoices;
drop function if exists public.invoice_operation_jobs();
drop function if exists public.accept_quote(uuid,jsonb,date),public.receive_mail(uuid,uuid,text,jsonb),public.enqueue_operation(text,uuid,uuid,uuid,uuid),public.operation_claim(uuid),public.operation_prepare(uuid,uuid,jsonb),public.operation_begin_send(uuid,uuid,text),public.operation_finish(uuid,uuid,text,text,jsonb,text),public.retry_operation(uuid),public.operation_defer(uuid,uuid,text,integer);
-- Kuyruk ve kabul audit kanıtı arşivlenmeden düşürülmez; tablolar ve ek kolonlar korunur.

create or replace function public.mark_invoice_paid_manual(p_invoice uuid, p_paid_date date, p_method text, p_amount numeric, p_reference text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare inv public.invoices;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Fatura bulunamadı'; end if;
  if inv.status = 'ödendi' then raise exception 'Fatura zaten ödendi'; end if;
  if inv.payment_review is not null then raise exception 'PayTR ödeme incelemesi açık; önce inceleyin'; end if;
  if p_method is null or p_method not in ('havale','nakit','diğer') then raise exception 'Ödeme yöntemi havale, nakit ya da diğer olmalı'; end if;
  if p_amount is distinct from inv.amount then raise exception 'Tutar fatura tutarına eşit olmalı (kısmi ödeme desteklenmiyor)'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Banka işlem referansı ya da makbuz numarası zorunlu'; end if;
  if p_paid_date is null or p_paid_date > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Ödeme tarihi boş ya da ileri tarihli'; end if;
  perform set_config('ganu.manual_payment', 'on', true);
  update public.invoices set status = 'ödendi', paid_date = p_paid_date, payment_method = p_method, payment_reference = btrim(p_reference),
         payment_verified_by = auth.uid(), payment_verified_at = now()
   where id = p_invoice;
  perform set_config('ganu.manual_payment', '', true);
end $$;
create or replace function public.activate_customer(p_customer uuid, p_contract uuid, p_document uuid) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare cu public.customers; ct public.contracts;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into cu from public.customers where id = p_customer for update;
  if not found then raise exception 'Müşteri bulunamadı'; end if;
  select * into ct from public.contracts where id = p_contract and customer_id = p_customer for update;
  if not found then raise exception 'Sözleşme bu müşteriye ait değil'; end if;
  if ct.status not in ('hazırlık','aktif') then raise exception 'Bu sözleşme aktifleştirilemez (%)', ct.status; end if;
  if not public.signed_document_ok(p_customer, p_document) then
    raise exception 'İmzalı sözleşme belgesi bu müşteriye ait değil, "Sözleşme" türünde değil ya da dosyası yüklenmemiş';
  end if;
  perform set_config('ganu.activate', 'on', true);
  update public.contracts set status = 'aktif', signed_document_id = p_document, signed_verified_at = now(), signed_verified_by = auth.uid()
   where id = p_contract;
  if cu.status <> 'aktif' then
    update public.customers set status = 'aktif' where id = p_customer;
  end if;
  perform set_config('ganu.activate', '', true);
end $$;
