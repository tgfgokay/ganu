-- DOWN — 0005. Güvenliği düşürür; production'da yalnız acil rollback ve onayla.
drop policy if exists "staff_rw_secure_docs" on storage.objects;
drop policy if exists "staff_write_discounts" on public.discount_codes;
drop policy if exists "staff_read_discounts" on public.discount_codes;
drop policy if exists "staff_write_packages" on public.packages;
drop policy if exists "staff_read_security_events" on public.security_events;
drop policy if exists "staff_all_pos_orders" on public.pos_orders;
drop policy if exists "staff_all_compay" on public.commission_payments;
drop policy if exists "staff_all_bookings" on public.bookings;
drop policy if exists "staff_all_expenses" on public.expenses;
drop policy if exists "staff_all_reqmsg" on public.request_messages;
drop policy if exists "staff_all_inspections" on public.inspections;
drop policy if exists "staff_all_requests" on public.requests;
drop policy if exists "staff_all_notifications" on public.notifications;
drop policy if exists "staff_all_documents" on public.documents;
drop policy if exists "staff_all_invoices" on public.invoices;
drop policy if exists "staff_all_mail" on public.mail_items;
drop policy if exists "staff_all_contracts" on public.contracts;
drop policy if exists "staff_all_customers" on public.customers;
drop policy if exists "staff_all_partners" on public.partners;
drop policy if exists "owner_admin_write_roles" on public.staff_roles;
drop policy if exists "staff_read_roles" on public.staff_roles;
alter table public.customers drop constraint if exists customers_auth_uid_fkey;
drop index if exists public.customers_auth_uid_unique;
drop function if exists public.is_staff_admin();
drop function if exists public.is_staff();

-- Önceki authenticated=staff politikaları bilerek otomatik geri açılmaz.
-- Rollback sonrası uygulama fail-closed kalır; eski geniş politikaları geri getirmek
-- veri ihlali riski nedeniyle ayrı ve açık bir acil durum kararı gerektirir.
