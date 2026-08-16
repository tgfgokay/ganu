-- Fail-closed rollback: önce config kapanır; hukuki kanıtsız eski create yeniden açılmaz.
update public.legal_sale_config set enabled=false where id=true;
revoke all on function public.purchase_create_candidate_legal(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz,text,boolean,boolean,text,text) from public,anon,authenticated,service_role;
drop function if exists public.purchase_create_candidate_legal(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz,text,boolean,boolean,text,text);
drop trigger if exists pos_orders_bind_legal_evidence on public.pos_orders;
drop function if exists public.pos_order_bind_legal_evidence();
-- Receipt güvenlik nedeniyle kapalı; 0008'i yeniden uygulamadan açılmaz.
revoke all on function public.purchase_record_claim(uuid,uuid,text,text) from public,anon,authenticated,service_role;
drop trigger if exists customers_legal_evidence_immutable on public.customers;
drop trigger if exists purchase_sessions_legal_evidence_immutable on public.purchase_sessions;
drop trigger if exists pos_orders_legal_evidence_immutable on public.pos_orders;
drop function if exists public.legal_evidence_immutable();
alter table public.pos_orders drop constraint if exists pos_orders_legal_evidence_complete;
alter table public.purchase_sessions drop constraint if exists purchase_sessions_legal_evidence_complete;
alter table public.customers drop constraint if exists customers_legal_evidence_complete;
alter table public.pos_orders drop column if exists early_performance_requested_at;
alter table public.pos_orders drop column if exists preinfo_accepted_at;
alter table public.pos_orders drop column if exists legal_text_version;
alter table public.purchase_sessions drop column if exists legal_user_agent_hash;
alter table public.purchase_sessions drop column if exists legal_ip_hash;
alter table public.purchase_sessions drop column if exists early_performance_requested_at;
alter table public.purchase_sessions drop column if exists preinfo_accepted_at;
alter table public.purchase_sessions drop column if exists legal_text_version;
alter table public.customers drop column if exists early_performance_requested_at;
alter table public.customers drop column if exists preinfo_accepted_at;
alter table public.customers drop column if exists legal_text_version;
drop function if exists public.legal_activate_sale(text,text,text,text);
drop table if exists public.legal_sale_config;
