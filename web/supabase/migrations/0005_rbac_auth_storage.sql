-- ============================================================
-- 0005 — Gerçek staff RBAC + JWT bağlı private storage
-- authenticated olmak personel olmak DEĞİLDİR. Tüm personel politikaları
-- staff_roles üyeliğini SECURITY DEFINER helper üzerinden doğrular.
-- ============================================================

create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1 from public.staff_roles r where r.user_id = auth.uid()
  );
$$;

create or replace function public.is_staff_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null and exists (
    select 1 from public.staff_roles r
     where r.user_id = auth.uid() and r.role in ('owner','admin')
  );
$$;

revoke all on function public.is_staff() from public;
revoke all on function public.is_staff_admin() from public;
grant execute on function public.is_staff(), public.is_staff_admin() to authenticated;

-- Müşteri Auth eşlemesi tekil ve auth.users'a bağlıdır. Bağlama işlemi bu
-- migration tarafından otomatik yapılmaz; doğrulanmış OTP/magic-link oturumu ve
-- kontrollü operasyon gerekir.
create unique index if not exists customers_auth_uid_unique
  on public.customers(auth_uid) where auth_uid is not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='customers_auth_uid_fkey') then
    alter table public.customers add constraint customers_auth_uid_fkey
      foreign key (auth_uid) references auth.users(id) on delete set null;
  end if;
end $$;

-- Ana iş tabloları: yalnız gerçek staff_roles üyesi.
drop policy if exists "staff_all_partners" on public.partners;
create policy "staff_all_partners" on public.partners for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_customers" on public.customers;
create policy "staff_all_customers" on public.customers for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_contracts" on public.contracts;
create policy "staff_all_contracts" on public.contracts for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_mail" on public.mail_items;
create policy "staff_all_mail" on public.mail_items for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_invoices" on public.invoices;
create policy "staff_all_invoices" on public.invoices for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_documents" on public.documents;
create policy "staff_all_documents" on public.documents for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_notifications" on public.notifications;
create policy "staff_all_notifications" on public.notifications for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_requests" on public.requests;
create policy "staff_all_requests" on public.requests for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_inspections" on public.inspections;
create policy "staff_all_inspections" on public.inspections for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_reqmsg" on public.request_messages;
create policy "staff_all_reqmsg" on public.request_messages for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_expenses" on public.expenses;
create policy "staff_all_expenses" on public.expenses for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_bookings" on public.bookings;
create policy "staff_all_bookings" on public.bookings for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_compay" on public.commission_payments;
create policy "staff_all_compay" on public.commission_payments for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_all_pos_orders" on public.pos_orders;
create policy "staff_all_pos_orders" on public.pos_orders for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_read_security_events" on public.security_events;
create policy "staff_read_security_events" on public.security_events for select to authenticated using (public.is_staff());

-- Katalog yazımı ve gizli indirim kodları da gerçek staff ile sınırlı.
drop policy if exists "staff_write_packages" on public.packages;
create policy "staff_write_packages" on public.packages for all to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "staff_read_discounts" on public.discount_codes;
create policy "staff_read_discounts" on public.discount_codes for select to authenticated using (public.is_staff());
drop policy if exists "staff_write_discounts" on public.discount_codes;
create policy "staff_write_discounts" on public.discount_codes for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Rol tablosu: staff kendi rolünü okuyabilir; yalnız owner/admin yazar.
drop policy if exists "staff_read_roles" on public.staff_roles;
create policy "staff_read_roles" on public.staff_roles for select to authenticated using (public.is_staff());
drop policy if exists "owner_admin_write_roles" on public.staff_roles;
create policy "owner_admin_write_roles" on public.staff_roles for all to authenticated
  using (public.is_staff_admin()) with check (public.is_staff_admin());

-- Private bucket: herhangi bir authenticated kullanıcı değil, yalnız staff.
drop policy if exists "staff_rw_secure_docs" on storage.objects;
create policy "staff_rw_secure_docs" on storage.objects for all to authenticated
  using (bucket_id='secure-docs' and public.is_staff())
  with check (bucket_id='secure-docs' and public.is_staff());

-- Eski access_code sahiplik fonksiyonu artık anon/authenticated dosya erişim
-- yüzeyi değildir. JWT tabanlı get-file doğrudan auth_uid/staff kontrol eder.
revoke execute on function public.owns_secure_object(text,text) from anon, authenticated;
