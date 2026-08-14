-- ============================================================
-- PROD READINESS GATE — deployment'ı DURDURAN kontrol
-- psql -v ON_ERROR_STOP=1 ile çalıştır: FAIL → non-zero exit (CI durur).
-- ------------------------------------------------------------
-- Zorunlu kanıt: son 24 saatte, GERÇEK JWT ile (admin-gate Edge Function)
-- doğrulanmış bir owner/admin'in admin RPC'yi çalıştırdığı kaydı.
--   • Yalnız staff_roles kaydı YETMEZ.
--   • Elle set edilen request.jwt.claims YETMEZ (kanıt service-role ile,
--     getUser-doğrulamalı JWT üzerinden yazılır).
-- ============================================================
do $$
declare
  v_recent int;
  v_any_owner int;
begin
  select count(*) into v_any_owner
    from public.staff_roles r
    join auth.users u on u.id = r.user_id
   where r.role in ('owner','admin');
  if v_any_owner = 0 then
    raise exception 'PROD GATE FAIL: auth.users içinde gerçek owner/admin YOK (staff_roles boş ya da uid auth.users''ta değil).';
  end if;

  select count(*) into v_recent
    from public.prod_gate_proof p
   where p.method = 'jwt'
     and exists (select 1 from auth.users   u where u.id = p.uid)
     and exists (select 1 from public.staff_roles r where r.user_id = p.uid and r.role in ('owner','admin'))
     and p.created_at > now() - interval '24 hours';

  if v_recent < 1 then
    raise exception
      'PROD GATE FAIL: son 24 saatte gerçek JWT ile doğrulanmış owner/admin admin-RPC kanıtı YOK. '
      '`admin-gate` fonksiyonunu gerçek owner access-token ile çağırıp kanıt üretin.';
  end if;

  raise notice 'PROD GATE PASS: % adet geçerli (jwt) owner/admin kanıtı bulundu.', v_recent;
end $$;
