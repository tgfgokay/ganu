-- Önce yeni Edge kodunu durdurun. Belirsiz tahsilat varken sahiplik kaydını kaldırmayın.
do $$ begin
  if exists(select 1 from public.invoices where parasut_payment_claim_token is not null) then
    raise exception 'Kontrol bekleyen tahsilat var; Paraşüt ile uzlaşmadan 0018 geri alınamaz';
  end if;
end $$;
drop function if exists public.parasut_payment_claim(uuid,text,numeric);
drop function if exists public.parasut_payment_complete(uuid,uuid);
drop function if exists public.parasut_payment_release(uuid,uuid);
-- Teşhis/veri kaybını önlemek için kolonlar korunur.
