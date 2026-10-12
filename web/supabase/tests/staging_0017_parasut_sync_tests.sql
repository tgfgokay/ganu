-- 0017 testleri: Paraşüt'ten fatura bağlama ve Paraşüt tahsilatıyla ödendi. Yazma yolları yalnız service role'e açık;
-- panel kullanıcısı çağıramaz, service role da kanıtsız (bayraksız) ödendi yapamaz.
-- Sonda FAIL varsa istisna fırlatılır ve işlem geri alınır. Canlıda DENEME için betiğin başına
--   select set_config('ganu.test_dry_run','on',false);
-- ekleyin; testler geçse bile sonda istisna fırlatılır, migration dahil her şey geri alınır.
create temp table _ganu_0017_results(name text,result text,actual text);
grant all on _ganu_0017_results to authenticated, service_role;
create or replace function pg_temp.ok(p_name text,p_cond boolean,p_actual text default null) returns void language sql as
$$ insert into _ganu_0017_results values(p_name,case when p_cond then 'PASS' else 'FAIL' end,coalesce(p_actual,coalesce(p_cond::text,'null'))) $$;
create or replace function pg_temp.fails(p_sql text,p_expect text) returns boolean language plpgsql as
$$ begin execute p_sql; return false; exception when others then return sqlerrm ilike '%'||p_expect||'%'; end $$;

