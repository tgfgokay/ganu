-- 0014 rollback: teklif modülü kaldırılır. Kabul kanıtları (quotes.contract_text, acceptance_evidence) silineceği için
-- rollback ÖNCESİNDE quotes ve contract_templates tablolarının yedeği alınmalıdır. Faturalar ve sözleşmeler korunur.
drop function if exists public.quote_rate_limit(text,text,int,int);
drop function if exists public.quote_try_activate(uuid);
drop function if exists public.quote_cancel(uuid,boolean);
drop function if exists public.quote_accept(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date);
drop function if exists public.quote_issue_otp(uuid,text,text,text);
drop function if exists public.quote_rotate_token(uuid,text,text);
drop function if exists public.quote_next_no();
drop index if exists public.invoices_quote_unique;
alter table public.invoices drop column if exists quote_id;
alter table public.contracts drop column if exists quote_id;
alter table public.contracts drop column if exists accepted_at;
alter table public.contracts drop column if exists acceptance_method;
alter table public.contracts drop column if exists contract_sha256;
drop table if exists public.quotes;
drop sequence if exists public.quote_no_seq;
drop table if exists public.contract_templates;
drop function if exists public.contract_templates_immutable();
drop function if exists public.contract_templates_hash();
drop function if exists public.quotes_touch();
-- audit_row() 0014 sürümünde yalnız gizli alan listesi genişledi; geri alınmasına gerek yoktur.
