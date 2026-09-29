-- 0011 rollback: e-Belge iş durumu kolonları ve claim RPC kaldırılır. Paraşüt'te kesilmiş
-- belgeler etkilenmez; ancak parasut_invoice_id kaybolacağı için rollback öncesi invoices yedeği alınmalıdır.
drop function if exists public.einvoice_claim(uuid);
drop index if exists public.invoices_parasut_invoice_id_unique;
alter table public.invoices drop constraint if exists invoices_einvoice_status_check;
alter table public.invoices drop column if exists einvoice_requested_at;
alter table public.invoices drop column if exists einvoice_attempts;
alter table public.invoices drop column if exists einvoice_error;
alter table public.invoices drop column if exists einvoice_job_id;
alter table public.invoices drop constraint if exists invoices_einvoice_kind_check;
alter table public.invoices drop column if exists einvoice_kind;
alter table public.invoices drop column if exists parasut_payment_at;
alter table public.invoices drop column if exists parasut_invoice_id;
alter table public.invoices drop constraint if exists invoices_payment_method_check;
alter table public.invoices drop column if exists payment_method;
alter table public.customers drop column if exists parasut_contact_id;
