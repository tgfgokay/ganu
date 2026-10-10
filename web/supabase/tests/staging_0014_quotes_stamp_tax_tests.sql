-- 0014 testleri (yalnız staging). Pozitif dönüştürme testi staff_roles'taki ilk personel UID'siyle yapılır.
-- Not: audit_log değiştirilemez olduğu için TEST_0014 kayıtlarının işlem kaydı audit_log'da kalır.
create temp table _ganu_0014_results(name text,expected text,actual text,result text);
do $$ declare b boolean;n int;qid uuid;q2 uuid;r jsonb;sid uuid;amt numeric;staff uuid;
begin
 select count(*)=2 into b from pg_tables where schemaname='public' and tablename in ('quotes','stamp_taxes') and rowsecurity;
 insert into _ganu_0014_results values('quotes ve stamp_taxes var, RLS açık','true',b::text,case when b then 'PASS' else 'FAIL' end);
 b:=has_table_privilege('anon','public.quotes','SELECT') or has_table_privilege('anon','public.stamp_taxes','SELECT')
   or has_function_privilege('anon','public.convert_quote(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE');
 insert into _ganu_0014_results values('anon okuyamaz, dönüştüremez','false',b::text,case when not b then 'PASS' else 'FAIL' end);
 b:=has_function_privilege('authenticated','public.convert_quote(uuid,jsonb,jsonb,jsonb,jsonb)','EXECUTE');
 insert into _ganu_0014_results values('personel dönüştürme fonksiyonunu çağırabilir','true',b::text,case when b then 'PASS' else 'FAIL' end);
 select count(*) into n from pg_trigger where tgname='audit_row' and tgrelid in ('public.quotes'::regclass,'public.stamp_taxes'::regclass);
 insert into _ganu_0014_results values('işlem kaydı tetikleyicileri','2',n::text,case when n=2 then 'PASS' else 'FAIL' end);

 insert into public.stamp_taxes(party_title,doc_date,base) values('TEST_0014_DV',current_date,8325) returning id,amount into sid,amt;
 insert into _ganu_0014_results values('DV = 8.325 × binde 9,48 (tek nüsha)','78.92',amt::text,case when amt=78.92 then 'PASS' else 'FAIL' end);
 delete from public.stamp_taxes where id=sid;
 b:=false;begin insert into public.stamp_taxes(party_title,doc_date,base,payer) values('TEST_0014_DV',current_date,100,'banka');exception when check_violation then b:=true;end;
 insert into _ganu_0014_results values('geçersiz ödeyen red','true',b::text,case when b then 'PASS' else 'FAIL' end);
 b:=false;begin insert into public.stamp_taxes(party_title,doc_date,base,declared_period) values('TEST_0014_DV',current_date,100,'2026-13');exception when check_violation then b:=true;end;
 insert into _ganu_0014_results values('geçersiz beyan dönemi red','true',b::text,case when b then 'PASS' else 'FAIL' end);
 b:=false;begin insert into public.quotes(title,package,price,billing_period) values('TEST_0014',  'Başlangıç',999,'haftalık');exception when check_violation then b:=true;end;
 insert into _ganu_0014_results values('geçersiz teklif dönemi red','true',b::text,case when b then 'PASS' else 'FAIL' end);

 insert into public.quotes(title,package,billing_period,list_price,price,tax_no) values('TEST_0014','Başlangıç','yıllık',9990,8991,'1234567890') returning id into qid;
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid()::text,'role','authenticated')::text,true);
 b:=false;begin perform public.convert_quote(qid,'{"title":"TEST_0014"}','{"start_date":"2026-10-09","end_date":"2027-10-08"}');exception when insufficient_privilege then b:=true;end;
 insert into _ganu_0014_results values('personel olmayan dönüştüremez','true',b::text,case when b then 'PASS' else 'FAIL' end);

 select user_id into staff from public.staff_roles limit 1;
 if staff is null then
  insert into _ganu_0014_results values('dönüştürme (personel)','PASS','SKIP: staff_roles boş','SKIP');
 else
  perform set_config('request.jwt.claims',json_build_object('sub',staff::text,'role','authenticated')::text,true);
  -- Yarım kalmama: fatura tutarı 0 → hata; müşteri/sözleşme de yazılmamalı.
  b:=false;begin perform public.convert_quote(qid,'{"title":"TEST_0014_ATOM"}','{"start_date":"2026-10-09","end_date":"2027-10-08"}','{"amount":0}');exception when others then b:=true;end;
  select count(*) into n from public.customers where title='TEST_0014_ATOM';
  insert into _ganu_0014_results values('hata olursa hiçbir kayıt açılmaz','true/0',b::text||'/'||n,case when b and n=0 then 'PASS' else 'FAIL' end);

  r:=public.convert_quote(qid,'{"title":"TEST_0014","tax_no":"1234567890","tax_office":"Beykoz"}',
     '{"start_date":"2026-10-09","end_date":"2027-10-08","price":8991}',
     '{"amount":8991,"issue_date":"2026-10-09","due_date":"2026-10-14","note":"TEST_0014"}',
     '{"doc_date":"2026-10-09","base":7492.5}');
  select count(*) into n from public.quotes where id=qid and status='kabul' and customer_id=(r->>'customer_id')::uuid and contract_id=(r->>'contract_id')::uuid;
  insert into _ganu_0014_results values('teklif kabul, müşteri ve sözleşmeye bağlı','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.invoices where id=(r->>'invoice_id')::uuid and contract_id=(r->>'contract_id')::uuid and amount=8991 and status='bekliyor';
  insert into _ganu_0014_results values('ilk fatura sözleşmeye bağlı açıldı','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);
  select count(*) into n from public.stamp_taxes where id=(r->>'stamp_tax_id')::uuid and party_title='TEST_0014' and party_tax_id='1234567890'
    and period_start='2026-10-09' and period_end='2027-10-08' and amount=71.03 and payer='müşteri';
  insert into _ganu_0014_results values('DV kaydı: taraf, dönem, 7.492,50 × binde 9,48 = 71,03','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);
  b:=false;begin perform public.convert_quote(qid,'{"title":"TEST_0014"}','{"start_date":"2026-10-09","end_date":"2027-10-08"}');exception when others then b:=true;end;
  insert into _ganu_0014_results values('aynı teklif ikinci kez dönüştürülemez','true',b::text,case when b then 'PASS' else 'FAIL' end);

  insert into public.quotes(title,package,price) values('TEST_0014_MEVCUT','Pro',1899) returning id into q2;
  r:=public.convert_quote(q2,json_build_object('id',r->>'customer_id')::jsonb,'{"start_date":"2026-10-09","end_date":"2027-10-08","billing_period":"aylık"}');
  select count(*) into n from public.customers where title like 'TEST_0014%';
  insert into _ganu_0014_results values('mevcut müşteriye dönüştürmede yeni müşteri açılmaz','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);

  delete from public.stamp_taxes where customer_id=(r->>'customer_id')::uuid;
  delete from public.invoices where customer_id=(r->>'customer_id')::uuid;
  delete from public.quotes where id in (qid,q2);
  delete from public.contracts where customer_id=(r->>'customer_id')::uuid;
  delete from public.customers where id=(r->>'customer_id')::uuid;
 end if;
 delete from public.quotes where title like 'TEST_0014%';
 perform set_config('request.jwt.claims','',true);
end $$;
select * from _ganu_0014_results order by name;
