-- 0016 testleri: einvoice_auto_candidates yalnız güvenli faturaları seçer; panel kullanıcısı fonksiyonu çağıramaz.
-- Sonda FAIL varsa istisna fırlatılır ve işlem geri alınır. Canlıda DENEME için betiğin başına
--   select set_config('ganu.test_dry_run','on',false);
-- ekleyin; testler geçse bile sonda istisna fırlatılır, migration dahil her şey geri alınır.
create temp table _ganu_0016_results(name text,result text,actual text);
create or replace function pg_temp.ok(p_name text,p_cond boolean,p_actual text default null) returns void language sql as
$$ insert into _ganu_0016_results values(p_name,case when p_cond then 'PASS' else 'FAIL' end,coalesce(p_actual,coalesce(p_cond::text,'null'))) $$;

do $$
declare d date := (now() at time zone 'Europe/Istanbul')::date; c_ok uuid; c_eksik uuid; c_sahis uuid; k uuid;
        i_paid uuid; i_unpaid uuid; i_old uuid; i_failed uuid; i_eksik uuid; i_sahis uuid; i_done uuid; ids uuid[]; err text;
        v uuid := '00000000-0000-0000-0000-000000000016';
begin
  insert into public.customers(title,status,tax_no,tax_office,address,city,district,email)
    values('TEST_0016_TAM','aday','1111111160','Beykoz','Kavacık Mah.','İstanbul','Beykoz','t0016@example.com') returning id into c_ok;
  insert into public.customers(title,status,tax_no,address,city,district) values('TEST_0016_EKSIK','aktif','1111111161','Kavacık','İstanbul','Beykoz') returning id into c_eksik;
  insert into public.customers(title,status,tc,address,city,district,email)
    values('TEST_0016_SAHIS','aday','11111111110','Kavacık','İstanbul','Beykoz','s0016@example.com') returning id into c_sahis;
  insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(c_ok,'Pro','yıllık',d,d+364,18990,'hazırlık') returning id into k;

  insert into public.invoices(customer_id,contract_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method)
    values(c_ok,k,18990,d,d+7,'ödendi','REF-0016-1',v,d,'havale') returning id into i_paid;
  insert into public.invoices(customer_id,contract_id,amount,issue_date,due_date,status) values(c_ok,k,18990,d,d+7,'bekliyor') returning id into i_unpaid;
  insert into public.invoices(customer_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method)
    values(c_ok,100,d-20,d-13,'ödendi','REF-0016-2',v,d-10,'havale') returning id into i_old;
  insert into public.invoices(customer_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method,einvoice_status,einvoice_error)
    values(c_ok,100,d,d+7,'ödendi','REF-0016-3',v,d,'havale','başarısız','test') returning id into i_failed;
  insert into public.invoices(customer_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method)
    values(c_eksik,100,d,d+7,'ödendi','REF-0016-4',v,d,'havale') returning id into i_eksik;
  insert into public.invoices(customer_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method)
    values(c_sahis,100,d-1,d+6,'ödendi','REF-0016-5',v,d-1,'kart') returning id into i_sahis;
  insert into public.invoices(customer_id,amount,issue_date,due_date,status,payment_reference,payment_verified_by,paid_date,payment_method,parasut_invoice_id,einvoice_status)
    values(c_ok,100,d,d+7,'ödendi','REF-0016-6',v,d,'havale','999','kesildi') returning id into i_done;

  select array_agg(invoice_id) into ids from public.einvoice_auto_candidates(d, 25);
  ids := coalesce(ids, '{}');
  perform pg_temp.ok('ödenmiş, bilgileri tam fatura seçilir (imza/aktiflik beklenmez)', i_paid = any(ids));
  perform pg_temp.ok('şahıs (TCKN, vergi dairesi yok) seçilir', i_sahis = any(ids));
  perform pg_temp.ok('ödenmemiş fatura seçilmez', not (i_unpaid = any(ids)));
  perform pg_temp.ok('7 günden eski ödeme seçilmez', not (i_old = any(ids)));
  perform pg_temp.ok('başarısız denenmiş fatura insan kontrolü bekler', not (i_failed = any(ids)));
  perform pg_temp.ok('bilgisi eksik müşteri (vergi dairesi/e-posta) seçilmez', not (i_eksik = any(ids)));
  perform pg_temp.ok('kesilmiş fatura tekrar seçilmez', not (i_done = any(ids)));
  perform pg_temp.ok('sıra: eski ödeme önce', array_position(ids, i_sahis) < array_position(ids, i_paid));
  perform pg_temp.ok('limit uygulanır', (select count(*) from public.einvoice_auto_candidates(d, 1)) = 1);

  begin
    execute 'set local role authenticated';
    perform * from public.einvoice_auto_candidates(d, 1);
    err := 'izin verildi';
  exception when insufficient_privilege then err := 'reddedildi';
  end;
  execute 'reset role';
  perform pg_temp.ok('panel kullanıcısı aday listesini çağıramaz', err = 'reddedildi', err);

  delete from public.invoices where customer_id in (c_ok,c_eksik,c_sahis);
  delete from public.contracts where customer_id in (c_ok,c_eksik,c_sahis);
  delete from public.customers where id in (c_ok,c_eksik,c_sahis);
end $$;

do $$ declare f text; n int;
begin
  select count(*), string_agg(name, ' | ') filter (where result <> 'PASS') into n, f from _ganu_0016_results;
  if f is not null then raise exception '0016 TEST FAIL: %', f; end if;
  if current_setting('ganu.test_dry_run', true) = 'on' then
    raise exception '0016 DRY-RUN OK: % test PASS; migration dahil tüm değişiklikler geri alındı', n;
  end if;
end $$;
select * from _ganu_0016_results order by result desc, name;
