create temp table _ganu_0014_results(name text,expected text,actual text,result text);
-- Tüm veri değişiklikleri sonda geri alınır (şablon tablosu silinemez olduğu için); sonuçlar değişkende taşınır.
do $$ declare r jsonb:='[]';b boolean;s text;j jsonb;cid uuid;qid uuid;q2 uuid;q3 uuid;iid uuid;conid uuid;
 tok text:=repeat('a',64);otp text:=repeat('b',64);sha text:=encode(sha256(convert_to('metin','UTF8')),'hex');e1 date:=(current_date+interval '1 year')::date-1;body text:=repeat('Sözleşme metni {{musteri_unvan}}. ',20);
begin
 begin
 -- yetkiler
 b:=has_function_privilege('authenticated','public.quote_accept(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date)','EXECUTE')
   or has_function_privilege('anon','public.quote_accept(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date)','EXECUTE')
   or has_function_privilege('authenticated','public.quote_try_activate(uuid)','EXECUTE') or has_function_privilege('anon','public.quote_issue_otp(uuid,text,text,text)','EXECUTE')
   or has_function_privilege('authenticated','public.quote_cancel(uuid,boolean)','EXECUTE') or has_function_privilege('authenticated','public.quote_rotate_token(uuid,text,text)','EXECUTE');
 r:=r||jsonb_build_array(jsonb_build_array('teklif RPC anon/auth kapalı','false',b::text,case when not b then 'PASS' else 'FAIL' end));
 b:=has_function_privilege('service_role','public.quote_accept(uuid,text,text,text,text,text,text,jsonb,jsonb,date,date)','EXECUTE');
 r:=r||jsonb_build_array(jsonb_build_array('quote_accept service-role','true',b::text,case when b then 'PASS' else 'FAIL' end));
 b:=has_table_privilege('authenticated','public.quotes','UPDATE') or has_table_privilege('authenticated','public.quotes','INSERT');
 r:=r||jsonb_build_array(jsonb_build_array('quotes personel yazamaz','false',b::text,case when not b then 'PASS' else 'FAIL' end));

 -- şablon
 update public.contract_templates set active=false where active;
 insert into public.customers(title,email,status) values('TEST_0014','t0014@example.com','aday') returning id into cid;
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status)
  values(public.quote_next_no(),cid,'şahıs','Pro',18990,17091,current_date+10,'taslak') returning id into qid;
 s:=public.quote_rotate_token(qid,tok,'t0014@example.com');
 r:=r||jsonb_build_array(jsonb_build_array('şablon yokken gönderilmez','şablon',s,case when s='şablon' then 'PASS' else 'FAIL' end));
 insert into public.contract_templates(version,title,body_md,sha256,active) values('T0014.v1','Test',body,repeat('0',64),true);
 select sha256=encode(sha256(convert_to(body,'UTF8')),'hex') into b from public.contract_templates where version='T0014.v1';
 r:=r||jsonb_build_array(jsonb_build_array('şablon özeti sunucuda hesaplanır','true',b::text,case when b then 'PASS' else 'FAIL' end));
 begin update public.contract_templates set body_md=body||'x' where version='T0014.v1'; s:='değişti'; exception when others then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('şablon metni değiştirilemez','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));

 -- gönderim
 s:=public.quote_rotate_token(qid,tok,'t0014@example.com');
 select s='ok' and template_version='T0014.v1' and status='gönderildi' and send_count=1 into b from public.quotes where id=qid;
 r:=r||jsonb_build_array(jsonb_build_array('gönderimde şablon sabitlenir','true',b::text,case when b then 'PASS' else 'FAIL' end));
 s:=public.quote_rotate_token(qid,repeat('9',64),'t0014@example.com');
 r:=r||jsonb_build_array(jsonb_build_array('30 sn içinde ikinci gönderim','çok_sık',s,case when s='çok_sık' then 'PASS' else 'FAIL' end));

 -- kod üretimi
 s:=public.quote_issue_otp(qid,repeat('f',64),otp,sha);
 r:=r||jsonb_build_array(jsonb_build_array('başka token ile kod üretilmez','geçersiz',s,case when s='geçersiz' then 'PASS' else 'FAIL' end));
 s:=public.quote_issue_otp(qid,tok,otp,sha);
 r:=r||jsonb_build_array(jsonb_build_array('kod üretimi','ok',s,case when s='ok' then 'PASS' else 'FAIL' end));
 s:=public.quote_issue_otp(qid,tok,otp,sha);
 r:=r||jsonb_build_array(jsonb_build_array('60 sn bekleme','bekle',s,case when s='bekle' then 'PASS' else 'FAIL' end));
 update public.quotes set otp_sent_count=5,otp_last_sent_at=now()-interval '2 minutes' where id=qid;
 s:=public.quote_issue_otp(qid,tok,otp,sha);
 r:=r||jsonb_build_array(jsonb_build_array('teklif başına 5 kod','limit',s,case when s='limit' then 'PASS' else 'FAIL' end));

 -- kabul
 j:=public.quote_accept(qid,tok,repeat('c',64),'T0014.v1','metin',sha,'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('hatalı kod','hatalı',j->>'state',case when j->>'state'='hatalı' and (select otp_attempts from public.quotes where id=qid)=1 then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(qid,tok,otp,'T0014.v1','başka metin',encode(sha256(convert_to('başka metin','UTF8')),'hex'),'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('kod başka metinle kullanılamaz','metin',j->>'state',case when j->>'state'='metin' then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(qid,repeat('f',64),otp,'T0014.v1','metin',sha,'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('yanlış token ile kabul','geçersiz',j->>'state',case when j->>'state'='geçersiz' then 'PASS' else 'FAIL' end));
 update public.quotes set otp_attempts=5 where id=qid;
 j:=public.quote_accept(qid,tok,otp,'T0014.v1','metin',sha,'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('5 hatadan sonra kilit','kilit',j->>'state',case when j->>'state'='kilit' then 'PASS' else 'FAIL' end));
 update public.quotes set otp_attempts=0 where id=qid;
 j:=public.quote_accept(qid,tok,otp,'T0014.v1','metin',sha,'otp_email','{"m":1}','{"tc":"10000000146","address":"Kavacık","city":"İstanbul","district":"Beykoz"}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('kabul','kabul',j->>'state',case when j->>'state'='kabul' then 'PASS' else 'FAIL' end));
 iid:=(j->>'invoice_id')::uuid; conid:=(j->>'contract_id')::uuid;
 select i.quote_id=qid and i.amount=17091 and i.status='bekliyor' and c.quote_id=qid and c.status='bekliyor' and c.end_date=e1
   into b from public.invoices i, public.contracts c where i.id=iid and c.id=conid;
 r:=r||jsonb_build_array(jsonb_build_array('kabulde tahsilat + sözleşme satırı','true',coalesce(b,false)::text,case when b then 'PASS' else 'FAIL' end));
 select c.tc='10000000146' and q.accepted_party->>'tc'='10000000146' and q.otp_hash is null into b from public.customers c, public.quotes q where c.id=cid and q.id=qid;
 r:=r||jsonb_build_array(jsonb_build_array('taraf bilgisi + değişmez kopya, kod tüketildi','true',b::text,case when b then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(qid,tok,otp,'T0014.v1','metin',sha,'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('ikinci kabul yeni kayıt açmaz','zaten',j->>'state',case when j->>'state'='zaten' and (select count(*) from public.invoices where quote_id=qid)=1 then 'PASS' else 'FAIL' end));

 -- aktivasyon
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('ödemesiz aktivasyon yok','eksik',j->>'state',case when j->>'state'='eksik' and j->'missing' ? 'ödeme' and j->'missing' ? 'adres_belgesi' then 'PASS' else 'FAIL' end));
 update public.invoices set paytr_link_id='L0014' where id=iid;
 j:=public.quote_cancel(qid,false);
 r:=r||jsonb_build_array(jsonb_build_array('kart linki varken iptal onay ister','link_var',j->>'state',case when j->>'state'='link_var' then 'PASS' else 'FAIL' end));
 s:=public.paytr_mark_paid(iid,'OID0014',17091,current_date);
 j:=public.quote_cancel(qid,true);
 r:=r||jsonb_build_array(jsonb_build_array('ödenmiş teklif iptal edilmez','ödenmiş',j->>'state',case when j->>'state'='ödenmiş' then 'PASS' else 'FAIL' end));
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('adres belgesi beklenir','eksik',j->>'state',case when j->>'state'='eksik' and not (j->'missing' ? 'ödeme') then 'PASS' else 'FAIL' end));
 begin update public.quotes set address_doc='gerekmiyor' where id=qid; s:='geçti'; exception when check_violation then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('gerekmiyor gerekçesiz olmaz','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));
 update public.quotes set address_doc='gerekmiyor',address_doc_note='Şube adresi değil, posta hizmeti' where id=qid;
 update public.customers set status='askıda' where id=cid;
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('askıdaki müşteri aktiflenmez','eksik',j->>'state',case when j->>'state'='eksik' and j->'missing' ? 'müşteri_durumu' and (select activated_at is null from public.quotes where id=qid) then 'PASS' else 'FAIL' end));
 update public.customers set status='aday' where id=cid;
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('aktivasyon','aktif',j->>'state',case when j->>'state'='aktif' then 'PASS' else 'FAIL' end));
 select c.status='aktif' and k.status='aktif' into b from public.customers c, public.contracts k where c.id=cid and k.id=conid;
 r:=r||jsonb_build_array(jsonb_build_array('müşteri ve sözleşme aktif','true',b::text,case when b then 'PASS' else 'FAIL' end));
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('aktivasyon tekrar çağrılabilir','zaten',j->>'state',case when j->>'state'='zaten' then 'PASS' else 'FAIL' end));

 -- iptal: kabul edilmiş, ödenmemiş, linksiz → fatura silinir, sözleşme iptal
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status,token_hash,template_version)
  values(public.quote_next_no(),cid,'şahıs','Başlangıç',9990,9990,current_date+5,'gönderildi',repeat('7',64),'T0014.v1') returning id into q3;
 j:=public.quote_accept(q3,null,null,'T0014.v1','metin',sha,'ıslak_imza','{"m":2}','{}',current_date,e1);
 iid:=(j->>'invoice_id')::uuid; conid:=(j->>'contract_id')::uuid;
 j:=public.quote_cancel(q3,false);
 select j->>'state'='iptal' and not exists(select 1 from public.invoices where id=iid) and (select status from public.contracts where id=conid)='iptal' into b;
 r:=r||jsonb_build_array(jsonb_build_array('ıslak imza kabulü + iptal temizliği','true',b::text,case when b then 'PASS' else 'FAIL' end));

 -- süresi dolmuş / kanıtsız kabul
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status,token_hash,template_version,otp_hash,otp_expires_at,otp_pending_sha)
  values(public.quote_next_no(),cid,'şahıs','Başlangıç',9990,9990,current_date-1,'gönderildi',repeat('e',64),'T0014.v1',otp,now()+interval '5 minutes',sha) returning id into q2;
 j:=public.quote_accept(q2,repeat('e',64),otp,'T0014.v1','metin',sha,'otp_email','{"m":1}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('süresi dolmuş teklif kabul edilmez','süresi_doldu',j->>'state',case when j->>'state'='süresi_doldu' then 'PASS' else 'FAIL' end));
 begin update public.quotes set status='kabul' where id=q2; s:='geçti'; exception when check_violation then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('kanıtsız kabul yazılamaz','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));

 -- özet metinle uyuşmazsa kabul yok
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status,token_hash,template_version)
  values(public.quote_next_no(),cid,'şahıs','Başlangıç',9990,9990,current_date+5,'gönderildi',repeat('6',64),'T0014.v1') returning id into q3;
 j:=public.quote_accept(q3,null,null,'T0014.v1','metin',repeat('d',64),'ıslak_imza','{"m":3}','{}',current_date,e1);
 r:=r||jsonb_build_array(jsonb_build_array('metin/özet uyuşmazlığı reddedilir','geçersiz',j->>'state',case when j->>'state'='geçersiz' then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(q3,null,null,'T0014.v1','metin',sha,'ıslak_imza','{"m":3}','{}',current_date,current_date+30);
 r:=r||jsonb_build_array(jsonb_build_array('yanlış bitiş tarihi reddedilir','geçersiz',j->>'state',case when j->>'state'='geçersiz' then 'PASS' else 'FAIL' end));
 -- kart linki verilmiş teklif zorla iptal: fatura silinmez, inceleme notu düşer; geç ödeme incelemeye gider
 j:=public.quote_accept(q3,null,null,'T0014.v1','metin',sha,'ıslak_imza','{"m":3}','{}',current_date,e1);
 iid:=(j->>'invoice_id')::uuid;
 update public.invoices set paytr_link_id='L0014B' where id=iid;
 j:=public.quote_cancel(q3,true);
 select j->>'state'='iptal' and exists(select 1 from public.invoices where id=iid and payment_review like '%iade/inceleme%' and note like 'İPTAL%') into b;
 r:=r||jsonb_build_array(jsonb_build_array('linkli zorla iptal faturayı korur','true',b::text,case when b then 'PASS' else 'FAIL' end));

 select not exists(select 1 from public.audit_log where table_name='quotes' and (changes ? 'token_hash' or changes ? 'otp_hash' or changes ? 'contract_text' or changes ? 'accepted_party' or changes ? 'acceptance_evidence')) into b;
 r:=r||jsonb_build_array(jsonb_build_array('işlem kaydına kişisel/gizli alan yazılmaz','true',b::text,case when b then 'PASS' else 'FAIL' end));

 raise exception using errcode='P0001', message='ganu-0014-rollback';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'ganu-0014-rollback' then raise; end if;
 end;
 insert into _ganu_0014_results select x->>0,x->>1,x->>2,x->>3 from jsonb_array_elements(r) x;
end $$;
select * from _ganu_0014_results order by name;
