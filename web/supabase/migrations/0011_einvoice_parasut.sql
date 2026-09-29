-- 0011 — Paraşüt e-Belge kesimi: kaldığı yerden devam eden, tekrar kesmeyen iş durumu.
-- Paraşüt'te dış referansla fatura aranamadığı için tekrar gönderim kontrolü burada tutulur.
alter table public.customers add column if not exists parasut_contact_id text;

alter table public.invoices add column if not exists payment_method text;
alter table public.invoices drop constraint if exists invoices_payment_method_check;
alter table public.invoices add constraint invoices_payment_method_check
 check(payment_method is null or payment_method in ('havale','kart','nakit','diğer'));
alter table public.invoices add column if not exists parasut_invoice_id text;
alter table public.invoices add column if not exists parasut_payment_at timestamptz;
alter table public.invoices add column if not exists einvoice_kind text;
alter table public.invoices drop constraint if exists invoices_einvoice_kind_check;
alter table public.invoices add constraint invoices_einvoice_kind_check
 check(einvoice_kind is null or einvoice_kind in ('e-arşiv','e-fatura'));
alter table public.invoices add column if not exists einvoice_job_id text;
alter table public.invoices add column if not exists einvoice_error text;
alter table public.invoices add column if not exists einvoice_attempts integer not null default 0;
alter table public.invoices add column if not exists einvoice_requested_at timestamptz;
alter table public.invoices drop constraint if exists invoices_einvoice_status_check;
alter table public.invoices add constraint invoices_einvoice_status_check
 check(einvoice_status is null or einvoice_status in ('işleniyor','kesildi','iptal','başarısız'));
create unique index if not exists invoices_parasut_invoice_id_unique
 on public.invoices(parasut_invoice_id) where parasut_invoice_id is not null;

-- Tek sahiplik: aynı faturayı iki istek aynı anda işleyemez. Takılan iş 3 dk sonra devralınır.
-- Elle "kesildi" işaretlenen (Paraşüt arayüzünde kesilmiş) fatura parasut_invoice_id olmadığı için alınmaz.
create or replace function public.einvoice_claim(p_invoice uuid) returns setof public.invoices
language sql security definer set search_path=public,pg_catalog as $$
 update public.invoices set
  einvoice_status=case when einvoice_status='kesildi' then 'kesildi' else 'işleniyor' end,
  einvoice_requested_at=now(),einvoice_attempts=einvoice_attempts+1,einvoice_error=null
 where id=p_invoice and amount>0 and (
  einvoice_status is null or einvoice_status='başarısız'
  or (einvoice_status='işleniyor' and einvoice_requested_at<now()-interval '3 minutes')
  or (einvoice_status='kesildi' and einvoice_pdf is null and parasut_invoice_id is not null
      and (einvoice_requested_at is null or einvoice_requested_at<now()-interval '3 minutes')))
 returning *;
$$;
revoke all on function public.einvoice_claim(uuid) from public,anon,authenticated;
grant execute on function public.einvoice_claim(uuid) to service_role;