do $$
declare d date := (now() at time zone 'Europe/Istanbul')::date; c1 uuid; c2 uuid; k uuid; i1 uuid; i1b uuid; i2 uuid; i3 uuid; err text; r public.invoices;
begin
  insert into public.customers(title,status,tax_no,tax_office,address,city,district,email)
    values('TEST_0017_TEK','aktif','1111111170','Beykoz','Kavacık Mah.','İstanbul','Beykoz','t0017@example.com') returning id into c1;
  insert into public.customers(title,status,tax_no,address,city,district) values('TEST_0017_IKI','aday','1111111171','Kavacık','İstanbul','Beykoz') returning id into c2;
  insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(c1,'Pro','yıllık',d,d+364,18000,'hazırlık') returning id into k;
  insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(c2,'Pro','yıllık',d,d+364,18000,'hazırlık');
  insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(c2,'Pro','yıllık',d,d+364,18000,'aktif');

  -- Panel kullanıcısı iki fonksiyonu da çağıramaz
  begin
    execute 'set local role authenticated';
    perform public.parasut_import_invoice(c1,'990017001',18000,d,d,'e-arşiv','GA0TEST0017','',null);
    err := 'izin verildi';
  exception when insufficient_privilege then err := 'reddedildi';
  end;
  execute 'reset role';
  perform pg_temp.ok('panel kullanıcısı Paraşüt faturası bağlayamaz', err = 'reddedildi', err);
  begin
    execute 'set local role authenticated';
    perform public.parasut_mark_paid(gen_random_uuid(),d,'kart',1,'x');
    err := 'izin verildi';
  exception when insufficient_privilege then err := 'reddedildi';
  end;
  execute 'reset role';
  perform pg_temp.ok('panel kullanıcısı Paraşüt tahsilatı işleyemez', err = 'reddedildi', err);

  perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
  execute 'set local role service_role';

  i1 := public.parasut_import_invoice(c1,'990017001',18000,d,d,'e-arşiv','GA0TEST0017','AAAAAAAA-0000-4000-8000-000000000017','Paraşüt: GA0TEST0017');
  select * into r from public.invoices where id = i1;
  perform pg_temp.ok('bağlanan fatura: kaynak paraşüt, e-Belge kesildi, bekliyor', r.source = 'paraşüt' and r.einvoice_status = 'kesildi' and r.status = 'bekliyor'
    and r.einvoice_kind = 'e-arşiv' and r.einvoice_no = 'GA0TEST0017' and r.einvoice_uuid = 'aaaaaaaa-0000-4000-8000-000000000017', row_to_json(r)::text);
  perform pg_temp.ok('tek hazırlık sözleşmesi bağlanır', r.contract_id = k);
  i1b := public.parasut_import_invoice(c1,'990017001',18000,d,d,'e-arşiv','GA0TEST0017','',null);
  perform pg_temp.ok('aynı Paraşüt faturası ikinci kez gelince yeni kayıt açılmaz', i1b = i1 and (select count(*) from public.invoices where parasut_invoice_id = '990017001') = 1);
  i2 := public.parasut_import_invoice(c2,'990017002',20000,d,d,'e-fatura','GN0TEST0017',null,null);
  perform pg_temp.ok('birden çok açık sözleşmede sözleşme bağlanmaz', (select contract_id is null from public.invoices where id = i2));
  i3 := public.parasut_import_invoice(c2,'990017003',500,d,d,'e-arşiv','GA0TEST0017B','aaaaaaaa-0000-4000-8000-000000000017',null);
  perform pg_temp.ok('başka faturada kayıtlı ETTN ile bağlama yapılmaz', i3 is null, coalesce(i3::text,'null'));
  perform pg_temp.ok('ileri tarihli fatura reddedilir', pg_temp.fails(format('select public.parasut_import_invoice(%L,%L,1,%L,null,null,null,null,null)',c1,'990017004',d+1),'ileri tarihli'));
  perform pg_temp.ok('geçersiz Paraşüt numarası reddedilir', pg_temp.fails(format('select public.parasut_import_invoice(%L,%L,1,%L,null,null,null,null,null)',c1,'abc',d),'geçersiz'));

  perform pg_temp.ok('service role bayraksız ödendi yapamaz',
    pg_temp.fails(format('update public.invoices set status=%L,paid_date=%L,payment_reference=%L where id=%L','ödendi',d,'x',i1),'Ödeme kanıtı'));
  perform pg_temp.ok('tutar tutmayan tahsilat reddedilir', pg_temp.fails(format('select public.parasut_mark_paid(%L,%L,%L,%s,%L)',i1,d,'kart',17000,'Paraşüt tahsilat 1'),'tutmuyor'));
  perform pg_temp.ok('geçersiz yöntem reddedilir', pg_temp.fails(format('select public.parasut_mark_paid(%L,%L,%L,%s,%L)',i1,d,'çek',18000,'Paraşüt tahsilat 1'),'yöntemi'));
  perform public.parasut_mark_paid(i1,d,'kart',18000,'Paraşüt tahsilat 123');
  select * into r from public.invoices where id = i1;
  perform pg_temp.ok('Paraşüt tahsilatı ödendi yapar (kart, referans, Paraşüt tahsilatı işaretli)', r.status = 'ödendi' and r.payment_method = 'kart'
    and r.payment_reference = 'Paraşüt tahsilat 123' and r.paid_date = d and r.parasut_payment_at is not null, row_to_json(r)::text);
  perform public.parasut_mark_paid(i1,d,'havale',18000,'Paraşüt tahsilat 999');
  perform pg_temp.ok('ödenen Paraşüt faturası otomatik e-Belge adayı olmaz (ikinci kesim yok)',
    not exists (select 1 from public.einvoice_auto_candidates(d, 25) where invoice_id = i1));
  perform pg_temp.ok('zaten ödenmiş fatura değişmez', (select payment_reference from public.invoices where id = i1) = 'Paraşüt tahsilat 123');

  execute 'reset role';
  perform set_config('request.jwt.claims','',true);
  insert into public.invoices(customer_id,amount,issue_date,due_date,status) values(c1,100,d,d,'bekliyor') returning id into i3;
  perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
  execute 'set local role service_role';
  perform pg_temp.ok('Paraşüt bağlantısı olmayan fatura ödendi yapılmaz', pg_temp.fails(format('select public.parasut_mark_paid(%L,%L,%L,%s,%L)',i3,d,'kart',100,'Paraşüt tahsilat 1'),'bağlantısı yok'));
  execute 'reset role';
  perform set_config('request.jwt.claims','',true);

  delete from public.invoices where customer_id in (c1,c2);
  delete from public.contracts where customer_id in (c1,c2);
  delete from public.customers where id in (c1,c2);
end $$;

do $$ declare f text; n int;
begin
  select count(*), string_agg(name, ' | ') filter (where result <> 'PASS') into n, f from _ganu_0017_results;
  if f is not null then raise exception '0017 TEST FAIL: %', f; end if;
  if current_setting('ganu.test_dry_run', true) = 'on' then
    raise exception '0017 DRY-RUN OK: % test PASS; migration dahil tüm değişiklikler geri alındı', n;
  end if;
end $$;
select * from _ganu_0017_results order by result desc, name;
