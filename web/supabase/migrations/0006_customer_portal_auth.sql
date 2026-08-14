-- 0006 — Supabase Auth magic-link/JWT müşteri portalı.
create or replace function public.normalize_customer_email(p_email text)
returns text language sql immutable parallel safe set search_path=pg_catalog
as $$ select nullif(lower(btrim(p_email)), '') $$;

create or replace function public.is_customer_owner(p_customer_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_catalog
as $$ select auth.uid() is not null and exists (
  select 1 from public.customers c where c.id=p_customer_id and c.auth_uid=auth.uid()
    and c.status in ('aktif','askıda')) $$;
revoke all on function public.normalize_customer_email(text) from public;
revoke all on function public.is_customer_owner(uuid) from public;
grant execute on function public.is_customer_owner(uuid) to authenticated;

create or replace function public.claim_customer_by_email()
returns jsonb language plpgsql security definer set search_path=public,auth,pg_catalog as $$
declare v_uid uuid:=auth.uid(); v_email text; v_count int; c public.customers%rowtype;
begin
  if v_uid is null then raise exception 'authenticated JWT gerekli'; end if;
  select public.normalize_customer_email(u.email) into v_email from auth.users u
    where u.id=v_uid and u.email_confirmed_at is not null;
  if v_email is null then raise exception 'doğrulanmış e-posta gerekli'; end if;
  select count(*) into v_count from public.customers x
    where public.normalize_customer_email(x.email)=v_email and x.status in ('aktif','askıda');
  if v_count<>1 then raise exception 'müşteri eşleşmesi benzersiz değil'; end if;
  select * into strict c from public.customers x
    where public.normalize_customer_email(x.email)=v_email and x.status in ('aktif','askıda');
  if c.auth_uid is not null and c.auth_uid<>v_uid then raise exception 'müşteri başka kullanıcıya bağlı'; end if;
  if exists(select 1 from public.customers x where x.auth_uid=v_uid and x.id<>c.id) then
    raise exception 'kullanıcı başka müşteriye bağlı'; end if;
  update public.customers set auth_uid=v_uid where id=c.id and auth_uid is null;
  select * into c from public.customers where id=c.id;
  return to_jsonb(c)-array['access_code','portal_password'];
end $$;

create or replace function public.customer_me()
returns jsonb language sql stable security definer set search_path=public,pg_catalog as $$
 select to_jsonb(c)-array['access_code','portal_password'] from public.customers c
 where c.auth_uid=auth.uid() and c.status in ('aktif','askıda') $$;

create or replace function public.portal_bundle_jwt()
returns jsonb language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare c public.customers%rowtype;
begin
 select * into c from public.customers where auth_uid=auth.uid() and status in ('aktif','askıda');
 if not found then raise exception 'müşteri oturumu bağlı değil'; end if;
 return jsonb_build_object(
  'customer',to_jsonb(c)-array['access_code','portal_password'],
  'contracts',coalesce((select jsonb_agg(to_jsonb(x)) from public.contracts x where x.customer_id=c.id),'[]'::jsonb),
  'mail',coalesce((select jsonb_agg(to_jsonb(x)) from public.mail_items x where x.customer_id=c.id),'[]'::jsonb),
  'invoices',coalesce((select jsonb_agg(to_jsonb(x)) from public.invoices x where x.customer_id=c.id),'[]'::jsonb),
  'documents',coalesce((select jsonb_agg(to_jsonb(x)) from public.documents x where x.customer_id=c.id),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(to_jsonb(x)) from public.requests x where x.customer_id=c.id),'[]'::jsonb),
  'messages',coalesce((select jsonb_agg(to_jsonb(m)) from public.request_messages m join public.requests r on r.id=m.request_id where r.customer_id=c.id),'[]'::jsonb),
  'bookings',coalesce((select jsonb_agg(to_jsonb(x)) from public.bookings x where x.customer_id=c.id),'[]'::jsonb));
end $$;

