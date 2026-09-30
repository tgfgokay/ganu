-- 0012 rollback: PayTR link kolonları ve ödeme işaretleme RPC'si kaldırılır. PayTR'deki ödemeler etkilenmez;
-- merchant_oid kaybolacağı için rollback öncesi invoices yedeği alınmalıdır.
drop function if exists public.paytr_mark_paid(uuid,text,numeric,date);
drop index if exists public.invoices_paytr_merchant_oid_unique;
alter table public.invoices drop column if exists payment_review;
alter table public.invoices drop column if exists paytr_paid_amount;
alter table public.invoices drop column if exists paytr_merchant_oid;
alter table public.invoices drop column if exists paytr_link_id;
