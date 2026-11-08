-- Only isolated test/staging database, after 0019. No real provider calls. Fixtures roll back.
begin;
create temp table oauth_test_results(name text, result text) on commit drop;
grant all on oauth_test_results to service_role;
create function pg_temp.ok_oauth(n text, v boolean) returns void language plpgsql as $$
begin
  if v is distinct from true then raise exception '0019 FAIL: %', n; end if;
  insert into oauth_test_results values(n,'PASS');
end $$;
create function pg_temp.raises_oauth(q text, state text default null) returns boolean language plpgsql as $$
begin execute q; return false;
exception when others then return state is null or sqlstate = state;
end $$;

do $$
declare f record; u uuid := gen_random_uuid(); other_u uuid := gen_random_uuid(); o uuid; o2 uuid; g bigint; cipher text; before_count int;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'parasut_oauth_%'
  loop
    perform pg_temp.ok_oauth(f.signature || ' service execute', has_function_privilege('service_role', f.signature, 'execute'));
    perform pg_temp.ok_oauth(f.signature || ' anon denied', not has_function_privilege('anon', f.signature, 'execute'));
    perform pg_temp.ok_oauth(f.signature || ' authenticated denied', not has_function_privilege('authenticated', f.signature, 'execute'));
  end loop;
  perform pg_temp.ok_oauth('flow table RLS', (select relrowsecurity from pg_class where oid='public.parasut_oauth_flows'::regclass));
  perform pg_temp.ok_oauth('token table RLS', (select relrowsecurity from pg_class where oid='public.parasut_oauth_connections'::regclass));
  perform pg_temp.ok_oauth('anon cannot read verifier', not has_table_privilege('anon','public.parasut_oauth_flows','select'));
  perform pg_temp.ok_oauth('authenticated cannot read tokens', not has_table_privilege('authenticated','public.parasut_oauth_connections','select'));
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  perform pg_temp.ok_oauth('body refuses wrong role', pg_temp.raises_oauth('select public.parasut_oauth_status(''TEST-0019'',''c'',''s'')','42501'));
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  execute 'set local role service_role';
  perform public.parasut_oauth_begin(repeat('a',43),u,'v1.test.verifier','c','TEST-0019');
  perform pg_temp.ok_oauth('wrong user cannot consume', public.parasut_oauth_consume(repeat('a',43),other_u,'c','TEST-0019') is null);
  perform pg_temp.ok_oauth('wrong client cannot consume', public.parasut_oauth_consume(repeat('a',43),u,'wrong','TEST-0019') is null);
  perform pg_temp.ok_oauth('wrong company cannot consume', public.parasut_oauth_consume(repeat('a',43),u,'c','wrong') is null);
  perform pg_temp.ok_oauth('correct owner consumes once', public.parasut_oauth_consume(repeat('a',43),u,'c','TEST-0019') = 'v1.test.verifier');
  perform pg_temp.ok_oauth('state replay denied', public.parasut_oauth_consume(repeat('a',43),u,'c','TEST-0019') is null);
  perform public.parasut_oauth_begin(repeat('b',43),u,'v1.test.verifier','c','TEST-0019');
  update public.parasut_oauth_flows set expires_at=now()-interval '1 second' where state_hash=repeat('b',43);
  perform pg_temp.ok_oauth('expired state denied', public.parasut_oauth_consume(repeat('b',43),u,'c','TEST-0019') is null);
  perform public.parasut_oauth_begin(repeat('c',43),u,'v1.test.verifier','c','TEST-0019');
  perform public.parasut_oauth_begin(repeat('d',43),u,'v1.test.verifier','c','TEST-0019');
  perform pg_temp.ok_oauth('new start cancels old same-user flow', public.parasut_oauth_consume(repeat('c',43),u,'c','TEST-0019') is null);
  perform pg_temp.ok_oauth('new start removes expired records', not exists(select from public.parasut_oauth_flows where state_hash=repeat('b',43)));
  perform pg_temp.ok_oauth('plaintext verifier cannot be stored',pg_temp.raises_oauth(format('select public.parasut_oauth_begin(%L,%L,''RAW-VERIFIER'',''c'',''TEST-0019'')',repeat('e',43),u),'23514'));
  perform public.parasut_oauth_connect('TEST-0019','c','s','v1.test.tokens',now()+interval '1 hour',now()+interval '1 day',u);
  perform pg_temp.ok_oauth('bootstrap reads immutable pin without prior subject',public.parasut_oauth_read('TEST-0019','c','')->>'subject'='s');
  perform pg_temp.ok_oauth('later consent cannot change account pin',not public.parasut_oauth_connect('TEST-0019','c','different','v1.wrong.tokens',now()+interval '1 hour',now()+interval '1 day',u));
  perform pg_temp.ok_oauth('rejected consent preserves account and token',public.parasut_oauth_read('TEST-0019','c','')->>'subject'='s' and public.parasut_oauth_read('TEST-0019','c','')->>'tokens_ciphertext'='v1.test.tokens');
  perform pg_temp.ok_oauth('missing account subject refused',pg_temp.raises_oauth(format('select public.parasut_oauth_connect(''TEST-0019'',''c'','''',''v1.wrong.tokens'',now()+interval ''1 hour'',now()+interval ''1 day'',%L)',u)));
  perform pg_temp.ok_oauth('wrong account read fails closed',public.parasut_oauth_read('TEST-0019','c','wrong') is null);
  perform pg_temp.ok_oauth('wrong client read fails closed',public.parasut_oauth_read('TEST-0019','wrong','s') is null);
  perform pg_temp.ok_oauth('safe status has no token or subject', not (public.parasut_oauth_status('TEST-0019','c','s') ?| array['tokens_ciphertext','subject','connected_by']));
  perform pg_temp.ok_oauth('fresh access not refresh-claimed',public.parasut_oauth_claim('TEST-0019','c','s',1) is null);
  update public.parasut_oauth_connections set access_expires_at=now()-interval '1 second' where company_id='TEST-0019';
  perform pg_temp.ok_oauth('stale generation cannot claim',public.parasut_oauth_claim('TEST-0019','c','s',0) is null);
  o := public.parasut_oauth_claim('TEST-0019','c','s',1);
  perform pg_temp.ok_oauth('first claimant owns refresh',o is not null);
  perform pg_temp.ok_oauth('second claimant denied',public.parasut_oauth_claim('TEST-0019','c','s',1) is null);
  update public.parasut_oauth_connections set refresh_claimed_at=now()-interval '1 day' where company_id='TEST-0019';
  perform pg_temp.ok_oauth('crashed owner never timed out/replayed',public.parasut_oauth_claim('TEST-0019','c','s',1) is null);
  perform pg_temp.ok_oauth('wrong owner cannot fail/release',not public.parasut_oauth_fail('TEST-0019','c','s',gen_random_uuid(),1));
  perform pg_temp.ok_oauth('null owner cannot fail/release',not public.parasut_oauth_fail('TEST-0019','c','s',null,1));
  perform pg_temp.ok_oauth('wrong owner cannot save',not public.parasut_oauth_complete('TEST-0019','c','s',gen_random_uuid(),1,'v1.wrong.tokens',now()+interval '1 hour',now()+interval '1 day'));
  perform pg_temp.ok_oauth('owner saves rotated credentials',public.parasut_oauth_complete('TEST-0019','c','s',o,1,'v1.rotated.tokens',now()+interval '1 hour',now()+interval '2 days'));
  select generation,tokens_ciphertext,refresh_owner into g,cipher,o2 from public.parasut_oauth_connections where company_id='TEST-0019';
  perform pg_temp.ok_oauth('save advances generation and clears owner',g=2 and cipher='v1.rotated.tokens' and o2 is null);
  perform pg_temp.ok_oauth('stale access 401 cannot revoke rotated token',not public.parasut_oauth_reject('TEST-0019','c','s',1));
  update public.parasut_oauth_connections set access_expires_at=now()-interval '1 second' where company_id='TEST-0019';
  o2 := public.parasut_oauth_claim('TEST-0019','c','s',2);
  perform pg_temp.ok_oauth('next expiry gets different owner',o2 is not null and o2<>o);
  perform public.parasut_oauth_connect('TEST-0019','c','s','v1.newconsent.tokens',now()+interval '1 hour',now()+interval '1 day',u);
  perform pg_temp.ok_oauth('new consent invalidates old owner fail',not public.parasut_oauth_fail('TEST-0019','c','s',o2,2));
  perform pg_temp.ok_oauth('new consent invalidates old owner save',not public.parasut_oauth_complete('TEST-0019','c','s',o2,2,'v1.old.tokens',now()+interval '1 hour',now()+interval '1 day'));
  perform pg_temp.ok_oauth('new consent remains connected',public.parasut_oauth_read('TEST-0019','c','s')->>'status'='connected');
  select generation into g from public.parasut_oauth_connections where company_id='TEST-0019';
  perform pg_temp.ok_oauth('current generation 401 requires reconnect',public.parasut_oauth_reject('TEST-0019','c','s',g));
  perform pg_temp.ok_oauth('reconnect clears credentials',(public.parasut_oauth_read('TEST-0019','c','s')->>'tokens_ciphertext') is null);
  perform pg_temp.ok_oauth('disconnected token cannot refresh',public.parasut_oauth_claim('TEST-0019','c','s',g+1) is null);
  execute 'reset role';
end $$;
select * from oauth_test_results order by name;
do $$ declare n int; begin select count(*) into n from oauth_test_results; raise notice '0019: % assertions PASS; fixtures roll back',n; end $$;
rollback;
