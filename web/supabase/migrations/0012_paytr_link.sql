-- 0012 — PayTR Linkle Ödeme: link kimliği, ödeme referansı ve bildirim idempotency'si.
alter table public.invoices add column if not exists paytr_link_id text;
alter table public.invoices add column if not exists paytr_merchant_oid text;
alter table public.invoices add column if not exists paytr_paid_amount numeric;
alter table public.invoices add column if not exists payment_review text;
create unique index if not exists invoices_paytr_merchant_oid_unique
 on public.invoices(paytr_merchant_oid) where paytr_merchant_oid is not null;

-- Bildirim birden fazla gelebilir: aynı merchant_oid tekrar işlenmez; zaten ödenmiş faturaya gelen
-- farklı ödeme ödendi sayılmaz, personel incelemesine yazılır (çift tahsilat).
create or replace function public.paytr_mark_paid(p_invoice uuid,p_oid text,p_paid numeric,p_date date) returns text
language plpgsql security definer set search_path=public,pg_catalog as $$
declare r public.invoices%rowtype;
begin
 select * into r from public.invoices where id=p_invoice for update;
 if not found then return 'yok'; end if;
 if r.paytr_merchant_oid=p_oid then return 'tekrar'; end if;
 if r.paytr_merchant_oid is not null or r.status='ödendi' then
  update public.invoices set payment_review=left(concat_ws(' | ',payment_review,'Ek PayTR ödemesi '||p_oid||' ('||p_paid||' TL) — çift tahsilat kontrol edin'),500) where id=p_invoice;
  return 'inceleme';
 end if;
 update public.invoices set status='ödendi',paid_date=p_date,payment_method='kart',paytr_merchant_oid=p_oid,paytr_paid_amount=p_paid where id=p_invoice;
 return 'ödendi';
end $$;
revoke all on function public.paytr_mark_paid(uuid,text,numeric,date) from public,anon,authenticated;
grant execute on function public.paytr_mark_paid(uuid,text,numeric,date) to service_role;
