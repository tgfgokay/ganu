-- 0005 RBAC/JWT storage statik + SQL davranış testleri (yalnız staging).
-- Pozitif staff helper testi için önce gerçek staff Auth UID'siyle:
--   set ganu.test_staff_uid = '<auth.users içindeki staff_roles UID>';
create temp table _ganu_0005_results(name text, expected text, actual text, result text);

do $$
declare
  fake_uid uuid := gen_random_uuid();
  staff_uid text := nullif(current_setting('ganu.test_staff_uid', true), '');
  b boolean;
  n int;
begin
  -- Negatif: authenticated JWT var ama staff_roles kaydı yok.
  perform set_config('request.jwt.claims', json_build_object('sub',fake_uid::text,'role','authenticated')::text, true);
  b := public.is_staff();
  insert into _ganu_0005_results values ('staff_roles olmayan authenticated red','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  begin
    execute 'set local role authenticated';
    execute 'select count(*) from public.customers' into n;
    execute 'reset role';
    insert into _ganu_0005_results values ('staff olmayan authenticated customers okuyamaz','0',n::text,case when n=0 then 'PASS' else 'FAIL' end);
  exception when others then
    execute 'reset role';
    insert into _ganu_0005_results values ('staff olmayan authenticated customers red','0 veya red','red','PASS');
  end;

  -- Pozitif: gerçek auth.users + staff_roles kaydı olan UID.
  if staff_uid is not null and exists (
    select 1 from auth.users u join public.staff_roles r on r.user_id=u.id
     where u.id=staff_uid::uuid
  ) then
    perform set_config('request.jwt.claims', json_build_object('sub',staff_uid,'role','authenticated')::text, true);
    b := public.is_staff();
    insert into _ganu_0005_results values ('gerçek staff UID kabul','true',b::text,case when b then 'PASS' else 'FAIL' end);
    begin
      execute 'set local role authenticated';
      execute 'select count(*) from public.discount_codes' into n;
      execute 'reset role';
      insert into _ganu_0005_results values ('gerçek staff gizli kod okuyabilir','>=1',n::text,case when n>=1 then 'PASS' else 'FAIL' end);
    exception when others then
      execute 'reset role';
      insert into _ganu_0005_results values ('gerçek staff gizli kod okuyabilir','>=1','red','FAIL');
    end;
  else
    insert into _ganu_0005_results values ('gerçek staff UID pozitif testi','PASS','SKIP: ganu.test_staff_uid gerekli','SKIP');
  end if;

  -- Access-code storage helper artık istemci rollerine açık değil.
  b := has_function_privilege('anon','public.owns_secure_object(text,text)','EXECUTE');
  insert into _ganu_0005_results values ('anon owns_secure_object execute yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);
  b := has_function_privilege('authenticated','public.owns_secure_object(text,text)','EXECUTE');
  insert into _ganu_0005_results values ('authenticated owns_secure_object execute yok','false',b::text,case when not b then 'PASS' else 'FAIL' end);

  -- Storage policy doğrudan is_staff helper kullanmalı.
  select exists(
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='staff_rw_secure_docs'
      and coalesce(qual,'') like '%is_staff%'
      and coalesce(with_check,'') like '%is_staff%'
  ) into b;
  insert into _ganu_0005_results values ('secure-docs policy staff helper bağlı','true',b::text,case when b then 'PASS' else 'FAIL' end);

  perform set_config('request.jwt.claims','', true);
end $$;

select * from _ganu_0005_results order by name;
select result, count(*) from _ganu_0005_results group by result order by result;
