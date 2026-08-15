-- 0006 statik/negatif kapılar. Pozitif JWT testleri için dedicated doğrulanmış
-- staging Auth kullanıcısı ile: set ganu.test_customer_uid='<uuid>';
create temp table _ganu_0006_results(name text,expected text,actual text,result text);
do $$
declare
  b boolean; fake uuid:=gen_random_uuid(); j jsonb;
  test_uid text:=nullif(current_setting('ganu.test_customer_uid',true),'');
  staff_uid text:=nullif(current_setting('ganu.test_staff_uid',true),'');
  f regprocedure; role_name text;
  legacy regprocedure[]:=array[
    'public.portal_login(text,text)'::regprocedure,
    'public.portal_login_code(text)'::regprocedure,
    'public.portal_bundle(uuid,text)'::regprocedure,
    'public.portal_create_request(uuid,text,uuid,text,text)'::regprocedure,
    'public.portal_send_message(uuid,text,uuid,text)'::regprocedure,
    'public.portal_create_booking(uuid,text,date,text,text,integer,text)'::regprocedure,
    'public.portal_set_kvkk(uuid,text)'::regprocedure,
    'public.portal_change_password(uuid,text,text)'::regprocedure,
    'public.portal_submit_receipt(uuid,text,text,numeric,text,text)'::regprocedure];
begin
  foreach f in array legacy loop
    select exists(select 1 from pg_proc p cross join lateral
      aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=f and a.grantee=0 and a.privilege_type='EXECUTE') into b;
    insert into _ganu_0006_results values('PUBLIC execute yok: '||f::text,'false',b::text,case when not b then 'PASS' else 'FAIL' end);
    foreach role_name in array array['anon','authenticated'] loop
      b:=has_function_privilege(role_name,f::oid,'EXECUTE');
      insert into _ganu_0006_results values(role_name||' execute yok: '||f::text,'false',b::text,case when not b then 'PASS' else 'FAIL' end);
    end loop;
  end loop;

  perform set_config('request.jwt.claims',json_build_object('sub',fake,'role','authenticated')::text,true);
  begin perform public.claim_customer_by_email();
    insert into _ganu_0006_results values('auth.users dışı claim red','exception','accepted','FAIL');
  exception when others then insert into _ganu_0006_results values('auth.users dışı claim red','exception','exception','PASS'); end;

  if staff_uid is not null and exists(select 1 from auth.users u join public.staff_roles r on r.user_id=u.id where u.id=staff_uid::uuid) then
    perform set_config('request.jwt.claims',json_build_object('sub',staff_uid,'role','authenticated')::text,true);
    begin
      perform public.claim_customer_by_email();
      insert into _ganu_0006_results values('staff UID customer claim red','exception','accepted','FAIL');
    exception when others then
      insert into _ganu_0006_results values('staff UID customer claim red','exception','exception','PASS');
    end;
  else
    insert into _ganu_0006_results values('staff UID customer claim red','PASS','SKIP: ganu.test_staff_uid gerekli','SKIP');
  end if;

  if test_uid is not null and exists(select 1 from auth.users where id=test_uid::uuid and email_confirmed_at is not null) then
    perform set_config('request.jwt.claims',json_build_object('sub',test_uid,'role','authenticated')::text,true);
    begin
      j:=public.claim_customer_by_email();
      insert into _ganu_0006_results values('doğrulanmış benzersiz email claim','customer','customer',case when j is not null then 'PASS' else 'FAIL' end);
      insert into _ganu_0006_results values('secret customer çıktısında yok','false',((j?'access_code') or (j?'portal_password'))::text,
        case when not (j?'access_code') and not (j?'portal_password') then 'PASS' else 'FAIL' end);
      j:=public.portal_bundle_jwt();
      insert into _ganu_0006_results values('bundle yalnız bağlı customer','true',(j->'customer'->>'auth_uid'=test_uid)::text,
        case when j->'customer'->>'auth_uid'=test_uid then 'PASS' else 'FAIL' end);
    exception when others then
      insert into _ganu_0006_results values('doğrulanmış benzersiz email claim','PASS','ERROR: dedicated eşleşme gerekli','FAIL');
    end;
  else
    insert into _ganu_0006_results values('doğrulanmış customer UID pozitif','PASS','SKIP','SKIP');
  end if;
  perform set_config('request.jwt.claims','',true);
end $$;
select * from _ganu_0006_results order by name;
select result,count(*) from _ganu_0006_results group by result order by result;

-- Manuel staging negatifleri: aynı normalize email ile 2 aktif test customer
-- oluşturulduğunda claim exception; başka auth_uid bağlı tek müşteri exception;
-- customer JWT ile staff tablosu ve başka customer bundle/RPC erişimi yok.
