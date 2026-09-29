create temp table _ganu_0010_results(name text,expected text,actual text,result text);
do $$ declare b boolean;blocked boolean:=false;cid uuid;kid uuid;iid uuid;
begin
 select count(*)=3 into b from information_schema.columns where table_schema='public' and table_name='customers' and column_name in ('address','city','district');
 insert into _ganu_0010_results values('customers adres/il/ilçe kolonları','true',b::text,case when b then 'PASS' else 'FAIL' end);
 select column_default like '%yıllık%' and is_nullable='NO' into b from information_schema.columns where table_schema='public' and table_name='contracts' and column_name='billing_period';
 insert into _ganu_0010_results values('contracts.billing_period varsayılan yıllık, not null','true',b::text,case when b then 'PASS' else 'FAIL' end);
 insert into public.customers(title,status,city,district) values('TEST_0010','aday','İstanbul','Beykoz') returning id into cid;
 begin insert into public.contracts(customer_id,start_date,end_date,billing_period) values(cid,current_date,current_date+364,'haftalık');
 exception when check_violation then blocked:=true; end;
 insert into _ganu_0010_results values('geçersiz faturalama dönemi red','true',blocked::text,case when blocked then 'PASS' else 'FAIL' end);
 insert into public.contracts(customer_id,start_date,end_date,billing_period,price) values(cid,current_date,current_date+30,'aylık',1899) returning id into kid;
 insert into public.invoices(customer_id,contract_id,amount) values(cid,kid,1899) returning id into iid;
 delete from public.contracts where id=kid;
 select contract_id is null into b from public.invoices where id=iid;
 insert into _ganu_0010_results values('sözleşme silinince fatura korunur, bağ boşalır','true',b::text,case when b then 'PASS' else 'FAIL' end);
 delete from public.customers where id=cid;
end $$;
select * from _ganu_0010_results order by name;
