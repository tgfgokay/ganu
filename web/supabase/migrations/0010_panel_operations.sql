-- 0010 — Personel paneli operasyon alanları (yalnız ekleme; mevcut satır ve politika değişmez).
-- e-Arşiv faturada alıcının adresi, il ve ilçesi gerekir (Paraşüt cari kaydı).
alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists city text;
alter table public.customers add column if not exists district text;

-- Sözleşme aylık ya da yıllık faturalanır; price bu döneme göre KDV dahil tutardır.
alter table public.contracts add column if not exists billing_period text not null default 'yıllık';
alter table public.contracts drop constraint if exists contracts_billing_period_check;
alter table public.contracts add constraint contracts_billing_period_check check(billing_period in ('aylık','yıllık'));

-- Fatura hangi sözleşme dönemine ait izlenir; sözleşme silinirse fatura kaydı korunur.
alter table public.invoices add column if not exists contract_id uuid references public.contracts(id) on delete set null;
create index if not exists invoices_contract_id_idx on public.invoices(contract_id);
