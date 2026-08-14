-- 0007 privilege/policy statik kapıları. Edge davranışları Runbook HTTP testindedir.
create temp table _ganu_0007_results(name text,expected text,actual text,result text);
do $$ declare b boolean;
begin
 select exists(select 1 from pg_policies where schemaname='public' and tablename='customers' and policyname='public_apply_customers') into b;
 insert into _ganu_0007_results values('anon customer insert policy yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_table_privilege('anon','public.customers','INSERT');
 insert into _ganu_0007_results values('anon customers INSERT yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('anon','public.purchase_submit_receipt(uuid,text,numeric,text,text)','EXECUTE');
 insert into _ganu_0007_results values('anon legacy receipt RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('authenticated','public.purchase_submit_receipt(uuid,text,numeric,text,text)','EXECUTE');
 insert into _ganu_0007_results values('authenticated legacy receipt RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 select exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid='public.purchase_submit_receipt(uuid,text,numeric,text,text)'::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') into b;
 insert into _ganu_0007_results values('PUBLIC legacy receipt RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('anon','public.purchase_rate_limit(text,text,integer,integer)','EXECUTE');
 insert into _ganu_0007_results values('anon rate RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
  b:=has_table_privilege('anon','public.purchase_sessions','SELECT');
  insert into _ganu_0007_results values('anon purchase_sessions yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
  b:=has_function_privilege('anon','public.purchase_start_pos(uuid,uuid,text,numeric,text,text,integer,numeric,text,integer,text)','EXECUTE');
  insert into _ganu_0007_results values('anon POS state RPC yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
end $$;

do $$
declare cid uuid:=gen_random_uuid(); sid uuid:=gen_random_uuid(); r jsonb; ok boolean;
begin
 perform public.purchase_create_candidate(cid,sid,'TEST_0007','test-0007@example.invalid','','1234567890','','','REF_TEST-01',true,
  'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 select notes like '%Ref: REF_TEST-01%' and bni into ok from public.customers where id=cid;
 insert into _ganu_0007_results values('ref korunur ve bni server alanı','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 r:=public.purchase_start_pos(sid,cid,'TEST_0007_READY',18990,'Pro','paytr',1,18990,'',0,'TL');
 insert into _ganu_0007_results values('POS ilk init','new',r->>'state',case when r->>'state'='new' then 'PASS' else 'FAIL' end);
 r:=public.purchase_start_pos(sid,cid,'IGNORED',18990,'Pro','paytr',1,18990,'',0,'TL');
 insert into _ganu_0007_results values('eşzamanlı/tekrar init','in_progress',r->>'state',case when r->>'state'='in_progress' then 'PASS' else 'FAIL' end);
 ok:=public.purchase_finish_pos_init('TEST_0007_READY','ready','TEST_TOKEN','https://example.invalid/pay');
 r:=public.purchase_start_pos(sid,cid,'IGNORED2',18990,'Pro','paytr',1,18990,'',0,'TL');
 insert into _ganu_0007_results values('ready init idempotent URL','ready',r->>'state',case when ok and r->>'state'='ready' and r->>'provider_url'='https://example.invalid/pay' then 'PASS' else 'FAIL' end);
 ok:=public.purchase_record_claim(sid,cid,'','');
 insert into _ganu_0007_results values('POS kazanınca receipt red','false',ok::text,case when not ok then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();
 perform public.purchase_create_candidate(cid,sid,'TEST_0007_FAIL','test-0007-f@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 r:=public.purchase_start_pos(sid,cid,'TEST_0007_FAIL',18990,'Pro','paytr',1,18990,'',0,'TL');
 ok:=public.purchase_finish_pos_init('TEST_0007_FAIL','definite_failed','','');
 select use_kind is null into ok from public.purchase_sessions where id=sid;
 insert into _ganu_0007_results values('provider kesin red release','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();
 perform public.purchase_create_candidate(cid,sid,'TEST_0007_AMBIG','test-0007-a@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 r:=public.purchase_start_pos(sid,cid,'TEST_0007_AMBIG',18990,'Pro','paytr',1,18990,'',0,'TL');
 perform public.purchase_finish_pos_init('TEST_0007_AMBIG','ambiguous','','');
 r:=public.purchase_start_pos(sid,cid,'IGNORED3',18990,'Pro','paytr',1,18990,'',0,'TL');
 insert into _ganu_0007_results values('provider belirsiz fail-closed','ambiguous',r->>'state',case when r->>'state'='ambiguous' then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where customer_id=cid; delete from public.customers where id=cid;

 cid:=gen_random_uuid();sid:=gen_random_uuid();
 perform public.purchase_create_candidate(cid,sid,'TEST_0007_INSERT','test-0007-i@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes');
 insert into public.pos_orders(merchant_oid,amount,provider,status) values('TEST_0007_COLLIDE',1,'paytr','bekliyor');
 begin perform public.purchase_start_pos(sid,cid,'TEST_0007_COLLIDE',18990,'Pro','paytr',1,18990,'',0,'TL'); exception when unique_violation then null; end;
 select use_kind is null into ok from public.purchase_sessions where id=sid;
 insert into _ganu_0007_results values('order insert hata atomik rollback','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 delete from public.pos_orders where merchant_oid='TEST_0007_COLLIDE'; delete from public.customers where id=cid;
end $$;
select * from _ganu_0007_results order by name;
select result,count(*) from _ganu_0007_results group by result order by result;
