-- Güvenlik rollback'i fail-closed: anon insert/RPC yetkileri geri verilmez.
drop index if exists public.pos_orders_purchase_session_unique;
drop function if exists public.purchase_start_pos(uuid,uuid,text,numeric,text,text,int,numeric,text,int,text);
drop function if exists public.purchase_finish_pos_init(text,text,text,text);
alter table public.pos_orders drop column if exists purchase_session_id;
alter table public.pos_orders drop column if exists provider_url;
alter table public.pos_orders drop column if exists provider_token;
alter table public.pos_orders drop column if exists init_state;
drop function if exists public.purchase_record_claim(uuid,uuid,text,text);
drop function if exists public.purchase_create_candidate(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,int,text,int,text,timestamptz);
drop function if exists public.purchase_rate_limit(text,text,int,int);
drop table if exists public.purchase_rate_limits;
drop table if exists public.purchase_sessions;
