-- 0018 regresyonları: kalıcı Paraşüt tahsilat sahipliği ve token koşullu tamamlama/bırakma.
-- Yalnız test/staging veritabanında, 0018 migration sonrasında tek başına çalıştırın:
--   psql -v ON_ERROR_STOP=1 -f staging_0018_payment_claim_tests.sql
-- Gerçek müşteri kaydı okunmaz/değiştirilmez. Başarıda da ROLLBACK ile tüm fixture yazıları geri alınır.
-- Bu dosya ardışık DB davranışını sınar; gerçek iki bağlantılı yarışın yerine geçmez.
begin;
create temp table _ganu_0018_results(name text, result text, actual text) on commit drop;
grant all on _ganu_0018_results to service_role;
create or replace function pg_temp.ok_0018(p_name text, p_cond boolean, p_actual text default null)
returns void language sql as $$
  insert into _ganu_0018_results values(p_name, case when p_cond then 'PASS' else 'FAIL' end,
    coalesce(p_actual, coalesce(p_cond::text, 'null')))
$$;
create or replace function pg_temp.raises_0018(p_sql text, p_state text default null)
returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return p_state is null or sqlstate = p_state;
end $$;

do $$
declare
  c uuid; paid uuid; unpaid uuid; reviewed uuid; completed uuid;
  t1 uuid; t2 uuid; other_token uuid := gen_random_uuid(); claimed uuid;
  d date := (now() at time zone 'Europe/Istanbul')::date;
  remote text := '990018' || floor(random() * 1000000000000)::bigint::text;
  verifier uuid := gen_random_uuid(); r public.invoices; signature text;