create or replace function public.portal_create_request_jwt(p_mail_id uuid,p_kind text,p_note text)
returns setof public.requests language plpgsql security definer set search_path=public,pg_catalog as $$
declare cid uuid;
begin
 select id into cid from public.customers where auth_uid=auth.uid() and status in ('aktif','askıda');
 if cid is null then raise exception 'müşteri oturumu bağlı değil'; end if;
 if p_mail_id is not null and not exists(select 1 from public.mail_items where id=p_mail_id and customer_id=cid) then
  raise exception 'gönderi müşteriye ait değil'; end if;
 return query insert into public.requests(customer_id,mail_id,kind,note,status)
  values(cid,p_mail_id,coalesce(nullif(btrim(p_kind),''),'yönlendirme'),p_note,'yeni') returning *;
end $$;

create or replace function public.portal_send_message_jwt(p_request_id uuid,p_text text)
returns setof public.request_messages language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if nullif(btrim(p_text),'') is null then raise exception 'mesaj boş olamaz'; end if;
 if not exists(select 1 from public.requests r join public.customers c on c.id=r.customer_id
  where r.id=p_request_id and c.auth_uid=auth.uid() and c.status in ('aktif','askıda')) then
  raise exception 'talep müşteriye ait değil'; end if;
 return query insert into public.request_messages(request_id,"from",text)
  values(p_request_id,'musteri',btrim(p_text)) returning *;
end $$;

create or replace function public.portal_create_booking_jwt(p_date date,p_start text,p_end text,p_attendees int,p_note text)
returns setof public.bookings language plpgsql security definer set search_path=public,pg_catalog as $$
declare cid uuid;
begin
 select id into cid from public.customers where auth_uid=auth.uid() and status in ('aktif','askıda');
 if cid is null then raise exception 'müşteri oturumu bağlı değil'; end if;
 if p_date<current_date or p_start!~'^[0-2][0-9]:[0-5][0-9]$' or p_end!~'^[0-2][0-9]:[0-5][0-9]$'
  or p_start>=p_end or coalesce(p_attendees,0) not between 1 and 20 then raise exception 'geçersiz randevu'; end if;
 return query insert into public.bookings(customer_id,date,start,"end",attendees,note,status,created_by)
  values(cid,p_date,p_start,p_end,p_attendees,p_note,'talep','musteri') returning *;
end $$;

create or replace function public.portal_set_kvkk_jwt()
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare c public.customers%rowtype;
begin
 update public.customers set kvkk_consent_at=coalesce(kvkk_consent_at,now())
  where auth_uid=auth.uid() and status in ('aktif','askıda') returning * into c;
 if not found then raise exception 'müşteri oturumu bağlı değil'; end if;
 return to_jsonb(c)-array['access_code','portal_password'];
end $$;

revoke all on function public.claim_customer_by_email() from public;
revoke all on function public.customer_me() from public;
revoke all on function public.portal_bundle_jwt() from public;
revoke all on function public.portal_create_request_jwt(uuid,text,text) from public;
revoke all on function public.portal_send_message_jwt(uuid,text) from public;
revoke all on function public.portal_create_booking_jwt(date,text,text,int,text) from public;
revoke all on function public.portal_set_kvkk_jwt() from public;
grant execute on function public.claim_customer_by_email(),public.customer_me(),public.portal_bundle_jwt(),
 public.portal_create_request_jwt(uuid,text,text),public.portal_send_message_jwt(uuid,text),
 public.portal_create_booking_jwt(date,text,text,int,text),public.portal_set_kvkk_jwt() to authenticated;

-- Legacy cloud portalı kapat. purchase_submit_receipt satın alma akışıdır.
revoke execute on function public.portal_login(text,text) from anon,authenticated;
revoke execute on function public.portal_login_code(text) from anon,authenticated;
revoke execute on function public.portal_bundle(uuid,text) from anon,authenticated;
revoke execute on function public.portal_create_request(uuid,text,uuid,text,text) from anon,authenticated;
revoke execute on function public.portal_send_message(uuid,text,uuid,text) from anon,authenticated;
revoke execute on function public.portal_create_booking(uuid,text,date,text,text,int,text) from anon,authenticated;
revoke execute on function public.portal_set_kvkk(uuid,text) from anon,authenticated;
revoke execute on function public.portal_change_password(uuid,text,text) from anon,authenticated;
revoke execute on function public.portal_submit_receipt(uuid,text,text,numeric,text,text) from anon,authenticated;
