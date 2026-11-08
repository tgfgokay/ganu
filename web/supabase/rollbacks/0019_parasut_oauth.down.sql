-- Destructive: encrypted connections and pending consents are removed; users must consent again.
-- Reverting code does NOT restore password grant after 10 December 2026.
begin;
drop function if exists public.parasut_oauth_begin(text,uuid,text,text,text);
drop function if exists public.parasut_oauth_consume(text,uuid,text,text);
drop function if exists public.parasut_oauth_connect(text,text,text,text,timestamptz,timestamptz,uuid);
drop function if exists public.parasut_oauth_read(text,text,text);
drop function if exists public.parasut_oauth_claim(text,text,text,bigint);
drop function if exists public.parasut_oauth_complete(text,text,text,uuid,bigint,text,timestamptz,timestamptz);
drop function if exists public.parasut_oauth_fail(text,text,text,uuid,bigint);
drop function if exists public.parasut_oauth_reject(text,text,text,bigint);
drop function if exists public.parasut_oauth_status(text,text,text);
drop table if exists public.parasut_oauth_flows;
drop table if exists public.parasut_oauth_connections;
commit;
