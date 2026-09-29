-- 0010 rollback: panel operasyon kolonlarını kaldırır. Adres ve dönem verisi silinir;
-- rollback öncesi gerekiyorsa customers/contracts/invoices yedeği alınmalıdır.
drop index if exists public.invoices_contract_id_idx;
alter table public.invoices drop column if exists contract_id;
alter table public.contracts drop constraint if exists contracts_billing_period_check;
alter table public.contracts drop column if exists billing_period;
alter table public.customers drop column if exists district;
alter table public.customers drop column if exists city;
alter table public.customers drop column if exists address;
