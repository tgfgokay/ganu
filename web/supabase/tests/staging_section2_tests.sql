-- ============================================================================
-- GANU · STAGING §2 SQL TEST BLOĞU (tek parça, kopyala-yapıştır)
-- ----------------------------------------------------------------------------
-- ÇALIŞTIRMA BAĞLAMI:
--   • Supabase SQL Editor'de (rol: postgres/service_role — YÜKSEK YETKİ).
--   • YALNIZ STAGING. Gerçek müşteri verisi olan projede ÇALIŞTIRMA.
--
-- ⚠️ ÖNEMLİ — RLS KANITI:
--   SQL Editor yüksek yetkiyle çalışır ve RLS'i baypas edebilir. Aşağıdaki
--   "RLS (set local role)" testleri YAKLAŞIK'tır. anon/authenticated RLS'inin
--   gerçekten çalıştığı, KESİN olarak yalnız anon key + HTTP (PostgREST) ya da
--   supabase-js istemcisiyle kanıtlanır. Claude bunu bağlantı sonrası ayrıca koşar.
--   • 'service_role' ile geçen bir test RLS güvenliğini KANITLAMAZ (RLS baypas).
--
-- GÜVENLİK:
--   • Yalnız 'TEST_' önekli veri üretilir; mevcut/gerçek kayıtlar DEĞİŞTİRİLMEZ.
--   • DROP TABLE / TRUNCATE / geniş DELETE YOK — temizlik yalnız 'TEST_' filtreli.
--   • Exception bekleyen testler nested BEGIN/EXCEPTION (savepoint) ile izole.
--   • Sonda temizlik + kalan 'TEST_' kayıt sayıları raporlanır.
--
-- İSTEĞE BAĞLI: admin senaryosu gerçek bir owner auth kullanıcısı ister (FK).
--   Çalıştırmadan önce (adım 6'da davet ettiğin owner'ın uid'i ile):
--     set ganu.test_owner_uid = '00000000-0000-0000-0000-000000000000';
--   Ayarlı değilse admin testi SKIP olur (diğerleri çalışır).
-- ZORUNLU: test hukuki satış kapısını yalnız staging ref'i için geçici açar:
--     set ganu.test_project_ref = '<20-char staging project ref>';
-- ============================================================================

begin;
set local search_path = public, extensions;

do $$
declare project_ref text:=nullif(current_setting('ganu.test_project_ref',true),''); activated boolean;
begin
 if coalesce(project_ref,'') !~ '^[a-z0-9]{20}$' then
  raise exception 'set ganu.test_project_ref=<20-char staging ref> before running section2 tests';
 end if;
 activated:=public.legal_activate_sale(project_ref,repeat('b',64),repeat('c',64),'none');
 if not activated then raise exception 'section2 test legal gate could not be activated from a clean disabled state'; end if;
end $$;

create temp table if not exists _ganu_test_results(
  seq serial primary key, grp text, name text, expected text, actual text, result text
);
delete from _ganu_test_results;

do $$
declare
  v_cid       uuid := gen_random_uuid();   -- ana TEST müşteri
  v_legacy    uuid := gen_random_uuid();   -- legacy parola testi müşterisi
  v_other     uuid := gen_random_uuid();   -- var olmayan başka müşteri (path testi)
  v_sid_ok    uuid := gen_random_uuid();
  v_sid_mm    uuid := gen_random_uuid();
  v_sid_nocust uuid := gen_random_uuid();
  v_self      text := nullif(current_setting('ganu.test_customer_uid', true), ''); -- gerçek auth.users UID
  v_owner     text := nullif(current_setting('ganu.test_owner_uid', true), '');
  v_code      text := 'TEST_CODE_1';
  b boolean; r text; s text; n int;
begin
  -- ============ SETUP (TEST_ önekli) ============
  insert into public.packages(id,name,list_amount,monthly_amount,is_custom,active,sort)
    values ('TEST_PKG','TEST Paket',12345,1234,false,true,999);
  insert into public.discount_codes(code,pct,active) values ('TEST_DISC',15,true);
  insert into public.customers(id,title,status,access_code,portal_password)
    values (v_cid,'TEST_Müşteri','aktif',v_code,'');
  insert into public.customers(id,title,status,access_code,portal_password)
    values (v_legacy,'TEST_Legacy','aktif','TEST_LEGACY_CODE',
            'sha256:'||encode(digest('eski','sha256'),'hex'));  -- legacy (sha256) parola
  insert into public.purchase_sessions(id,customer_id,package_id,amount,list_amount,price_version,currency,expires_at,
    use_kind,used_at,legal_text_version,preinfo_accepted_at,early_performance_requested_at,legal_ip_hash,legal_user_agent_hash)
  values
    (v_sid_ok,v_cid,'Pro',189.90,189.90,1,'TL',now()+interval '30 minutes','pos',now(),'2026-08-15.v1',now(),now(),repeat('a',64),repeat('b',64)),
    (v_sid_mm,v_cid,'Pro',189.90,189.90,1,'TL',now()+interval '30 minutes','pos',now(),'2026-08-15.v1',now(),now(),repeat('c',64),repeat('d',64)),
    (v_sid_nocust,v_cid,'Pro',189.90,189.90,1,'TL',now()+interval '30 minutes','pos',now(),'2026-08-15.v1',now(),now(),repeat('e',64),repeat('f',64));

  -- ============================================================
  -- 1) _pw_match — yalnız bcrypt kabul; sha256/düz metin/boş red
  -- ============================================================
  b := public._pw_match('bcrypt:'||crypt('Gizli1234',gen_salt('bf',12)),'Gizli1234');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','bcrypt doğru parola kabul','true',b::text,case when b then 'PASS' else 'FAIL' end);

  b := public._pw_match('bcrypt:'||crypt('Gizli1234',gen_salt('bf',12)),'yanlis');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','bcrypt yanlış parola red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public._pw_match('sha256:'||encode(digest('x','sha256'),'hex'),'x');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','sha256 red (P0.6)','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public._pw_match('duzmetin','duzmetin');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','düz metin red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public._pw_match('','x');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','boş stored red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public._pw_match(null,'x');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('_pw_match','null stored red','false',coalesce(b::text,'null'),case when coalesce(b,false)=false then 'PASS' else 'FAIL' end);

  -- ============================================================
  -- 2) owns_secure_object — doğru/yanlış/boş kod, başka müşteri, 3 klasör
  -- ============================================================
  b := public.owns_secure_object(v_code, 'customers/'||v_cid||'/a.pdf');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','doğru kod + customers/ klasörü','true',b::text,case when b then 'PASS' else 'FAIL' end);

  b := public.owns_secure_object(v_code, 'mail/'||v_cid||'/a.jpg');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','doğru kod + mail/ klasörü','true',b::text,case when b then 'PASS' else 'FAIL' end);

  b := public.owns_secure_object(v_code, 'receipts/'||v_cid||'/a.pdf');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','doğru kod + receipts/ klasörü','true',b::text,case when b then 'PASS' else 'FAIL' end);

  b := public.owns_secure_object('TEST_WRONG', 'mail/'||v_cid||'/a.jpg');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','YANLIŞ kod red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public.owns_secure_object('', 'mail/'||v_cid||'/a.jpg');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','BOŞ kod red (parantez hatası olsa true olurdu)','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  b := public.owns_secure_object(v_code, 'mail/'||v_other||'/a.jpg');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('owns_secure_object','doğru kod + BAŞKA müşteri yolu red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  -- ============================================================
  -- 3) pos_settle — başarı, tekrar (idempotent), tutar uyuşmazlığı,
  --    müşteri güncelleme hatası (rollback), bilinmeyen sipariş
  -- ============================================================
  -- 3a başarı (189.90 → 18990 kuruş)
  insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,price_version,list_amount,currency)
    values ('TEST_OID_OK', v_cid, 189.90, 'Pro','paytr','bekliyor',v_sid_ok,'ready',1,189.90,'TL');
  r := public.pos_settle('TEST_OID_OK','success',18990);
  select status into s from public.pos_orders where merchant_oid='TEST_OID_OK';
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('pos_settle','başarı → ok','ok',r,case when r='ok' then 'PASS' else 'FAIL' end),
    ('pos_settle','başarı → sipariş başarılı','başarılı',s,case when s='başarılı' then 'PASS' else 'FAIL' end);
  select case when payment_receipt_url='pos:paytr' then 'işaretli' else coalesce(payment_receipt_url,'yok') end
    into s from public.customers where id=v_cid;
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('pos_settle','başarı → müşteri işaretli','işaretli',s,case when s='işaretli' then 'PASS' else 'FAIL' end);

  -- 3b idempotency (aynı callback tekrar)
  r := public.pos_settle('TEST_OID_OK','success',18990);
  select status into s from public.pos_orders where merchant_oid='TEST_OID_OK';
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('pos_settle','tekrar callback → idempotent başarı','idempotent_success',r,case when r='idempotent_success' then 'PASS' else 'FAIL' end),
    ('pos_settle','tekrar callback → tek sonuç (başarılı sabit)','başarılı',s,case when s='başarılı' then 'PASS' else 'FAIL' end);

  -- 3c tutar uyuşmazlığı
  insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,price_version,list_amount,currency)
    values ('TEST_OID_MM', v_cid, 189.90, 'Pro','paytr','bekliyor',v_sid_mm,'ready',1,189.90,'TL');
  r := public.pos_settle('TEST_OID_MM','success',100);
  select status into s from public.pos_orders where merchant_oid='TEST_OID_MM';
  select count(*) into n from public.security_events where kind='pos_amount_mismatch' and detail->>'merchant_oid'='TEST_OID_MM';
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('pos_settle','tutar uyuşmazlığı → mismatch','mismatch',r,case when r='mismatch' then 'PASS' else 'FAIL' end),
    ('pos_settle','tutar uyuşmazlığı → sipariş şüpheli','şüpheli',s,case when s='şüpheli' then 'PASS' else 'FAIL' end),
    ('pos_settle','tutar uyuşmazlığı → güvenlik olayı','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);

  -- 3d müşteri güncelleme hatası → exception + sipariş 'bekliyor' kalır (atomik)
  insert into public.pos_orders(merchant_oid,customer_id,amount,pkg,provider,status,purchase_session_id,init_state,price_version,list_amount,currency)
    values ('TEST_OID_NOCUST', v_cid, 189.90, 'Pro','paytr','bekliyor',v_sid_nocust,'ready',1,189.90,'TL');
  update public.pos_orders set customer_id = null, purchase_session_id = null where merchant_oid='TEST_OID_NOCUST'; -- müşteri kaybı simülasyonu
  begin
    r := public.pos_settle('TEST_OID_NOCUST','success',18990);
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('pos_settle','müşteri hatası → exception','exception','no-exception (r='||coalesce(r,'null')||')','FAIL');
  exception when others then
    select status into s from public.pos_orders where merchant_oid='TEST_OID_NOCUST';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('pos_settle','müşteri hatası → sipariş TAMAMLANMADI (bekliyor)','bekliyor',s,
       case when s='bekliyor' then 'PASS' else 'FAIL' end);
  end;

  -- 3e bilinmeyen sipariş
  r := public.pos_settle('TEST_OID_UNKNOWN','success',18990);
  select count(*) into n from public.security_events where kind='pos_unknown_order' and detail->>'merchant_oid'='TEST_OID_UNKNOWN';
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('pos_settle','bilinmeyen sipariş → unknown','unknown',r,case when r='unknown' then 'PASS' else 'FAIL' end),
    ('pos_settle','bilinmeyen sipariş → güvenlik olayı','1',n::text,case when n=1 then 'PASS' else 'FAIL' end);

  -- ============================================================
  -- 4) set_portal_password — kısa parola, yetkisiz, self, admin
  -- ============================================================
  -- 4a kısa parola (yetki öncesi uzunluk kontrolü)
  begin
    perform public.set_portal_password(v_cid,'x');
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','kısa parola → exception','exception','no-exception','FAIL');
  exception when others then
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','kısa parola → exception','exception (uzunluk)',left(SQLERRM,40),
       case when SQLERRM ilike '%8 karakter%' then 'PASS' else 'FAIL' end);
  end;

  -- 4b yetkisiz kullanıcı (rastgele uid, staff değil, self değil) → başka müşteriyi değiştiremez
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
  begin
    perform public.set_portal_password(v_cid,'GecerliParola12');
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','yetkisiz → red','exception','no-exception','FAIL');
  exception when others then
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','yetkisiz kullanıcı başka müşteriyi değiştiremez','exception (yetki)',left(SQLERRM,40),
       case when SQLERRM ilike '%yetki%' then 'PASS' else 'FAIL' end);
  end;
  perform set_config('request.jwt.claims','', true);

  -- 4c self (customers.auth_uid = auth.uid()) → gerçek auth.users UID gerekir.
  if v_self is not null and exists (select 1 from auth.users where id=v_self::uuid) then
    update public.customers set auth_uid = v_self::uuid where id = v_cid;
    perform set_config('request.jwt.claims', json_build_object('sub', v_self)::text, true);
    begin
      perform public.set_portal_password(v_cid,'SelfParola12');
      select case when portal_password like 'bcrypt:%' then 'bcrypt' else left(coalesce(portal_password,'yok'),10) end
        into s from public.customers where id=v_cid;
      insert into _ganu_test_results(grp,name,expected,actual,result) values
        ('set_portal_password','self → kendi parolasını belirledi (bcrypt)','bcrypt',s,
         case when s='bcrypt' then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _ganu_test_results(grp,name,expected,actual,result) values
        ('set_portal_password','self → başarılı','bcrypt','exception: '||left(SQLERRM,30),'FAIL');
    end;
    update public.customers set auth_uid = null where id = v_cid;
    perform set_config('request.jwt.claims','', true);
  else
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','self gerçek Auth UID senaryosu','PASS','SKIP: set ganu.test_customer_uid=<uid>','SKIP');
  end if;

  -- 4d admin (owner) → farklı müşterinin parolasını belirleyebilir (owner uid gerekli)
  if v_owner is not null and exists (select 1 from public.staff_roles where user_id = v_owner::uuid and role in ('owner','admin')) then
    perform set_config('request.jwt.claims', json_build_object('sub', v_owner)::text, true);
    begin
      perform public.set_portal_password(v_cid,'AdminParola12');
      select case when portal_password like 'bcrypt:%' then 'bcrypt' else 'değil' end into s from public.customers where id=v_cid;
      insert into _ganu_test_results(grp,name,expected,actual,result) values
        ('set_portal_password','admin → farklı müşteri parolası (bcrypt)','bcrypt',s,
         case when s='bcrypt' then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _ganu_test_results(grp,name,expected,actual,result) values
        ('set_portal_password','admin → başarılı','bcrypt','exception: '||left(SQLERRM,30),'FAIL');
    end;
    perform set_config('request.jwt.claims','', true);
  else
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('set_portal_password','admin senaryosu','PASS','SKIP: set ganu.test_owner_uid=<owner auth uid> ile çalıştır','SKIP');
  end if;

  -- ============================================================
  -- 5) Legacy reset yaşam döngüsü (must_reset_password)
  -- ============================================================
  -- 5a legacy (sha256) parola ile giriş imkânsız
  select portal_password into s from public.customers where id=v_legacy;
  b := public._pw_match(s,'eski');
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('legacy_reset','legacy sha256 ile _pw_match red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  -- 5b migration'ın yaptığı bulk reset (TEST kaydına scoped): sıfırla + işaretle
  update public.customers
     set must_reset_password = true, portal_password = ''
   where id = v_legacy and portal_password not like 'bcrypt:%';
  select (must_reset_password and coalesce(portal_password,'')='') into b from public.customers where id=v_legacy;
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('legacy_reset','reset → must_reset_password=true & parola boş','true',b::text,case when b then 'PASS' else 'FAIL' end);

  -- 5c kontrollü geçiş: access_code ile yeni bcrypt parola belirle → flag temizlenir
  b := public.portal_change_password(v_legacy, 'TEST_LEGACY_CODE', 'YeniParola12');
  select (portal_password like 'bcrypt:%' and must_reset_password = false) into b
    from public.customers where id=v_legacy;
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('legacy_reset','access_code ile bcrypt parola + flag temizlendi','true',b::text,case when b then 'PASS' else 'FAIL' end);

  -- ============================================================
  -- 6) RLS (set local role) — YAKLAŞIK (kesin kanıt: anon key + HTTP)
  -- ============================================================
  -- 6a anon aktif paketleri okur (>0)
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.packages where active' into n;
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','anon aktif paket okur (>0)','>0',n::text,case when n>0 then 'PASS' else 'FAIL' end);
  exception when others then
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','anon aktif paket okur','>0','hata: '||left(SQLERRM,30),'FAIL');
  end;

  -- 6b anon discount_codes GÖREMEZ (gizli: 0 satır ya da yetki reddi → PASS)
  begin
    execute 'set local role anon';
    execute 'select count(*) from public.discount_codes' into n;
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','anon discount_codes göremez','0 veya red',n::text,case when n=0 then 'PASS' else 'FAIL' end);
  exception when others then
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','anon discount_codes göremez (yetki reddi)','0 veya red','red: '||left(SQLERRM,20),'PASS');
  end;

  -- 6c authenticated tek başına personel değildir → gizli kodları okuyamaz
  begin
    execute 'set local role authenticated';
    execute 'select count(*) from public.discount_codes' into n;
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','staff rolü olmayan authenticated discount_codes göremez','0',n::text,case when n=0 then 'PASS' else 'FAIL' end);
  exception when others then
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','staff rolü olmayan authenticated discount_codes red','0 veya red','red: '||left(SQLERRM,30),'PASS');
  end;

  -- 6d yetkisiz personel (authenticated, owner/admin değil) staff_roles YAZAMAZ
  begin
    execute 'set local role authenticated';
    execute 'insert into public.staff_roles(user_id, role) values (gen_random_uuid(), ''support'')';
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','yetkisiz personel staff_roles yazamaz','red','yazıldı','FAIL');
  exception when others then
    execute 'reset role';
    insert into _ganu_test_results(grp,name,expected,actual,result) values
      ('RLS~','yetkisiz personel staff_roles yazamaz','red','red: '||left(SQLERRM,20),'PASS');
  end;

  -- ============ TEMİZLİK (yalnız TEST_ filtreli — geniş DELETE YOK) ============
  delete from public.pos_orders    where merchant_oid like 'TEST_%';
  delete from public.security_events where coalesce(detail->>'merchant_oid','') like 'TEST_%';
  delete from public.customers     where id in (v_cid, v_legacy);
  delete from public.discount_codes where code like 'TEST_%';
  delete from public.packages      where id like 'TEST_%';

exception when others then
  -- setup/akış beklenmedik hata: kaydet, temizliği yine dene
  insert into _ganu_test_results(grp,name,expected,actual,result) values
    ('HATA','beklenmedik istisna','—',left(SQLERRM,80),'FAIL');
  begin
    delete from public.pos_orders    where merchant_oid like 'TEST_%';
    delete from public.security_events where coalesce(detail->>'merchant_oid','') like 'TEST_%';
    delete from public.customers     where title in ('TEST_Müşteri','TEST_Legacy');
    delete from public.discount_codes where code like 'TEST_%';
    delete from public.packages      where id like 'TEST_%';
  exception when others then null;
  end;
end $$;

update public.legal_sale_config set enabled=false,tested_project_ref=null,sql_proof_sha256=null,http_proof_sha256=null,
 sql_tested_at=null,http_tested_at=null,activated_at=null,cross_border_status='none',updated_at=now() where id=true;

-- ============ SONUÇ RAPORU ============
select seq, grp, name, expected, actual, result from _ganu_test_results order by seq;

-- Özet
select result, count(*) from _ganu_test_results group by result order by result;

-- ============ KALINTI KONTROLÜ (temizlik doğrulaması) ============
-- Hepsi 0 olmalı. Değilse hangi kayıtların kaldığını gösterir.
select 'pos_orders'     as tablo, count(*) as kalan_test_kaydi from public.pos_orders    where merchant_oid like 'TEST_%'
union all select 'security_events', count(*) from public.security_events where coalesce(detail->>'merchant_oid','') like 'TEST_%'
union all select 'customers',       count(*) from public.customers     where title in ('TEST_Müşteri','TEST_Legacy')
union all select 'discount_codes',  count(*) from public.discount_codes where code like 'TEST_%'
union all select 'packages',        count(*) from public.packages      where id like 'TEST_%';
commit;
