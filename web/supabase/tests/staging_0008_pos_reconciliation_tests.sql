begin;
create temp table _ganu_0008_results(name text,expected text,actual text,result text);
do $$
declare project_ref text:=nullif(current_setting('ganu.test_project_ref',true),''); activated boolean;
begin
 if coalesce(project_ref,'') !~ '^[a-z0-9]{20}$' then
  raise exception 'set ganu.test_project_ref=<20-char staging ref> before running 0008 tests';
 end if;
 activated:=public.legal_activate_sale(project_ref,repeat('9',64),repeat('a',64),'none');
 if not activated then raise exception '0008 test legal gate could not be activated from a clean disabled state'; end if;
end $$;
create or replace function pg_temp.purchase_create_candidate(
 p_customer uuid,p_session uuid,p_title text,p_email text,p_phone text,p_tax_no text,p_tc text,p_tax_office text,p_ref text,p_bni boolean,
 p_package text,p_amount numeric,p_list numeric,p_price_version int,p_discount_code text,p_discount_pct int,p_currency text,p_expires_at timestamptz)
returns boolean language sql as $$ select public.purchase_create_candidate_legal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'2026-08-15.v1',true,true,repeat('a',64),repeat('b',64)) $$;
do $$ declare cid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); r jsonb; x text; h text:=repeat('a',64);
begin
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008','test-0008@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 r:=public.purchase_start_pos(sid,cid,'TEST_0008_AMBIG',18990,'Pro','paytr',1,18990,'',0,'TL',h,now()+interval '30 minutes');
 perform public.purchase_finish_pos_init('TEST_0008_AMBIG','ambiguous','','');
 x:=public.pos_settle('TEST_0008_AMBIG','success',1899000);
 insert into _ganu_0008_results select 'ambiguous geç callback success','ok/callback_success/paid',x||'/'||o.init_state||'/'||s.settlement_state,
  case when x='ok' and o.init_state='callback_success' and s.settlement_state='paid' then 'PASS' else 'FAIL' end
  from public.pos_orders o join public.purchase_sessions s on s.id=o.purchase_session_id where o.merchant_oid='TEST_0008_AMBIG';
 x:=public.pos_settle('TEST_0008_AMBIG','success',1899000);
 insert into _ganu_0008_results values('başarı idempotency ayrık','idempotent_success',x,case when x='idempotent_success' then 'PASS' else 'FAIL' end);
 x:=public.purchase_return_status(h);
 insert into _ganu_0008_results values('aday ödeme minimal durum','paid_pending_activation',x,case when x='paid_pending_activation' then 'PASS' else 'FAIL' end);
 update public.customers set status='aktif' where id=cid;
 x:=public.purchase_return_status(h);
 insert into _ganu_0008_results values('aktif minimal durum','active',x,case when x='active' then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();h:=repeat('b',64);
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_MM','test-0008-mm@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 perform public.purchase_start_pos(sid,cid,'TEST_0008_MM',18990,'Pro','paytr',1,18990,'',0,'TL',h,now()+interval '30 minutes');
 x:=public.pos_settle('TEST_0008_MM','success',1);
 insert into _ganu_0008_results select 'mismatch terminal manual review','mismatch/manual_review/manual_review',x||'/'||o.init_state||'/'||s.settlement_state,
  case when x='mismatch' and o.init_state='manual_review' and s.settlement_state='manual_review' then 'PASS' else 'FAIL' end
  from public.pos_orders o join public.purchase_sessions s on s.id=o.purchase_session_id where o.merchant_oid='TEST_0008_MM';
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_RECEIPT','test-0008-r@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 perform public.purchase_record_claim(sid,cid,'','');
 insert into _ganu_0008_results select 'receipt session terminal','receipt_claimed',settlement_state,case when settlement_state='receipt_claimed' then 'PASS' else 'FAIL' end from public.purchase_sessions where id=sid;
 delete from public.customers where id=cid;

 insert into _ganu_0008_results values('geçersiz return hash yok','null',coalesce(public.purchase_return_status('forged'),'null'),case when public.purchase_return_status('forged') is null then 'PASS' else 'FAIL' end);
end $$;
do $$ declare cid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); x text; ok boolean; h text:=repeat('c',64);
begin
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_CREATING','test-0008-c@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 perform public.purchase_start_pos(sid,cid,'TEST_0008_CREATING',18990,'Pro','paytr',1,18990,'',0,'TL',h,now()+interval '30 minutes');
 x:=public.pos_settle('TEST_0008_CREATING','success',1899000);
 select init_state='callback_success' into ok from public.pos_orders where merchant_oid='TEST_0008_CREATING';
 insert into _ganu_0008_results values('creating geç callback success','ok/callback_success',x||'/'||case when ok then 'callback_success' else 'wrong' end,case when x='ok' and ok then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();h:=repeat('d',64);
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_READY_FAIL','test-0008-f@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 perform public.purchase_start_pos(sid,cid,'TEST_0008_READY_FAIL',18990,'Pro','paytr',1,18990,'',0,'TL',h,now()+interval '30 minutes');
 perform public.purchase_finish_pos_init('TEST_0008_READY_FAIL','ready','TOKEN','https://example.invalid/pay');
 x:=public.pos_settle('TEST_0008_READY_FAIL','failed',1899000);
 insert into _ganu_0008_results select 'ready geç callback fail','failed/callback_failed/failed',x||'/'||o.init_state||'/'||s.settlement_state,
  case when x='failed' and o.init_state='callback_failed' and s.settlement_state='failed' then 'PASS' else 'FAIL' end
  from public.pos_orders o join public.purchase_sessions s on s.id=o.purchase_session_id where o.merchant_oid='TEST_0008_READY_FAIL';
 x:=public.pos_settle('TEST_0008_READY_FAIL','failed',1899000);
 insert into _ganu_0008_results values('başarısızlık idempotency ayrık','idempotent_failed',x,case when x='idempotent_failed' then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();h:=repeat('e',64);
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_RECEIPT_CB','test-0008-rc@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 perform public.purchase_record_claim(sid,cid,'','');
 insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,return_token_hash,return_expires_at)
 values('TEST_0008_RECEIPT_CB',cid,18990,'Pro','paytr','bekliyor',sid,'ready',h,now()+interval '30 minutes');
 x:=public.pos_settle('TEST_0008_RECEIPT_CB','success',1899000);
 insert into _ganu_0008_results select 'receipt session callback red','mismatch/receipt_claimed',x||'/'||s.settlement_state,
  case when x='mismatch' and s.settlement_state='receipt_claimed' then 'PASS' else 'FAIL' end from public.purchase_sessions s where s.id=sid;
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;
end $$;
do $$ declare cid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); r jsonb;
begin
	 perform pg_temp.purchase_create_candidate(cid,sid,'TEST_0008_NULL','test-0008-null@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 r:=public.purchase_start_pos(sid,cid,'TEST_0008_NULL_HASH',18990,'Pro','paytr',1,18990,'',0,'TL',null,now()+interval '30 minutes');
 insert into _ganu_0008_results values('null return hash red','rejected',r->>'state',case when r->>'state'='rejected' then 'PASS' else 'FAIL' end);
 r:=public.purchase_start_pos(sid,cid,'TEST_0008_NULL_EXP',18990,'Pro','paytr',1,18990,'',0,'TL',repeat('f',64),null);
 insert into _ganu_0008_results values('null return expiry red','rejected',r->>'state',case when r->>'state'='rejected' then 'PASS' else 'FAIL' end);
 delete from public.customers where id=cid;
end $$;
do $$ declare b boolean;
begin
 b:=has_function_privilege('anon','public.purchase_return_status(text)','EXECUTE');
 insert into _ganu_0008_results values('anon status RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('anon','public.purchase_start_pos(uuid,uuid,text,numeric,text,text,integer,numeric,text,integer,text,text,timestamp with time zone)','EXECUTE');
 insert into _ganu_0008_results values('anon POS start RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
end $$;
select * from _ganu_0008_results order by name;
select result,count(*) from _ganu_0008_results group by result order by result;
update public.legal_sale_config set enabled=false,tested_project_ref=null,sql_proof_sha256=null,http_proof_sha256=null,
 sql_tested_at=null,http_tested_at=null,activated_at=null,cross_border_status='none',updated_at=now() where id=true;
commit;