begin
  -- ACL ile gövde içindeki auth.role kontrolü ayrı ayrı doğrulanır.
  foreach signature in array array[
    'public.parasut_payment_claim(uuid,text,numeric)',
    'public.parasut_payment_complete(uuid,uuid)',
    'public.parasut_payment_release(uuid,uuid)'
  ] loop
    perform pg_temp.ok_0018(signature || ': service_role execute', has_function_privilege('service_role', signature, 'EXECUTE'));
    perform pg_temp.ok_0018(signature || ': anon kapalı', not has_function_privilege('anon', signature, 'EXECUTE'));
    perform pg_temp.ok_0018(signature || ': authenticated kapalı', not has_function_privilege('authenticated', signature, 'EXECUTE'));
  end loop;

  perform set_config('request.jwt.claims', '{}', true);
  insert into public.customers(title, status, email) values('TEST_0018_PAYMENT_CLAIM', 'aday', 'test-0018@example.invalid') returning id into c;
  insert into public.invoices(customer_id, amount, status, paid_date, payment_method, payment_reference, payment_verified_by, parasut_invoice_id)
    values(c, 1199, 'ödendi', d, 'havale', 'TEST-0018-PAID', verifier, remote) returning id into paid;
  insert into public.invoices(customer_id, amount, status, parasut_invoice_id)
    values(c, 1199, 'bekliyor', remote || '1') returning id into unpaid;
  insert into public.invoices(customer_id, amount, status, paid_date, payment_method, payment_reference, payment_verified_by, parasut_invoice_id, payment_review)
    values(c, 1199, 'ödendi', d, 'havale', 'TEST-0018-REVIEW', verifier, remote || '2', 'TEST: inceleme açık') returning id into reviewed;
  insert into public.invoices(customer_id, amount, status, paid_date, payment_method, payment_reference, payment_verified_by, parasut_invoice_id, parasut_payment_at)
    values(c, 1199, 'ödendi', d, 'havale', 'TEST-0018-DONE', verifier, remote || '3', now()) returning id into completed;

  -- Yönetici SQL oturumunda bile service_role JWT iddiası olmadan RPC gövdesi kapalı kalır.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  perform pg_temp.ok_0018('claim gövdesi service_role ister', pg_temp.raises_0018(format('select public.parasut_payment_claim(%L,%L,1199)', paid, remote), '42501'));
  perform pg_temp.ok_0018('complete gövdesi service_role ister', pg_temp.raises_0018(format('select public.parasut_payment_complete(%L,%L)', paid, other_token), '42501'));
  perform pg_temp.ok_0018('release gövdesi service_role ister', pg_temp.raises_0018(format('select public.parasut_payment_release(%L,%L)', paid, other_token), '42501'));

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
  perform pg_temp.ok_0018('ödenmemiş fatura alınmaz', public.parasut_payment_claim(unpaid, remote || '1', 1199) is null);
  perform pg_temp.ok_0018('incelemesi açık fatura alınmaz', public.parasut_payment_claim(reviewed, remote || '2', 1199) is null);
  perform pg_temp.ok_0018('önceden eşitlenen fatura alınmaz', public.parasut_payment_claim(completed, remote || '3', 1199) is null);
  perform pg_temp.ok_0018('yanlış Paraşüt bağlantısıyla alınmaz', public.parasut_payment_claim(paid, remote || '9', 1199) is null);
  perform pg_temp.ok_0018('değişmiş tutarla alınmaz', public.parasut_payment_claim(paid, remote, 1200) is null);
  perform pg_temp.ok_0018('olmayan fatura alınmaz', public.parasut_payment_claim(gen_random_uuid(), remote, 1199) is null);

  t1 := public.parasut_payment_claim(paid, remote, 1199);
  select * into r from public.invoices where id = paid;
  perform pg_temp.ok_0018('ilk claim eşsiz token ve zaman kaydeder', t1 is not null and r.parasut_payment_claim_token = t1 and r.parasut_payment_claimed_at is not null);
  claimed := public.parasut_payment_claim(paid, remote, 1199);
  perform pg_temp.ok_0018('ikinci claim sahipliği alamaz', claimed is null);
  update public.invoices set parasut_payment_claimed_at = now() - interval '1 day' where id = paid;
  perform pg_temp.ok_0018('eski claim otomatik devralınmaz', public.parasut_payment_claim(paid, remote, 1199) is null);

  perform pg_temp.ok_0018('başkasının tokeni release yapamaz', pg_temp.raises_0018(format('select public.parasut_payment_release(%L,%L)', paid, other_token)));
  perform pg_temp.ok_0018('başkasının tokeni complete yapamaz', pg_temp.raises_0018(format('select public.parasut_payment_complete(%L,%L)', paid, other_token)));
  perform pg_temp.ok_0018('null token release yapamaz', pg_temp.raises_0018(format('select public.parasut_payment_release(%L,null)', paid)));
  perform pg_temp.ok_0018('null token complete yapamaz', pg_temp.raises_0018(format('select public.parasut_payment_complete(%L,null)', paid)));
  select * into r from public.invoices where id = paid;
  perform pg_temp.ok_0018('reddedilen işlemler mevcut sahibin tokenini korur', r.parasut_payment_claim_token = t1 and r.parasut_payment_at is null);

  perform public.parasut_payment_release(paid, t1);
  select * into r from public.invoices where id = paid;
  perform pg_temp.ok_0018('sahibi POST öncesi claimi bırakabilir', r.parasut_payment_claim_token is null and r.parasut_payment_claimed_at is null and r.parasut_payment_at is null);
  t2 := public.parasut_payment_claim(paid, remote, 1199);
  perform pg_temp.ok_0018('yeniden claim yeni token verir', t2 is not null and t2 is distinct from t1);
  perform pg_temp.ok_0018('eski sahip yeni claimi bırakamaz', pg_temp.raises_0018(format('select public.parasut_payment_release(%L,%L)', paid, t1)));
  perform pg_temp.ok_0018('eski sahip yeni claimi tamamlayamaz', pg_temp.raises_0018(format('select public.parasut_payment_complete(%L,%L)', paid, t1)));
  perform pg_temp.ok_0018('eski sahibin işlemlerinden sonra yeni token korunur', (select parasut_payment_claim_token = t2 from public.invoices where id = paid));

  perform public.parasut_payment_complete(paid, t2);
  select * into r from public.invoices where id = paid;
  perform pg_temp.ok_0018('sahibi tamamlar: ödeme işaretli, claim temiz', r.parasut_payment_at is not null and r.parasut_payment_claim_token is null and r.parasut_payment_claimed_at is null);
  perform pg_temp.ok_0018('tamamlanan tahsilat tekrar alınmaz', public.parasut_payment_claim(paid, remote, 1199) is null);
  perform pg_temp.ok_0018('tamamlanmış token tekrar kullanılamaz', pg_temp.raises_0018(format('select public.parasut_payment_complete(%L,%L)', paid, t2)));
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

do $$
declare f text; n integer;
begin
  select count(*), string_agg(name, ' | ') filter (where result <> 'PASS') into n, f from _ganu_0018_results;
  if f is not null then raise exception '0018 TEST FAIL: %', f; end if;
  raise notice '0018: % test PASS; tüm fixture değişiklikleri geri alınacak', n;
end $$;
select * from _ganu_0018_results order by result desc, name;
rollback;
