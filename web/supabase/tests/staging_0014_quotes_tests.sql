create temp table _ganu_0014_results(name text,expected text,actual text,result text);
-- Tüm veri değişiklikleri sonda geri alınır (şablon tablosu silinemez olduğu için); sonuçlar değişkende taşınır.
do $$ declare r jsonb:='[]';b boolean;s text;j jsonb;cid uuid;qid uuid;q2 uuid;iid uuid;conid uuid;tok text:=repeat('a',64);body text:=repeat('Sözleşme metni {{musteri_unvan}}. ',20);
begin
 begin
 -- yetkiler
 b:=has_function_privilege('authenticated','public.quote_accept(uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','public.quote_accept(uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','public.quote_try_activate(uuid)','EXECUTE') or has_function_privilege('anon','public.quote_otp_check(uuid,text,text)','EXECUTE');
 r:=r||jsonb_build_array(jsonb_build_array('teklif RPC anon/auth kapalı','false',b::text,case when not b then 'PASS' else 'FAIL' end));
 b:=has_function_privilege('service_role','public.quote_accept(uuid,text,text,text,text,text,jsonb,jsonb)','EXECUTE');
 r:=r||jsonb_build_array(jsonb_build_array('quote_accept service-role','true',b::text,case when b then 'PASS' else 'FAIL' end));
 b:=has_table_privilege('authenticated','public.quotes','UPDATE') or has_table_privilege('authenticated','public.quotes','INSERT');
 r:=r||jsonb_build_array(jsonb_build_array('quotes personel yazamaz','false',b::text,case when not b then 'PASS' else 'FAIL' end));

 -- şablon: özet sunucuda, metin değişmez
 update public.contract_templates set active=false where active;
 insert into public.contract_templates(version,title,body_md,sha256,active) values('T0014.v1','Test',body,repeat('0',64),true);
 select sha256=encode(sha256(convert_to(body,'UTF8')),'hex') into b from public.contract_templates where version='T0014.v1';
 r:=r||jsonb_build_array(jsonb_build_array('şablon özeti sunucuda hesaplanır','true',b::text,case when b then 'PASS' else 'FAIL' end));
 begin update public.contract_templates set body_md=body||'x' where version='T0014.v1'; s:='değişti'; exception when others then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('şablon metni değiştirilemez','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));

 insert into public.customers(title,email,status) values('TEST_0014','t0014@example.com','aday') returning id into cid;
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status,token_hash)
  values(public.quote_next_no(),cid,'şahıs','Pro',18990,17091,current_date+10,'gönderildi',tok) returning id into qid;

 -- OTP
 update public.quotes set otp_hash=repeat('b',64),otp_expires_at=now()+interval '10 minutes' where id=qid;
 s:=public.quote_otp_check(qid,tok,repeat('c',64));
 r:=r||jsonb_build_array(jsonb_build_array('hatalı kod','hatalı',s,case when s='hatalı' then 'PASS' else 'FAIL' end));
 s:=public.quote_otp_check(qid,repeat('f',64),repeat('b',64));
 r:=r||jsonb_build_array(jsonb_build_array('başka token ile kod geçersiz','geçersiz',s,case when s='geçersiz' then 'PASS' else 'FAIL' end));
 s:=public.quote_otp_check(qid,tok,repeat('b',64));
 r:=r||jsonb_build_array(jsonb_build_array('doğru kod','ok',s,case when s='ok' then 'PASS' else 'FAIL' end));
 update public.quotes set otp_attempts=5 where id=qid;
 s:=public.quote_otp_check(qid,tok,repeat('b',64));
 r:=r||jsonb_build_array(jsonb_build_array('5 hatadan sonra kilit','kilit',s,case when s='kilit' then 'PASS' else 'FAIL' end));
 update public.quotes set otp_attempts=0 where id=qid;

 -- kabul
 j:=public.quote_accept(qid,repeat('f',64),'T0014.v1','metin',repeat('d',64),'otp_email','{"m":1}','{}');
 r:=r||jsonb_build_array(jsonb_build_array('yanlış token ile kabul','geçersiz',j->>'state',case when j->>'state'='geçersiz' then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(qid,tok,'T0014.v1','metin',repeat('d',64),'otp_email','{"m":1}','{"tc":"10000000146","address":"Kavacık","city":"İstanbul","district":"Beykoz"}');
 r:=r||jsonb_build_array(jsonb_build_array('kabul','kabul',j->>'state',case when j->>'state'='kabul' then 'PASS' else 'FAIL' end));
 iid:=(j->>'invoice_id')::uuid; conid:=(j->>'contract_id')::uuid;
 select i.quote_id=qid and i.amount=17091 and i.status='bekliyor' and c.quote_id=qid and c.status='bekliyor' and c.end_date=c.start_date+interval '1 year'-interval '1 day'
   into b from public.invoices i, public.contracts c where i.id=iid and c.id=conid;
 r:=r||jsonb_build_array(jsonb_build_array('kabulde tahsilat + sözleşme satırı','true',coalesce(b,false)::text,case when b then 'PASS' else 'FAIL' end));
 select tc='10000000146' and city='İstanbul' into b from public.customers where id=cid;
 r:=r||jsonb_build_array(jsonb_build_array('taraf bilgisi müşteriye yazılır','true',b::text,case when b then 'PASS' else 'FAIL' end));
 j:=public.quote_accept(qid,tok,'T0014.v1','metin',repeat('d',64),'otp_email','{"m":1}','{}');
 r:=r||jsonb_build_array(jsonb_build_array('ikinci kabul yeni kayıt açmaz','zaten',j->>'state',case when j->>'state'='zaten' and (select count(*) from public.invoices where quote_id=qid)=1 then 'PASS' else 'FAIL' end));

 -- aktivasyon
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('ödemesiz aktivasyon yok','eksik',j->>'state',case when j->>'state'='eksik' and j->'missing' ? 'ödeme' and j->'missing' ? 'adres_belgesi' then 'PASS' else 'FAIL' end));
 s:=public.paytr_mark_paid(iid,'OID0014',17091,current_date);
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('adres belgesi beklenir','eksik',j->>'state',case when j->>'state'='eksik' and not (j->'missing' ? 'ödeme') then 'PASS' else 'FAIL' end));
 begin update public.quotes set address_doc='gerekmiyor' where id=qid; s:='geçti'; exception when check_violation then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('gerekmiyor gerekçesiz olmaz','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));
 update public.quotes set address_doc='gerekmiyor',address_doc_note='Şube adresi değil, posta hizmeti' where id=qid;
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('aktivasyon','aktif',j->>'state',case when j->>'state'='aktif' then 'PASS' else 'FAIL' end));
 select c.status='aktif' and k.status='aktif' into b from public.customers c, public.contracts k where c.id=cid and k.id=conid;
 r:=r||jsonb_build_array(jsonb_build_array('müşteri ve sözleşme aktif','true',b::text,case when b then 'PASS' else 'FAIL' end));
 j:=public.quote_try_activate(qid);
 r:=r||jsonb_build_array(jsonb_build_array('aktivasyon tekrar çağrılabilir','zaten',j->>'state',case when j->>'state'='zaten' then 'PASS' else 'FAIL' end));
 b:=public.quote_claim_mail(qid,'paid') and not public.quote_claim_mail(qid,'paid');
 r:=r||jsonb_build_array(jsonb_build_array('e-posta bir kez','true',b::text,case when b then 'PASS' else 'FAIL' end));

 -- tutar uyuşmazlığı aktivasyonu durdurur
 insert into public.quotes(quote_no,customer_id,party_type,package_id,list_amount,amount,valid_until,status,token_hash)
  values(public.quote_next_no(),cid,'şahıs','Başlangıç',9990,9990,current_date-1,'gönderildi',repeat('e',64)) returning id into q2;
 j:=public.quote_accept(q2,repeat('e',64),'T0014.v1','metin',repeat('d',64),'otp_email','{"m":1}','{}');
 r:=r||jsonb_build_array(jsonb_build_array('süresi dolmuş teklif kabul edilmez','süresi_doldu',j->>'state',case when j->>'state'='süresi_doldu' then 'PASS' else 'FAIL' end));
 begin update public.quotes set status='kabul' where id=q2; s:='geçti'; exception when check_violation then s:='engellendi'; end;
 r:=r||jsonb_build_array(jsonb_build_array('kanıtsız kabul yazılamaz','engellendi',s,case when s='engellendi' then 'PASS' else 'FAIL' end));

 select not exists(select 1 from public.audit_log where table_name='quotes' and (changes ? 'token_hash' or changes ? 'otp_hash' or changes ? 'contract_text')) into b;
 r:=r||jsonb_build_array(jsonb_build_array('işlem kaydına gizli alan yazılmaz','true',b::text,case when b then 'PASS' else 'FAIL' end));

 raise exception using errcode='P0001', message='ganu-0014-rollback';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'ganu-0014-rollback' then raise; end if;
 end;
 insert into _ganu_0014_results select x->>0,x->>1,x->>2,x->>3 from jsonb_array_elements(r) x;
end $$;
select * from _ganu_0014_results order by name;
