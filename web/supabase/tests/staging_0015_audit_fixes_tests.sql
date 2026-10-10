-- 0015 testleri. İşlemler gerçek rollerle koşar: personel = role authenticated + JWT claim (staff_roles'taki ilk UID),
-- PayTR = role service_role. Hata beklenen her senaryoda hata metni de denetlenir (başka bir hata PASS sayılmaz).
-- Sonda herhangi bir FAIL varsa istisna fırlatılır ve tüm işlem geri alınır.
-- Canlı veriyi barındıran projede DENEME (dry-run) olarak çalıştırın: betiğin başına
--   select set_config('ganu.test_dry_run','on',false);
-- ekleyin; testler geçse bile sonda istisna fırlatılır, migration dahil her şey geri alınır (iz kalmaz). Ardından migration tek başına uygulanır.
create temp table _ganu_0015_results(name text,expected text,actual text,result text);
grant all on _ganu_0015_results to authenticated, service_role;
create or replace function pg_temp.ok(p_name text,p_cond boolean,p_actual text default null) returns void language sql as
$$ insert into _ganu_0015_results values(p_name,'true',coalesce(p_actual,coalesce(p_cond::text,'null')),case when p_cond then 'PASS' else 'FAIL' end) $$;
-- Beklenen hata: SQL hata vermeli VE mesajı p_expect'i içermeli.
create or replace function pg_temp.fails(p_sql text,p_expect text) returns boolean language plpgsql as
$$ begin execute p_sql; return false; exception when others then return sqlerrm ilike '%'||p_expect||'%'; end $$;

do $$
declare staff uuid; cid uuid; cx uuid; cm uuid; q1 uuid; q2 uuid; q3 uuid; q4 uuid; q5 uuid; r jsonb; k_old uuid; k_new uuid; k_prep uuid; k_fut uuid; km uuid;
        inv uuid; inv2 uuid; st uuid; doc uuid; docx uuid; docm uuid; fake uuid; m uuid; n int; d date; b boolean; i int; months_ok boolean := true;
begin
 -- Takvim
 perform pg_temp.ok('term_end 09.10.2026+12 = 08.10.2027', public.term_end('2026-10-09',12)='2027-10-08');
 perform pg_temp.ok('term_end 31.01.2026+1 = 28.02.2026', public.term_end('2026-01-31',1)='2026-02-28');
 perform pg_temp.ok('term_end 31.01.2026+12 = 30.01.2027', public.term_end('2026-01-31',12)='2027-01-30');
 perform pg_temp.ok('billing_anchor 31.01 → 28.02, 31.03', public.billing_anchor('2026-01-31',1)='2026-02-28' and public.billing_anchor('2026-01-31',2)='2026-03-31');
 perform pg_temp.ok('term_months 31.01–28.02 = 1, 09.10–08.10 = 12', public.term_months('2026-01-31','2026-02-28')=1 and public.term_months('2026-10-09','2027-10-08')=12);

 select user_id into staff from public.staff_roles limit 1;
 if staff is null then perform pg_temp.ok('personel bağlamı (staff_roles)', false, 'yok'); return; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',staff::text,'role','authenticated','email','test-0015@ganu')::text,true);
 execute 'set local role authenticated';

 -- Teklif: gönderim, dondurma, durum geri dönüşü, revizyon, süre
 insert into public.quotes(title,package,billing_period,term_months,list_price,price,valid_until,tax_no)
   values('TEST_0015_A','Başlangıç','yıllık',12,9990,9990,current_date+10,'1111111150') returning id into q1;
 perform pg_temp.ok('kanal boşken gönderildi işaretlenemez', pg_temp.fails(format('select public.mark_quote_sent(%L,null)',q1),'kanal'));
 perform public.mark_quote_sent(q1,'whatsapp');
 perform pg_temp.ok('gönderilmiş teklifin fiyatı değişmez', pg_temp.fails(format('update public.quotes set price=1 where id=%L',q1),'değiştirilemez'));
 perform pg_temp.ok('gönderildi → taslak geri dönüşü yok', pg_temp.fails(format('update public.quotes set status=''taslak'' where id=%L',q1),'değiştirilemez'));
 perform pg_temp.ok('kabul yalnız dönüştürmeyle', pg_temp.fails(format('update public.quotes set status=''kabul'' where id=%L',q1),'dönüştürülerek'));
 insert into public.quotes(title,package,billing_period,term_months,list_price,price,valid_until,replaces_quote_id,tax_no)
   values('TEST_0015_A','Başlangıç','yıllık',12,9990,8991,current_date+10,q1,'1111111150') returning id into q2;
 perform pg_temp.ok('aynı teklife ikinci doğrudan revizyon açılmaz', pg_temp.fails(format('insert into public.quotes(title,package,price,replaces_quote_id) values(''TEST_0015_X'',''Pro'',1,%L)',q1),'quotes_one_direct_revision'));
 perform public.mark_quote_sent(q2,'e-posta');
 select superseded_at is not null and status='gönderildi' into b from public.quotes where id=q1;
 perform pg_temp.ok('revizyon gönderilince eski teklif revize edildi (red değil)', b);
 perform pg_temp.ok('revize edilmiş teklif kabul edilemez', pg_temp.fails(format('select public.convert_quote(%L,''{"title":"TEST_0015_A"}'',''{"start_date":"2025-01-01"}'')',q1),'revize edilmiş'));
 insert into public.quotes(title,package,price,valid_until) values('TEST_0015_T','Pro',18990,current_date+5) returning id into q3;
 perform pg_temp.ok('taslak teklif kabul edilemez', pg_temp.fails(format('select public.convert_quote(%L,''{"title":"TEST_0015_T"}'',''{"start_date":"2025-01-01"}'')',q3),'gönderilmemiş'));
 insert into public.quotes(title,package,price,valid_until,status) values('TEST_0015_E','Pro',18990,current_date-1,'gönderildi') returning id into q4;
 perform pg_temp.ok('süresi geçmiş teklif kabul edilemez', pg_temp.fails(format('select public.convert_quote(%L,''{"title":"TEST_0015_E"}'',''{"start_date":"2025-01-01"}'')',q4),'süresi geçmiş'));

 -- Dönüştürme: sunucu hesapları, aday müşteri, hazırlık sözleşme, taslak damga
 r := public.convert_quote(q2,'{"title":"TEST_0015_A","tax_no":"1111111150"}','{"start_date":"2025-01-01","end_date":"2099-01-01","price":1}','{"due_date":"2025-01-02","amount":1}','{"base":1,"payer":"müşteri"}');
 cid := (r->>'customer_id')::uuid; k_old := (r->>'contract_id')::uuid; inv := (r->>'invoice_id')::uuid; st := (r->>'stamp_tax_id')::uuid;
 select status='aday' into b from public.customers where id=cid; perform pg_temp.ok('yeni müşteri aday açılır', b);
 select status='hazırlık' and end_date='2025-12-31' and price=8991 and auto_renew into b from public.contracts where id=k_old;
 perform pg_temp.ok('sözleşme hazırlıkta; bitiş ve fiyat sunucuda', b);
 select amount=8991 and due_date='2025-01-08' and service_period_start='2025-01-01' and service_period_end='2025-12-31' into b from public.invoices where id=inv;
 perform pg_temp.ok('ilk fatura: tutar, vade +7, hizmet dönemi', b);
 select paper_status='taslak' and doc_date is null and base=7492.5 and amount=71.03 into b from public.stamp_taxes where id=st;
 perform pg_temp.ok('damga taslak, matrah sunucuda 7.492,50', b);
 insert into public.quotes(title,package,price,valid_until,status) values('TEST_0015_K','Pro',18990,current_date+5,'gönderildi') returning id into q5;
 perform pg_temp.ok('kabul + sözleşme bağı doğrudan yazılamaz', pg_temp.fails(format('update public.quotes set status=''kabul'',contract_id=%L,customer_id=%L where id=%L',k_old,cid,q5),'dönüştürülerek'));
 perform pg_temp.ok('kabul edilen teklife revizyon gönderilemez', pg_temp.fails(format(
   'with x as (insert into public.quotes(title,package,price,valid_until,replaces_quote_id) values(''TEST_0015_R'',''Pro'',1,current_date+3,%L) returning id) select public.mark_quote_sent(id,''elden'') from x',q2),'kabul edilmiş'));

 -- Aktivasyon: yalnız doğrulanmış, müşteriye ait, Storage'da var olan imzalı sözleşmeyle
 perform pg_temp.ok('doğrudan aktif yapılamaz', pg_temp.fails(format('update public.customers set status=''aktif'' where id=%L',cid),'doğrulanarak'));
 insert into public.documents(customer_id,name,type,file_url) values(cid,'TEST_0015 sahte.pdf','sozlesme','secure:customers/'||cid||'/0015-yok.pdf') returning id into fake;
 perform pg_temp.ok('Storage''da olmayan belgeyle aktifleşmez', pg_temp.fails(format('select public.activate_customer(%L,%L,%L)',cid,k_old,fake),'yüklenmemiş'));
 insert into public.customers(title,status) values('TEST_0015_X','aday') returning id into cx;
 insert into storage.objects(bucket_id,name) values('secure-docs','customers/'||cx||'/0015-x.pdf');
 insert into public.documents(customer_id,name,type,file_url) values(cx,'TEST_0015 x.pdf','sozlesme','secure:customers/'||cx||'/0015-x.pdf') returning id into docx;
 perform pg_temp.ok('başka müşterinin belgesiyle aktifleşmez', pg_temp.fails(format('select public.activate_customer(%L,%L,%L)',cid,k_old,docx),'ait değil'));
 insert into storage.objects(bucket_id,name) values('secure-docs','customers/'||cid||'/0015-imzali.pdf');
 insert into public.documents(customer_id,name,type,file_url) values(cid,'TEST_0015 imzalı.pdf','sozlesme','secure:customers/'||cid||'/0015-imzali.pdf') returning id into doc;
 perform pg_temp.ok('hazırlık sözleşme elle aktif yapılamaz', pg_temp.fails(format('update public.contracts set status=''aktif'' where id=%L',k_old),'İmzalı sözleşmeyi doğrula'));
 perform pg_temp.ok('imza doğrulaması elle yazılamaz', pg_temp.fails(format('update public.contracts set signed_document_id=%L,signed_verified_at=now() where id=%L',doc,k_old),'İmzalı sözleşmeyi doğrula'));
 perform pg_temp.ok('yenileme bağı elle yazılamaz', pg_temp.fails(format('insert into public.contracts(customer_id,start_date,end_date,previous_contract_id,renewal_basis) values(%L,current_date,current_date+1,%L,''yeni_imza'')',cid,k_old),'İmzalı sözleşmeyi doğrula'));
 perform public.activate_customer(cid,k_old,doc);
 select c.status='aktif' and c.address_activated_at is not null and k.status='aktif' and k.signed_document_id=doc and k.signed_verified_at is not null
   into b from public.customers c join public.contracts k on k.customer_id=c.id where c.id=cid and k.id=k_old;
 perform pg_temp.ok('doğrulanmış imzayla müşteri ve sözleşme aktif', b);

 -- Ödeme kanıtı
 perform pg_temp.ok('kanıtsız ödendi yapılamaz', pg_temp.fails(format('update public.invoices set status=''ödendi'' where id=%L',inv),'kanıtı'));
 perform pg_temp.ok('panel kullanıcısı merchant_oid ile ödendi yapamaz', pg_temp.fails(format('update public.invoices set status=''ödendi'',paytr_merchant_oid=''T0015'' where id=%L',inv),'kanıtı'));
 perform pg_temp.ok('referans + doğrulayan elle yazılarak ödendi yapılamaz', pg_temp.fails(format('update public.invoices set status=''ödendi'',payment_reference=''X'',payment_verified_by=%L where id=%L',staff,inv),'kanıtı'));
 perform pg_temp.ok('referanssız elle ödeme reddedilir', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',8991,'' '')',inv),'referans'));
 perform pg_temp.ok('eksik tutarla elle ödeme reddedilir', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',100,''REF1'')',inv),'Tutar'));
 perform public.mark_invoice_paid_manual(inv,current_date,'havale',8991,'REF-0015');
 select status='ödendi' and payment_verified_by=staff into b from public.invoices where id=inv; perform pg_temp.ok('elle ödeme kaydı ve doğrulayan', b);
 perform pg_temp.ok('ödenmiş fatura tekrar ödenmez', pg_temp.fails(format('select public.mark_invoice_paid_manual(%L,current_date,''havale'',8991,''REF2'')',inv),'zaten ödendi'));

 -- Elle e-belge
 perform pg_temp.ok('kesildi doğrudan yazılamaz', pg_temp.fails(format('update public.invoices set einvoice_status=''kesildi'',einvoice_no=''GANX'' where id=%L',inv),'Elle kesildi'));
 perform pg_temp.ok('e-belge türü boş reddedilir', pg_temp.fails(format('select public.register_manual_einvoice(%L,null,''GAN1'',current_date,''0f8fad5b-d9cb-469f-a165-70867728950e'',''secure:customers/x.pdf'')',inv),'Belge türü'));
 perform pg_temp.ok('ETTN biçimi denetlenir', pg_temp.fails(format('select public.register_manual_einvoice(%L,''e-arşiv'',''GAN1'',current_date,''abc'',''secure:customers/x.pdf'')',inv),'ETTN'));
 perform pg_temp.ok('Storage''da olmayan PDF reddedilir', pg_temp.fails(format('select public.register_manual_einvoice(%L,''e-arşiv'',''GAN1'',current_date,''0f8fad5b-d9cb-469f-a165-70867728950e'',''secure:customers/%s/0015-yok-e.pdf'')',inv,cid),'PDF'));
 insert into storage.objects(bucket_id,name) values('secure-docs','customers/'||cid||'/0015-e.pdf');
 perform public.register_manual_einvoice(inv,'e-arşiv','GAN0015000000001',current_date,'0F8FAD5B-D9CB-469F-A165-70867728950E','secure:customers/'||cid||'/0015-e.pdf');
 select einvoice_status='kesildi' and einvoice_uuid='0f8fad5b-d9cb-469f-a165-70867728950e' and einvoice_verified_by=staff into b from public.invoices where id=inv;
 perform pg_temp.ok('geçerli belgeyle elle e-belge kaydı', b);
 insert into public.invoices(customer_id,amount) values(cid,10) returning id into inv2;
 perform pg_temp.ok('aynı ETTN ikinci faturaya bağlanamaz', pg_temp.fails(format('select public.register_manual_einvoice(%L,''e-arşiv'',''GAN0015000000002'',current_date,''0f8fad5b-d9cb-469f-a165-70867728950e'',''secure:customers/%s/0015-e.pdf'')',inv2,cid),'invoices_einvoice_uuid_unique'));

 -- Damga vergisi durumları
 perform pg_temp.ok('damga kaydı imzalı açılamaz', pg_temp.fails('insert into public.stamp_taxes(party_title,base,paper_status,doc_date) values(''TEST_0015_D'',100,''imzalı'',current_date)','taslak açılır'));
 perform pg_temp.ok('imzalı belge olmadan kesinleşmez', pg_temp.fails(format('update public.stamp_taxes set paper_status=''imzalı'',doc_date=current_date where id=%L',st),'imzalı sözleşme belgesi'));
 perform pg_temp.ok('başka müşterinin belgesiyle kesinleşmez', pg_temp.fails(format('update public.stamp_taxes set paper_status=''imzalı'',doc_date=current_date,signed_document_id=%L where id=%L',docx,st),'imzalı sözleşme belgesi'));
 perform pg_temp.ok('taslaktan ödendi atlanamaz', pg_temp.fails(format('update public.stamp_taxes set paper_status=''ödendi'',tax_paid_at=current_date where id=%L',st),'değiştirilemez'));
 update public.stamp_taxes set paper_status='imzalı',doc_date=current_date,signed_document_id=doc where id=st;
 perform pg_temp.ok('beyan tarihi olmadan beyan edildi olmaz', pg_temp.fails(format('update public.stamp_taxes set paper_status=''beyan_edildi'' where id=%L',st),'Beyan tarihi'));
 update public.stamp_taxes set paper_status='beyan_edildi',filed_at=current_date where id=st;
 perform pg_temp.ok('beyan sonrası matrah değişmez', pg_temp.fails(format('update public.stamp_taxes set base=1 where id=%L',st),'Beyan edilmiş'));
 perform pg_temp.ok('beyandan taslağa dönülmez', pg_temp.fails(format('update public.stamp_taxes set paper_status=''taslak'' where id=%L',st),'değiştirilemez'));

 -- Tebligat
 insert into public.mail_items(customer_id,type,status) values(cid,'tebligat','geldi') returning id into m;
 perform pg_temp.ok('tebligat imha edilemez', pg_temp.fails(format('update public.mail_items set status=''imha'' where id=%L',m),'mail_items_tebligat_not_destroyed'));
 perform pg_temp.ok('tebligat kanalsız bildirildi olmaz', pg_temp.fails(format('update public.mail_items set status=''bildirildi'' where id=%L',m),'kanal zorunlu'));
 update public.mail_items set status='bildirildi',notify_channel='whatsapp' where id=m;
 select notified_at is not null into b from public.mail_items where id=m; perform pg_temp.ok('bildirim zamanı sunucuda damgalanır', b);

 -- Yenileme
 perform pg_temp.ok('yenileme dayanağı boş reddedilir', pg_temp.fails(format('select public.renew_contract(%L,null,8991)',k_old),'dayanağı'));
 insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(cid,'Pro','yıllık','2025-06-01','2026-05-31',18990,'hazırlık') returning id into k_prep;
 perform pg_temp.ok('imzası doğrulanmamış sözleşme yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',18990)',k_prep),'imzası doğrulanmış'));
 insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status,auto_renew) values(cid,'Pro','yıllık',current_date,public.term_end(current_date,12),18990,'hazırlık',true) returning id into k_fut;
 perform public.activate_customer(cid,k_fut,doc);
 perform pg_temp.ok('bitişe süre varken kendiliğinden yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',18990)',k_fut),'bittiği gün'));
 perform pg_temp.ok('kendiliğinden yenilemede bedel değişmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',89910)',k_old),'bedel değişmez'));
 update public.customers set termination_notice_at=current_date where id=cid;
 perform pg_temp.ok('fesih bildirimi varken kendiliğinden yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_old),'fesih'));
 update public.customers set termination_notice_at=null where id=cid;
 r := public.renew_contract(k_old,'otomatik_madde',8991); k_new := (r->>'contract_id')::uuid;
 select start_date='2026-01-01' and end_date='2026-12-31' and previous_contract_id=k_old and renewal_basis='otomatik_madde' and status='aktif' and signed_verified_at is not null
   into b from public.contracts where id=k_new;
 perform pg_temp.ok('yeni dönem eski bitişin ertesi günü, aktif', b);
 select start_date='2025-01-01' and end_date='2025-12-31' and price=8991 into b from public.contracts where id=k_old; perform pg_temp.ok('eski dönem değişmedi', b);
 select count(*) into n from public.invoices where contract_id=k_new and service_period_start='2026-01-01'; perform pg_temp.ok('yıllık yenilemede dönem faturası', n=1, n::text);
 select count(*) into n from public.stamp_taxes where contract_id=k_new; perform pg_temp.ok('kendiliğinden yenilemede damga kaydı yok', n=0, n::text);
 perform pg_temp.ok('aynı dönem ikinci kez yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_old),'zaten yenilenmiş'));
 update public.contracts set auto_renew=false where id=k_new;
 perform pg_temp.ok('auto_renew kapalıysa kendiliğinden yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''otomatik_madde'',8991)',k_new),'açık değil'));
 perform pg_temp.ok('yeni imza belgesiz yenilenmez', pg_temp.fails(format('select public.renew_contract(%L,''yeni_imza'',9990)',k_new),'imzalı sözleşme belgesi'));
 r := public.renew_contract(k_new,'yeni_imza',9990,null,12,doc);
 select count(*) into n from public.stamp_taxes where contract_id=(r->>'contract_id')::uuid and paper_status='taslak' and kind='yenileme'; perform pg_temp.ok('yeni imzalı yenilemede taslak damga', n=1, n::text);

 -- Aylık takvim: imzasız → fatura yok; doğrulanınca 31.01 başlangıç, 12 ay → her ay tek dönem
 insert into public.customers(title,status) values('TEST_0015_M','aday') returning id into cm;
 insert into public.contracts(customer_id,package,billing_period,start_date,end_date,price,status) values(cm,'Başlangıç','aylık','2026-01-31',public.term_end('2026-01-31',12),999,'hazırlık') returning id into km;
 n := public.prepare_monthly_invoices('2026-02-01', km); perform pg_temp.ok('imzasız sözleşmeye aylık fatura hazırlanmaz', n=0, n::text);
 insert into storage.objects(bucket_id,name) values('secure-docs','customers/'||cm||'/0015-m.pdf');
 insert into public.documents(customer_id,name,type,file_url) values(cm,'TEST_0015 m.pdf','sozlesme','secure:customers/'||cm||'/0015-m.pdf') returning id into docm;
 perform public.activate_customer(cm,km,docm);
 for i in 0..11 loop
   d := (date '2026-01-01' + make_interval(months=>i))::date;
   n := public.prepare_monthly_invoices(d, km);
   if n <> 1 then months_ok := false; end if;
 end loop;
 perform pg_temp.ok('31.01 aylık: her takvim ayına tek fatura (12 ay)', months_ok);
 select count(*) into n from public.invoices where contract_id=km; perform pg_temp.ok('toplam 12 dönem', n=12, n::text);
 select bool_and(i.service_period_end = coalesce((select min(j.service_period_start)-1 from public.invoices j where j.contract_id=i.contract_id and j.service_period_start>i.service_period_start), '2027-01-30'))
   into b from public.invoices i where i.contract_id=km;
 perform pg_temp.ok('dönemler kesintisiz, son dönem sözleşme bitişinde', b);
 n := public.prepare_monthly_invoices('2026-03-15', km); perform pg_temp.ok('tekrar hazırlamak çift kayıt üretmez', n=0, n::text);

 -- PayTR yolu (service role) çalışır
 select id into inv from public.invoices where contract_id=km and status='bekliyor' order by service_period_start limit 1;
 perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
 execute 'set local role service_role';
 update public.invoices set status='ödendi',paid_date=current_date,payment_method='kart',paytr_merchant_oid='T0015PAYTR' where id=inv;
 select status='ödendi' into b from public.invoices where id=inv; perform pg_temp.ok('PayTR (service role) ödeme işler', b);

 -- Temizlik (dry-run'da zaten tümü geri alınır)
 execute 'reset role';
 perform set_config('request.jwt.claims','',true);
 delete from public.stamp_taxes where customer_id in (cid,cx,cm) or party_title like 'TEST_0015%';
 delete from public.quotes where title like 'TEST_0015%';
 delete from public.customers where id in (cid,cx,cm);
 -- Supabase Storage doğrudan silmeyi engelleyebilir (storage.protect_delete); temizlik testin sonucunu değiştirmez.
 begin
   delete from storage.objects where bucket_id='secure-docs' and name like 'customers/%/0015-%' and (name like 'customers/'||cid||'/%' or name like 'customers/'||cx||'/%' or name like 'customers/'||cm||'/%');
 exception when others then raise notice 'storage temizliği atlandı: %', sqlerrm;
 end;
end $$;

do $$ declare f text; n int;
begin
  select count(*), string_agg(name, ' | ') filter (where result <> 'PASS') into n, f from _ganu_0015_results;
  if f is not null then raise exception '0015 TEST FAIL: %', f; end if;
  if current_setting('ganu.test_dry_run', true) = 'on' then
    raise exception '0015 DRY-RUN OK: % test PASS; migration dahil tüm değişiklikler geri alındı', n;
  end if;
end $$;
select * from _ganu_0015_results order by result desc, name;
