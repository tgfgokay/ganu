-- ============================================================
-- DOWN — 0004_prod_gate.sql geri alma
-- ============================================================
delete from public.customers where id = '00000000-0000-4000-8000-0000000000aa';
drop table if exists public.prod_gate_proof;
