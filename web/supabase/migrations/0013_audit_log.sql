-- 0013 — İşlem kaydı (audit log): kim, ne zaman, hangi kayıtta neyi değiştirdi.
-- Yalnız ekleme: kayıtlar güncellenemez/silinemez (tetikleyici engeller). Personel okur, kimse yazamaz;
-- satırları yalnız audit_row() tetikleyicisi ekler. actor boşsa işlem sistem/servis rolündendir (ör. PayTR bildirimi).
-- Değişiklikte yalnız değişen alanlar (eski, yeni) saklanır; portal parolası ve erişim kodu hiç yazılmaz.
create table if not exists public.audit_log(
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_email text,
  table_name text not null,
  row_id text,
  customer_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changes jsonb
);
create index if not exists audit_log_customer_at on public.audit_log(customer_id, at desc);
create index if not exists audit_log_at on public.audit_log(at desc);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from public, anon, authenticated;
grant select on public.audit_log to authenticated;
drop policy if exists audit_log_staff_read on public.audit_log;
create policy audit_log_staff_read on public.audit_log for select to authenticated using (public.is_staff());

create or replace function public.audit_log_immutable() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
begin raise exception 'audit_log değiştirilemez ve silinemez'; end $$;
drop trigger if exists audit_log_no_change on public.audit_log;
create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
declare
  o jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  n jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  diff jsonb := '{}'::jsonb; rid text; cid text; k text; claims jsonb;
begin
  rid := coalesce(n->>'id', o->>'id');
  cid := case when tg_table_name='customers' then rid else coalesce(n->>'customer_id', o->>'customer_id') end;
  if tg_op='UPDATE' then
    for k in select key from jsonb_each(n) loop
      if (o->k) is distinct from (n->k) then diff := diff || jsonb_build_object(k, jsonb_build_array(o->k, n->k)); end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  elsif tg_op='INSERT' then diff := n;
  else diff := o;
  end if;
  diff := diff - 'portal_password' - 'access_code';
  claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  insert into public.audit_log(actor, actor_email, table_name, row_id, customer_id, action, changes)
  values (auth.uid(), claims->>'email', tg_table_name, rid, nullif(cid,'')::uuid, tg_op, diff);
  return null;
end $$;
revoke all on function public.audit_row() from public, anon, authenticated;

do $$ declare t text;
begin
  foreach t in array array['customers','contracts','invoices','documents','mail_items','inspections','requests'] loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;
