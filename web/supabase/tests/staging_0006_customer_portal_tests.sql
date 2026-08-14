-- 0006 statik/negatif kapılar. Pozitif JWT testleri için dedicated doğrulanmış
-- staging Auth kullanıcısı ile: set ganu.test_customer_uid='<uuid>';
create temp table _ganu_0006_results(name text,expected text,actual text,result text);
do $$
declare b boolean; fake uuid:=gen_random_uuid(); j jsonb; test_uid text:=nullif(current_setting('ganu.test_customer_uid',true),'');
begin
  foreach b in array array[
    has_function_privilege('anon','public.portal_login(text,text)','EXECUTE'),
    has_function_privilege('anon','public.portal_login_code(text)','EXECUTE'),
    has_function_privilege('anon','public.portal_bundle(uuid,text)','EXECUTE'),
    has_function_privilege('authenticated','public.portal_bundle(uuid,text)','EXECUTE')]
  loop insert into _ganu_0006_results values('legacy portal execute kapalı','false',b::text,case when not b then 'PASS' else 'FAIL' end); end loop;

  perform set_config('request.jwt.claims',json_build_object('sub',fake,'role','authenticated')::text,true);
  begin perform public.claim_customer_by_email();
    insert into _ganu_0006_results values('auth.users dışı claim red','exception','accepted','FAIL');
  exception when others then insert into _ganu_0006_results values('auth.users dışı claim red','exception','exception','PASS'); end;

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
