-- JWT portalını kaldırır; legacy access-code execute yetkileri geri verilmez.
drop function if exists public.portal_set_kvkk_jwt();
drop function if exists public.portal_create_booking_jwt(date,text,text,int,text);
drop function if exists public.portal_send_message_jwt(uuid,text);
drop function if exists public.portal_create_request_jwt(uuid,text,text);
drop function if exists public.portal_bundle_jwt();
drop function if exists public.customer_me();
drop function if exists public.claim_customer_by_email();
drop function if exists public.normalize_customer_email(text);
-- customers.auth_uid bağları veri kaybını önlemek için korunur.
