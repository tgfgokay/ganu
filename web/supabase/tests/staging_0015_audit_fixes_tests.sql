-- 0015 testleri (yalnız staging). Personel bağlamı staff_roles'taki ilk UID ile kurulur (role=authenticated).
-- TEST_0015 satırları sonda silinir; audit_log kayıtları kalır (değiştirilemez).
create temp table _ganu_0015_results(name text,expected text,actual text,result text);
create or replace function pg_temp.ok(p_name text,p_cond boolean,p_actual text default null) returns void language sql as
$$ insert into _ganu_0015_results values(p_name,'true',coalesce(p_actual,p_cond::text),case when p_cond then 'PASS' else 'FAIL' end) $$;
create or replace function pg_temp.fails(p_sql text) returns boolean language plpgsql as
$$ begin execute p_sql; return false; exception when others then return true; end $$;

do $$
declare staff uuid; cid uuid; cid2 uuid; q1 uuid; q2 uuid; q3 uuid; r jsonb; k_old uuid; k_new uuid; inv uuid; st uuid; doc uuid; m uuid;
        n int; d date; b boolean; i int; months_ok boolean := true; km uuid;
begin
 -- Takvim
 perform pg_temp.ok('term_end 09.10.2026+12 = 08.10.2027', public.term_end('2026-10-09',12)='2027-10-08');
 perform pg_temp.ok('term_end 31.01.2026+1 = 28.02.2026', public.term_end('2026-01-31',1)='2026-02-28');
 perform pg_temp.ok('term_end 31.01.2026+12 = 30.01.2027', public.term_end('2026-01-31',12)='2027-01-30');
 perform pg_temp.ok('billing_anchor 31.01 → 28.02, 31.03', public.billing_anchor('2026-01-31',1)='2026-02-28' and public.billing_anchor('2026-01-31',2)='2026-03-31');
 perform pg_temp.ok('term_months 31.01–28.02 = 1, 09.10–08.10 = 12', public.term_months('2026-01-31','2026-02-28')=1 and public.term_months('2026-10-09','2027-10-08')=12);

 select user_id into staff from public.staff_roles limit 1;
 if staff is null then insert into _ganu_0015_results values('personel bağlamı','staff','yok','SKIP'); return; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',staff::text,'role','authenticated')::text,true);

 -- Teklif: gönderim, dondurma, durum geri dönüşü, revizyon
 insert into public.quotes(title,package,billing_period,term_months,list_price,price,valid_until,tax_no)
   values('TEST_0015_A','Başlangıç','yıllık',12,9990,9990,current_date+10,'1111111150') returning id into q1;
 perform pg_temp.ok('kanal boşken gönderildi işaretlenemez', pg_temp.fails(format('select public.mark_quote_sent(%L,null)',q1)));
 perform public.mark_quote_sent(q1,'whatsapp');
 perform pg_temp.ok('gönderilmiş teklifin fiyatı değişmez', pg_temp.fails(format('update public.quotes set price=1 where id=%L',q1)));
 perform pg_temp.ok('gönderildi → taslak geri dönüşü yok', pg_temp.fails(format('update public.quotes set status=''taslak'' where id=%L',q1)));
 perform pg_temp.ok('kabul yalnız dönüştürmeyle', pg_temp.fails(format('update public.quotes set status=''kabul'' where id=%L',q1)));
 insert into public.quotes(title,package,billing_period,term_months,list_price,price,valid_until,replaces_quote_id,tax_no)
   values('TEST_0015_A','Başlangıç','yıllık',12,9990,8991,current_date+10,q1,'1111111150') returning id into q2;
 perform pg_temp.ok('aynı teklife ikinci doğrudan revizyon açılmaz', pg_temp.fails(format('insert into public.quotes(title,package,price,replaces_quote_id) values(''TEST_0015_X'',''Pro'',1,%L)',q1)));
 perform public.mark_quote_sent(q2,'e-posta');
 select superseded_at is not null and status='gönderildi' into b from public.quotes where id=q1;
 perform pg_temp.ok('revizyon gönderilince eski teklif revize edildi (red değil)', b);
 perform pg_temp.ok('revize edilmiş teklif kabul edilemez', pg_temp.fails(format('select public.convert_quote(%L,''{"title":"TEST_0015_A"}'',''{"start_date":"2026-01-31"}'')',q1)));
 insert into public.quotes(title,package,price,valid_until) values('TEST_0015_T','Pro',18990,current_date+5) returning id into q3;
 perform pg_temp.ok('taslak teklif kabul edilemez', pg_temp.fails(format('select public.convert_quote(%L,''{"title":"TEST_0015_T"}'',''{"start_date":"2026-01-31"}'')',q3)));

 -- Dönüştürme: sunucu hesapları, aday müşteri, taslak damga
 r := public.convert_quote(q2,'{"title":"TEST_0015_A","tax_no":"1111111150"}','{"start_date":"2026-10-09","end_date":"2099-01-01","price":1}','{"due_date":"2026-10-10","amount":1}','{"base":1,"payer":"müşteri"}');
 cid := (r->>'customer_id')::uuid; k_old := (r->>'contract_id')::uuid; inv := (r->>'invoice_id')::uuid; st := (r->>'stamp_tax_id')::uuid;
 select status='aday' into b from public.customers where id=cid; perform pg_temp.ok('yeni müşteri aday açılır', b);
 select end_date='2027-10-08' and price=8991 and auto_renew into b from public.contracts where id=k_old; perform pg_temp.ok('bitiş, fiyat sunucuda (istemci yok sayılır)', b);
 select amount=8991 and due_date='2026-10-16' and service_period_start='2026-10-09' and service_period_end='2027-10-08' into b from public.invoices where id=inv;
 perform pg_temp.ok('ilk fatura: tutar, vade +7, hizmet dönemi', b);
 select paper_status='taslak' and doc_date is null and base=7492.5 and amount=71.03 into b from public.stamp_taxes where id=st;
 perform pg_temp.ok('damga taslak, matrah sunucuda 7.492,50', b);
 perform pg_temp.ok('kabul edilen teklife revizyon gönderilemez', pg_temp.fails(format(
   'with x as (insert into public.quotes(title,package,price,valid_until,replaces_quote_id) values(''TEST_0015_R'',''Pro'',1,current_date+3,%L) returning id) select public.mark_quote_sent(id,''elden'') from x',q2)));

 -- Aktivasyon kapısı
 perform pg_temp.ok('imzalı sözleşme yokken aktifleşmez', pg_temp.fails(format('update public.customers set status=''aktif'' where id=%L',cid)));
 insert into public.documents(customer_id,name,type,file_url) values(cid,'TEST_0015 sözleşme.pdf','sozlesme','secure:customers/x.pdf') returning id into doc;
 update public.customers set status='aktif' where id=cid;
 select address_activated_at is not null into b from public.customers where id=cid; perform pg_temp.ok('sözleşme yüklenince aktifleşir, tarih damgalanır', b);

 -- Ödeme kanıtı
 perform pg_temp.ok('kanıtsız ödendi yapılamaz', pg_temp.fails(format('update public.invoices set status=''ödendi'' where id=%L',inv)));
 perform pg_temp.ok('panel kullanıcısı merchant_oid ile ödendi yapamaz', pg_temp.fails(format('update public.invoices set status=''ödendi'',paytr_merchant_oid=''T0015'' where id=%L',inv)));
 perform pg_temp.ok('referanssız elle ödeme reddedilir', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',8991,'' '')',inv)));
 perform pg_temp.ok('eksik tutarla elle ödeme reddedilir', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',100,''REF1'')',inv)));
 perform public.mark_invoice_paid_manual(inv,current_date,'havale',8991,'REF-0015');
 select status='ödendi' and payment_verified_by=staff into b from public.invoices where id=inv; perform pg_temp.ok('elle ödeme kaydı ve doğrulayan', b);
 perform pg_temp.ok('ödenmiş fatura tekrar ödenmez', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',8991,''REF2'')',inv)));

 -- Elle e-belge
 perform pg_temp.ok('e-belge türü boş reddedilir', pg_temp.fails(format('select public.register_manual_einvoice(%L,null,''GAN1'',current_date,''0f8fad5b-d9cb-469f-a165-70867728950e'',''secure:customers/x.pdf'')',inv)));
 perform pg_temp.ok('ETTN biçimi denetlenir', pg_temp.fails(format('select public.register_manual_einvoice(%L,''e-arşiv'',''GAN1'',current_date,''abc'',''secure:customers/x.pdf'')',inv)));
 perform pg_temp.ok('Storage''da olmayan PDF reddedilir', pg_temp.fails(format('select public.register_manual_einvoice(%L,''e-arşiv'',''GAN1'',current_date,''0f8fad5b-d9cb-469f-a165-70867728950e'',''secure:customers/yok-0015.pdf'')',inv)));

 -- Damga vergisi durumları
 perform pg_temp.ok('damga kaydı imzalı açılamaz', pg_temp.fails('insert into public.stamp_taxes(party_title,base,paper_status,doc_date) values(''TEST_0015_D'',100,''imzalı'',current_date)'));
 perform pg_temp.ok('imzalı belge olmadan kesinleşmez', pg_temp.fails(format('update public.stamp_taxes set paper_status=''imzalı'',doc_date=current_date where id=%L',st)));
 perform pg_temp.ok('taslaktan ödendi atlanamaz', pg_temp.fails(format('update public.stamp_taxes set paper_status=''ödendi'',tax_paid_at=current_date where id=%L',st)));
 update public.stamp_taxes set paper_status='imzalı',doc_date=current_date,signed_document_id=doc where id=st;
 perform pg_temp.ok('beyan tarihi olmadan beyan edildi olmaz', pg_temp.fails(format('update public.stamp_taxes set paper_status=''beyan_edildi'' where id=%L',st)));
 update public.stamp_taxes set paper_status='beyan_edildi',filed_at=current_date where id=st;
 perform pg_temp.ok('beyan sonrası matrah değişmez', pg_temp.fails(format('update public.stamp_taxes set base=1 where id=%L',st)));
 perform pg_temp.ok('beyandan taslağa dönülmez', pg_temp.fails(format('update public.stamp_taxes set paper_status=''taslak'' where id=%L',st)));

 -- Tebligat
 insert into public.mail_items(customer_id,type,status) values(cid,'tebligat','geldi') returning id into m;
 perform pg_temp.ok('tebligat imha edilemez', pg_temp.fails(format('update public.mail_items set status=''imha'' where id=%L',m)));
 perform pg_temp.ok('tebligat kanalsız bildirildi olmaz', pg_temp.fails(format('update public.mail_items set status=''bildirildi'' where id=%L',m)));
 update public.mail_items set status='bildirildi',notify_channel='whatsapp' where id=m;
 select notified_at is not null into b from public.mail_items where id=m; perform pg_temp.ok('bildirim zamanı sunucuda damgalanır', b);

 -- Yenileme
 perform pg_temp.ok('yenileme dayanağı boş reddedilir', pg_temp.fails(format('select public.renew_contract(%L,null,8991)',k_old)));
 perform pg_temp.ok('kendiliğinden yenilemede bedel değişmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',89910)',k_old)));
 update public.customers set termination_notice_at=current_date where id=cid;
 perform pg_temp.ok('fesih bildirimi varken kendiliğinden yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_old)));
 update public.customers set termination_notice_at=null where id=cid;
 r := public.renew_contract(k_old,'otomatik_madde',8991); k_new := (r->>'contract_id')::uuid;
 select start_date='2027-10-09' and end_date='2028-10-08' and previous_contract_id=k_old and renewal_basis='otomatik_madde' into b from public.contracts where id=k_new;
 perform pg_temp.ok('yeni dönem eski bitişin ertesi günü', b);
 select start_date='2026-10-09' and end_date='2027-10-08' and price=8991 into b from public.contracts where id=k_old; perform pg_temp.ok('eski dönem değişmedi', b);
 select count(*) into n from public.invoices where contract_id=k_new and service_period_start='2027-10-09'; perform pg_temp.ok('yıllık yenilemede dönem faturası', n=1, n::text);
 select count(*) into n from public.stamp_taxes where contract_id=k_new; perform pg_temp.ok('kendiliğinden yenilemede damga kaydı yok', n=0, n::text);
 perform pg_temp.ok('aynı dönem ikinci kez yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_old)));
 update public.contracts set auto_renew=false where id=k_new;
 perform pg_temp.ok('auto_renew kapalıysa kendiliğinden yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_new)));
 r := public.renew_contract(k_new,'yeni_imza',9990);
 select count(*) into n from public.stamp_taxes where contract_id=(r->>'contract_id')::uuid and paper_status='taslak' and kind='yenileme'; perform pg_temp.ok('yeni imzalı yenilemede taslak damga', n=1, n::text);

 -- Aylık takvim: 31.01 başlangıç, 12 ay → her ay tek dönem
 insert into public.customers(title,status) values('TEST_0015_M','aday') returning id into cid2;
 insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(cid2,'Başlangıç','aylık','2026-01-31',public.term_end('2026-01-31',12),999,'aktif') returning id into km;
 for i in 0..11 loop
   d := (date '2026-01-01' + make_interval(months=>i))::date;
   n := public.prepare_monthly_invoices(d, km);
   if n <> 1 then months_ok := false; end if;
 end loop;
 perform pg_temp.ok('31.01 aylık: her takvim ayına tek fatura (12 ay)', months_ok);
 select count(*) into n from public.invoices i join public.contracts c on c.id=i.contract_id where c.customer_id=cid2; perform pg_temp.ok('toplam 12 dönem', n=12, n::text);
 select bool_and(i.service_period_end = coalesce((select min(j.service_period_start)-1 from public.invoices j where j.contract_id=i.contract_id and j.service_period_start>i.service_period_start), '2027-01-30'))
   into b from public.invoices i join public.contracts c on c.id=i.contract_id where c.customer_id=cid2;
 perform pg_temp.ok('dönemler kesintisiz, son dönem sözleşme bitişinde', b);
 n := public.prepare_monthly_invoices('2026-03-15', km); perform pg_temp.ok('tekrar hazırlamak çift kayıt üretmez', n=0, n::text);

 -- PayTR yolu (service role) hâlâ çalışır
 perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 select id into inv from public.invoices i where i.contract_id in (select id from public.contracts where customer_id=cid2) and status='bekliyor' limit 1;
 update public.invoices set status='ödendi',paid_date=current_date,payment_method='kart',paytr_merchant_oid='T0015PAYTR' where id=inv;
 select status='ödendi' into b from public.invoices where id=inv; perform pg_temp.ok('PayTR (service role) ödeme işler', b);

 -- Temizlik
 perform set_config('request.jwt.claims','',true);
 delete from public.stamp_taxes where customer_id in (cid,cid2) or party_title like 'TEST_0015%';
 delete from public.quotes where title like 'TEST_0015%';
 delete from public.customers where id in (cid,cid2);
end $$;
select * from _ganu_0015_results order by result desc, name;
