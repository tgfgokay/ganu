create temp table _ganu_0009_results(name text,expected text,actual text,result text);
do $$ declare b boolean;cid uuid:=gen_random_uuid();cid2 uuid:=gen_random_uuid();sid uuid:=gen_random_uuid();ok boolean;blocked boolean:=false;first_sha text:=repeat('1',64);preserved text;
begin
 b:=has_function_privilege('service_role','public.purchase_create_candidate(uuid,uuid,text,text,text,text,text,text,text,boolean,text,numeric,numeric,integer,text,integer,text,timestamp with time zone)','EXECUTE');
 insert into _ganu_0009_results values('legacy create service-role kapalı','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_table_privilege('service_role','public.legal_sale_config','UPDATE');
 insert into _ganu_0009_results values('service-role config UPDATE yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('service_role','public.legal_activate_sale(text,text,text,text)','EXECUTE');
 insert into _ganu_0009_results values('service-role yalnız activation RPC','true',b::text,case when b then 'PASS' else 'FAIL' end);
 select not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where n.nspname='public' and p.proname='legal_activate_sale' and p.pronargs=4 and a.grantee=0 and a.privilege_type='EXECUTE')
   and not has_function_privilege('anon','public.legal_activate_sale(text,text,text,text)','EXECUTE')
   and not has_function_privilege('authenticated','public.legal_activate_sale(text,text,text,text)','EXECUTE') into b;
 insert into _ganu_0009_results values('activation RPC PUBLIC/anon/auth kapalı','true',b::text,case when b then 'PASS' else 'FAIL' end);
 select p.prosecdef and r.rolname='postgres' into b from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
  where n.nspname='public' and p.proname='legal_activate_sale' and p.pronargs=4;
 insert into _ganu_0009_results values('activation SECURITY DEFINER postgres owner','true',b::text,case when b then 'PASS' else 'FAIL' end);
 select enabled into b from public.legal_sale_config where id=true;
 insert into _ganu_0009_results values('migration default satış kapalı','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 begin
  perform public.purchase_create_candidate_legal(cid,sid,'TEST_0009','test-0009@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes','2026-08-15.v1',true,true,repeat('a',64),repeat('b',64));
 exception when others then blocked:=true; end;
 insert into _ganu_0009_results values('config kapalı create red','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 blocked:=false;begin perform public.legal_activate_sale(null,first_sha,repeat('2',64),'none');exception when others then blocked:=true;end;
 insert into _ganu_0009_results values('activation null project red','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 ok:=public.legal_activate_sale('abcdefghijklmnopqrst',first_sha,repeat('2',64),'none');
 insert into _ganu_0009_results values('activation exact kanıtla tek geçiş','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 ok:=public.legal_activate_sale('zyxwvutsrqponmlkjihg',repeat('3',64),repeat('4',64),'adequacy');
 select sql_proof_sha256 into preserved from public.legal_sale_config where id=true;
 insert into _ganu_0009_results values('activation overwrite red ve ilk kanıt korunur','false/first',ok::text||'/'||case when preserved=first_sha then 'first' else 'changed' end,case when not ok and preserved=first_sha then 'PASS' else 'FAIL' end);
 blocked:=false;
 begin
  perform public.purchase_create_candidate_legal(cid,sid,'TEST_0009','test-0009@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes','2026-08-15.v1',true,false,repeat('a',64),repeat('b',64));
 exception when others then blocked:=true; end;
 insert into _ganu_0009_results values('erken ifa false red','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 perform public.purchase_create_candidate_legal(cid,sid,'TEST_0009','test-0009@example.invalid','','1234567890','','','',false,'Pro',18990,18990,1,'',0,'TL',now()+interval '30 minutes','2026-08-15.v1',true,true,repeat('a',64),repeat('b',64));
 select c.legal_text_version='2026-08-15.v1' and c.preinfo_accepted_at is not null and c.early_performance_requested_at is not null
  and s.legal_text_version=c.legal_text_version and s.preinfo_accepted_at=c.preinfo_accepted_at and s.early_performance_requested_at=c.early_performance_requested_at
  and s.legal_ip_hash=repeat('a',64) and s.legal_user_agent_hash=repeat('b',64) into ok
  from public.customers c join public.purchase_sessions s on s.customer_id=c.id where c.id=cid;
 insert into _ganu_0009_results values('customer+session atomik exact evidence','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 blocked:=false;begin update public.purchase_sessions set legal_text_version='forge' where id=sid;exception when others then blocked:=true;end;
 insert into _ganu_0009_results values('evidence immutable','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 blocked:=false;begin update public.purchase_sessions set legal_ip_hash=repeat('c',64) where id=sid;exception when others then blocked:=true;end;
 insert into _ganu_0009_results values('IP HMAC evidence immutable','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 insert into public.customers(id,title,status,access_code) values(cid2,'TEST_0009_CROSS','aday','');
 blocked:=false;begin
  insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,price_version,list_amount,discount_code,discount_pct,currency)
   values('TEST_0009_CROSS_'||left(cid2::text,8),cid2,18990,'Pro','paytr','bekliyor',sid,'creating',1,18990,null,null,'TL');
 exception when others then blocked:=true;end;
 insert into _ganu_0009_results values('başka customer POS evidence bağlayamaz','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 ok:=public.purchase_record_claim(sid,cid,'','TEST');
 insert into _ganu_0009_results values('receipt exact evidence ile çalışır','true',ok::text,case when ok then 'PASS' else 'FAIL' end);
 delete from public.customers where id=cid;
 delete from public.customers where id=cid2;
 update public.legal_sale_config set enabled=false,tested_project_ref=null,sql_proof_sha256=null,http_proof_sha256=null,sql_tested_at=null,http_tested_at=null,activated_at=null,cross_border_status='none' where id=true;
end $$;
select * from _ganu_0009_results order by name;
select result,count(*) from _ganu_0009_results group by result order by result;
