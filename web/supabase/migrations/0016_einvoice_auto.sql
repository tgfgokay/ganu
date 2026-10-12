-- 0016 — Ödenen faturanın e-Belgesi otomatik kesilir (Paraşüt arayüzüne girmeden).
-- Akış: teklif kabul → müşteri bilgileri tam → ödeme geldi → e-Belge. Anında tetikleyiciler: panelde "Ödendi (elle)"
-- kaydı (seçenekli) ve PayTR bildirimi (EINVOICE_AUTO=true). Bu fonksiyon her sabahki yedek işin (auto-einvoice /
-- einvoice-daily) adaylarını seçer: ödenmiş, ödeme tarihi bugün/son 7 gün (VUK 231/5), e-Belgesi hiç denenmemiş
-- ('başarısız' olanlar insan kontrolü bekler) ve fatura bilgileri tam (panel missingForInvoice ile aynı alanlar).
create or replace function public.einvoice_auto_candidates(p_day date default null, p_limit integer default 10)
returns table(invoice_id uuid, customer_title text, amount numeric, issue_date date)
language sql stable security definer set search_path = public, pg_catalog as $$
  with d as (select coalesce(p_day, (now() at time zone 'Europe/Istanbul')::date) as day)
  select i.id, cu.title, i.amount, i.issue_date
    from public.invoices i
    join d on true
    join public.customers cu on cu.id = i.customer_id
   where i.status = 'ödendi'
     and i.einvoice_status is null and i.parasut_invoice_id is null
     and i.amount > 0
     and coalesce(i.paid_date, i.issue_date) between d.day - 7 and d.day
     and coalesce(btrim(cu.title), '') <> ''
     and (coalesce(cu.tax_no, '') ~ '^[0-9]{10}$' or coalesce(cu.tc, '') ~ '^[0-9]{11}$')
     and (coalesce(btrim(cu.tax_office), '') <> '' or coalesce(cu.tc, '') ~ '^[0-9]{11}$')
     and coalesce(btrim(cu.address), '') <> '' and coalesce(btrim(cu.city), '') <> '' and coalesce(btrim(cu.district), '') <> ''
     and coalesce(btrim(cu.email), '') <> ''
   order by coalesce(i.paid_date, i.issue_date), i.created_at
   limit greatest(1, least(coalesce(p_limit, 10), 25))
$$;
revoke all on function public.einvoice_auto_candidates(date, integer) from public, anon, authenticated;
grant execute on function public.einvoice_auto_candidates(date, integer) to service_role;
