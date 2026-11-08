-- 0018 — Eşitleme ve e-Belge tahsilatı için ortak, kalıcı sahiplik.
-- POST yanıtı belirsizse token otomatik sona ermez: Paraşüt'te uzlaşma / insan kontrolü gerekir.
alter table public.invoices add column if not exists parasut_payment_claim_token uuid;
alter table public.invoices add column if not exists parasut_payment_claimed_at timestamptz;

create or replace function public.parasut_payment_claim(p_invoice uuid, p_parasut_id text, p_amount numeric) returns uuid
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare v_token uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.invoices set parasut_payment_claim_token = gen_random_uuid(), parasut_payment_claimed_at = now()
   where id = p_invoice and status = 'ödendi' and parasut_payment_at is null and parasut_payment_claim_token is null
     and parasut_invoice_id = p_parasut_id and p_amount > 0 and abs(amount - p_amount) <= 0.02 and payment_review is null
   returning parasut_payment_claim_token into v_token;
  return v_token;
end $$;

create or replace function public.parasut_payment_complete(p_invoice uuid, p_token uuid) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.invoices set parasut_payment_at = now(), parasut_payment_claim_token = null, parasut_payment_claimed_at = null
   where id = p_invoice and parasut_payment_claim_token = p_token;
  if not found then raise exception 'Tahsilat sahipliği eşleşmedi'; end if;
end $$;

-- Yalnız POST başlamadan bırakılır. Belirsiz POST sonrası otomatik çağrılmaz.
create or replace function public.parasut_payment_release(p_invoice uuid, p_token uuid) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  update public.invoices set parasut_payment_claim_token = null, parasut_payment_claimed_at = null
   where id = p_invoice and parasut_payment_claim_token = p_token;
  if not found then raise exception 'Tahsilat sahipliği eşleşmedi'; end if;
end $$;

revoke all on function public.parasut_payment_claim(uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.parasut_payment_complete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.parasut_payment_release(uuid,uuid) from public,anon,authenticated;
grant execute on function public.parasut_payment_claim(uuid,text,numeric) to service_role;
grant execute on function public.parasut_payment_complete(uuid,uuid) to service_role;
grant execute on function public.parasut_payment_release(uuid,uuid) to service_role;
