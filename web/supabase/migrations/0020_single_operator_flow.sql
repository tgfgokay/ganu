-- 0020 — Tek kişi operasyonu: kalıcı iş kuyruğu, idempotent kabul/kargo ve kanıtlı aktivasyon.
-- E-posta kabulü teslim kanıtı değildir. Gönderim sırasında yanıt kaybı otomatik tekrar gönderilmez.
alter table public.contracts add column if not exists document_settings jsonb not null default '{}'::jsonb;
alter table public.contracts add column if not exists privacy_notice jsonb;
alter table public.mail_items add column if not exists intake_key uuid unique;
alter table public.mail_items add column if not exists tracking_no text;

create table if not exists public.operation_jobs(
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 kind text not null check(kind in ('contract_package','mail_arrived','einvoice_issue','einvoice_pdf')),
 customer_id uuid not null references public.customers(id),
 contract_id uuid references public.contracts(id), invoice_id uuid references public.invoices(id), mail_id uuid references public.mail_items(id),
 state text not null default 'queued' check(state in ('queued','preparing','sending','sent','done','blocked','failed','uncertain')),
 attempts integer not null default 0, generation integer not null default 1, next_attempt_at timestamptz not null default now(), claim_token uuid, claimed_at timestamptz, sending_at timestamptz,
 prepared jsonb, missing jsonb not null default '[]'::jsonb, error_code text,
 provider_id text, payload_sha256 text, accepted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists operation_jobs_ready on public.operation_jobs(created_at) where state='queued';
alter table public.operation_jobs enable row level security;
revoke all on public.operation_jobs from public,anon,authenticated;
grant select on public.operation_jobs to authenticated;
grant all on public.operation_jobs to service_role;
drop policy if exists operation_jobs_staff_read on public.operation_jobs;
create policy operation_jobs_staff_read on public.operation_jobs for select to authenticated using(public.is_staff());
drop trigger if exists audit_row on public.operation_jobs;
create trigger audit_row after insert or update or delete on public.operation_jobs for each row execute function public.audit_row();

create table if not exists public.quote_acceptances(
 quote_id uuid primary key references public.quotes(id), customer_id uuid not null references public.customers(id),
 contract_id uuid not null references public.contracts(id), invoice_id uuid references public.invoices(id), stamp_tax_id uuid references public.stamp_taxes(id),
 accepted_by uuid not null, accepted_at timestamptz not null default now()
);
alter table public.quote_acceptances enable row level security;
revoke all on public.quote_acceptances from public,anon,authenticated;
grant select,insert on public.quote_acceptances to authenticated;
drop policy if exists quote_acceptances_staff on public.quote_acceptances;
create policy quote_acceptances_staff on public.quote_acceptances for all to authenticated using(public.is_staff()) with check(public.is_staff() and public.ganu_flag('accept'));
drop trigger if exists audit_row on public.quote_acceptances;
create trigger audit_row after insert on public.quote_acceptances for each row execute function public.audit_row();

-- Queue references are not reparented by normal edit forms after an operational event.
create or replace function public.operation_records_owner_guard() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
declare locked boolean;
begin
 if tg_table_name='contracts' then
  locked:=new.customer_id is distinct from old.customer_id and exists(select 1 from operation_jobs where contract_id=old.id);
 elsif tg_table_name='invoices' then
  locked:=(new.customer_id is distinct from old.customer_id or new.contract_id is distinct from old.contract_id) and exists(select 1 from operation_jobs where invoice_id=old.id or (old.contract_id is not null and contract_id=old.contract_id));
 else
  locked:=new.customer_id is distinct from old.customer_id and exists(select 1 from operation_jobs where mail_id=old.id);
 end if;
 if locked then raise exception 'İşleme bağlı kaydın müşteri/sözleşme bağlantısı değiştirilemez' using errcode='check_violation';end if;
 return new;
end $$;
revoke all on function public.operation_records_owner_guard() from public,anon,authenticated;
drop trigger if exists operation_records_owner_guard on public.contracts;
create trigger operation_records_owner_guard before update on public.contracts for each row execute function public.operation_records_owner_guard();
drop trigger if exists operation_records_owner_guard on public.invoices;
create trigger operation_records_owner_guard before update on public.invoices for each row execute function public.operation_records_owner_guard();
drop trigger if exists operation_records_owner_guard on public.mail_items;
create trigger operation_records_owner_guard before update on public.mail_items for each row execute function public.operation_records_owner_guard();

create or replace function public.invoice_contract_customer_guard() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
begin
 if (tg_op='INSERT' or new.customer_id is distinct from old.customer_id or new.contract_id is distinct from old.contract_id)
 and new.contract_id is not null and not exists(select 1 from contracts where id=new.contract_id and customer_id=new.customer_id)
 then raise exception 'Fatura ile sözleşme aynı müşteriye ait olmalı' using errcode='check_violation';end if;
 return new;
end $$;
revoke all on function public.invoice_contract_customer_guard() from public,anon,authenticated;
drop trigger if exists invoice_contract_customer_guard on public.invoices;
create trigger invoice_contract_customer_guard before insert or update on public.invoices for each row execute function public.invoice_contract_customer_guard();

-- SECURITY DEFINER uniquement for inserting protected queue rows; never accepts recipient/body/path.
create or replace function public.enqueue_operation(p_kind text,p_customer uuid,p_contract uuid default null,p_invoice uuid default null,p_mail uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_catalog as $$
declare jid uuid; k text;
begin
 if not public.is_staff() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501'; end if;
 if p_kind='contract_package' then
  if not exists(select 1 from contracts where id=p_contract and customer_id=p_customer) then raise exception 'Sözleşme müşteri eşleşmiyor';end if;
  k:='contract:'||p_contract;
 elsif p_kind in ('einvoice_issue','einvoice_pdf') then
  if not exists(select 1 from invoices where id=p_invoice and customer_id=p_customer and (p_kind='einvoice_issue' and status='ödendi' or p_kind='einvoice_pdf' and einvoice_status='kesildi' and einvoice_pdf like 'secure:customers/'||p_customer||'/%')) then raise exception 'Fatura hazır değil';end if;
  k:=p_kind||':'||p_invoice;
 elsif p_kind='mail_arrived' then
  if not exists(select 1 from mail_items where id=p_mail and customer_id=p_customer) then raise exception 'Gönderi müşteri eşleşmiyor';end if;
  k:='mail:'||p_mail;
 else raise exception 'Geçersiz iş';end if;
 insert into operation_jobs(dedupe_key,kind,customer_id,contract_id,invoice_id,mail_id) values(k,p_kind,p_customer,p_contract,p_invoice,p_mail) on conflict(dedupe_key) do nothing;
 select id into jid from operation_jobs where dedupe_key=k;return jid;
end $$;
revoke all on function public.enqueue_operation(text,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.enqueue_operation(text,uuid,uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.accept_quote(p_quote uuid,p_customer jsonb default '{}'::jsonb,p_start date default null) returns jsonb
language plpgsql security invoker set search_path=public,pg_catalog as $$
declare q quotes; a quote_acceptances; r jsonb; c customers; target jsonb; n integer; jid uuid;
begin
 if not public.is_staff() then raise exception 'Yetkisiz' using errcode='42501';end if;
 select * into q from quotes where id=p_quote for update;if not found then raise exception 'Teklif bulunamadı';end if;
 select * into a from quote_acceptances where quote_id=q.id;
 if found then return to_jsonb(a)||jsonb_build_object('replayed',true);end if;
 target:=p_customer;
 if q.contract_id is not null then
  r:=jsonb_build_object('customer_id',q.customer_id,'contract_id',q.contract_id,'invoice_id',(select id from invoices where contract_id=q.contract_id order by created_at limit 1));
 else
  if nullif(target->>'id','') is null and coalesce(nullif(q.tax_no,''),nullif(q.tc,'')) is not null then
   select count(*) into n from customers where (nullif(q.tax_no,'') is not null and tax_no=q.tax_no) or (nullif(q.tc,'') is not null and tc=q.tc);
   if n>1 then raise exception 'Aynı kimlikte birden fazla müşteri var; müşteri kaydını seçin';end if;
   select * into c from customers where (nullif(q.tax_no,'') is not null and tax_no=q.tax_no) or (nullif(q.tc,'') is not null and tc=q.tc) limit 1;
   if found then target:=jsonb_build_object('id',c.id);end if;
  end if;
  if nullif(target->>'id','') is null then
   target:=jsonb_build_object('title',q.title,'contact',q.contact,'email',q.email,'phone',q.phone,'tax_no',q.tax_no,'tc',q.tc,'tax_office',q.tax_office,'address',p_customer->>'address','city',p_customer->>'city','district',p_customer->>'district');
  end if;
  r:=public.convert_quote(q.id,target,jsonb_build_object('start_date',coalesce(p_start,(now() at time zone 'Europe/Istanbul')::date)),jsonb_build_object('note','Teklif kabulü · ilk dönem'),jsonb_build_object('payer','müşteri'));
  -- Avukat kaynağı: peşin ödeme; iç fatura kaydı henüz e-belge değildir.
  update invoices set due_date=issue_date where id=(r->>'invoice_id')::uuid;
 end if;
 perform set_config('ganu.accept','on',true);
 insert into quote_acceptances(quote_id,customer_id,contract_id,invoice_id,stamp_tax_id,accepted_by) values(q.id,(r->>'customer_id')::uuid,(r->>'contract_id')::uuid,(r->>'invoice_id')::uuid,(r->>'stamp_tax_id')::uuid,auth.uid());
 perform set_config('ganu.accept','',true);
 jid:=public.enqueue_operation('contract_package',(r->>'customer_id')::uuid,(r->>'contract_id')::uuid);
 return r||jsonb_build_object('job_id',jid,'replayed',false);
end $$;
revoke all on function public.accept_quote(uuid,jsonb,date) from public,anon;grant execute on function public.accept_quote(uuid,jsonb,date) to authenticated;

create or replace function public.receive_mail(p_key uuid,p_customer uuid,p_type text default 'kargo',p_details jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_catalog as $$
declare m mail_items; jid uuid;
begin
 if not public.is_staff() then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_key is null or p_customer is null or p_type is null or p_type not in ('kargo','mektup','tebligat') then raise exception 'Müşteri ve gönderi türü gerekli';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,20));
 select * into m from mail_items where intake_key=p_key;
 if found then
  if m.customer_id<>p_customer or m.type<>p_type then raise exception 'İstek farklı bir kayda ait';end if;
  return jsonb_build_object('mail_id',m.id,'replayed',true);
 end if;
 if not exists(select 1 from customers where id=p_customer) then raise exception 'Müşteri bulunamadı';end if;
 if coalesce(p_details->>'photo_url','')<>'' and p_details->>'photo_url' not like 'secure:mail/'||p_customer||'/%' then raise exception 'Fotoğraf bu müşteriye ait değil';end if;
 insert into mail_items(intake_key,customer_id,type,sender,received_date,status,shelf,notes,photo_url,tracking_no,issuer,reference_no,attempted_at,legal_result,receiver_capacity)
 values(p_key,p_customer,p_type,p_details->>'sender',coalesce(nullif(p_details->>'received_date','')::date,(now() at time zone 'Europe/Istanbul')::date),'geldi',p_details->>'shelf',p_details->>'notes',nullif(p_details->>'photo_url',''),p_details->>'tracking_no',p_details->>'issuer',p_details->>'reference_no',nullif(p_details->>'attempted_at','')::timestamptz,nullif(p_details->>'legal_result',''),p_details->>'receiver_capacity') returning * into m;
 jid:=public.enqueue_operation('mail_arrived',p_customer,p_mail=>m.id);
 return jsonb_build_object('mail_id',m.id,'job_id',jid,'replayed',false);
end $$;
revoke all on function public.receive_mail(uuid,uuid,text,jsonb) from public,anon;grant execute on function public.receive_mail(uuid,uuid,text,jsonb) to authenticated;

-- Claim ownership is a DB token. Only pre-send leases may be reclaimed; expired sending becomes uncertain.
create or replace function public.operation_claim(p_id uuid default null) returns setof public.operation_jobs
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501';end if;
 update operation_jobs set state='uncertain',error_code='provider_confirmation_required',claim_token=null,updated_at=now() where state='sending' and sending_at<now()-interval '10 minutes';
 return query with candidate as(select id from operation_jobs where (p_id is null or id=p_id) and (state='queued' and next_attempt_at<=now() or state='preparing' and claimed_at<now()-interval '10 minutes') order by case when kind='mail_arrived' and exists(select 1 from mail_items m where m.id=mail_id and m.type='tebligat') then 0 else 1 end,created_at for update skip locked limit 1)
 update operation_jobs j set state='preparing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1,updated_at=now() from candidate c where j.id=c.id returning j.*;
end $$;
create or replace function public.operation_prepare(p_id uuid,p_token uuid,p_prepared jsonb) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501';end if;
 update operation_jobs set prepared=coalesce(prepared,p_prepared),updated_at=now() where id=p_id and claim_token=p_token and state='preparing';
 if not found then raise exception 'İş sahipliği değişti';end if;
end $$;
create or replace function public.operation_begin_send(p_id uuid,p_token uuid,p_content_hash text default null) returns boolean
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501';end if;
 update operation_jobs j set state='blocked',error_code='recipient_changed',missing='[{"code":"recipient_changed","label":"Müşteri e-posta adresi değişti; yeni adresi doğrulayıp tekrar deneyin","scope":"customer"}]',claim_token=null,updated_at=now()
 where j.id=p_id and j.claim_token=p_token and j.state='preparing' and j.prepared is not null
 and (not exists(select 1 from customers c where c.id=j.customer_id and btrim(c.email)=j.prepared->>'to')
  or (j.kind='contract_package' and not exists(select 1 from contracts c where c.id=j.contract_id and c.customer_id=j.customer_id))
  or (j.kind in ('einvoice_issue','einvoice_pdf') and not exists(select 1 from invoices i where i.id=j.invoice_id and i.customer_id=j.customer_id and (j.contract_id is null or i.contract_id=j.contract_id)))
  or (j.kind='mail_arrived' and not exists(select 1 from mail_items m where m.id=j.mail_id and m.customer_id=j.customer_id)));
 if p_content_hash is not null and p_content_hash !~ '^[a-f0-9]{64}$' then raise exception 'Geçersiz içerik doğrulaması';end if;
 update operation_jobs set state='sending',payload_sha256=p_content_hash,sending_at=now(),updated_at=now() where id=p_id and claim_token=p_token and state='preparing' and prepared is not null;
 return found;
end $$;
create or replace function public.operation_finish(p_id uuid,p_token uuid,p_state text,p_error text default null,p_missing jsonb default '[]'::jsonb,p_provider text default null) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
declare j operation_jobs;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501';end if;
 if p_state is null or p_state not in ('sent','done','blocked','failed','uncertain') or (p_state='sent' and coalesce(btrim(p_provider),'')='') then raise exception 'Geçersiz sonuç';end if;
 update operation_jobs set state=p_state,error_code=p_error,missing=coalesce(p_missing,'[]'::jsonb),provider_id=p_provider,accepted_at=case when p_state='sent' then now() else accepted_at end,claim_token=null,updated_at=now() where id=p_id and claim_token=p_token and state in ('preparing','sending') and (p_state<>'sent' or state='sending') returning * into j;
 if not found then raise exception 'İş sahipliği değişti';end if;
 if p_state='sent' and j.mail_id is not null then
  perform set_config('ganu.mail_provider_notice','on',true);
  update mail_items set status=case when status='geldi' then 'bildirildi' else status end,notify_channel='e-posta',notified_at=now() where id=j.mail_id;
  perform set_config('ganu.mail_provider_notice','',true);
 end if;
end $$;
-- Provider-derived notice fields cannot be forged by staff edits or arbitrary service writes.
create or replace function public.mail_provider_notice_guard() returns trigger
language plpgsql set search_path=public,pg_catalog as $$
declare new_notice boolean;
begin
 new_notice:=case when tg_op='INSERT' then new.status='bildirildi' or new.notified_at is not null
 else (new.status='bildirildi' and old.status is distinct from 'bildirildi')
   or new.notified_at is distinct from old.notified_at
   or (old.notified_at is not null and new.notify_channel is distinct from old.notify_channel) end;
 if public.ganu_api_role() and new_notice and not (
  coalesce(auth.role(),'')='service_role' and public.ganu_flag('mail_provider_notice')
  and exists(select 1 from operation_jobs j where j.mail_id=new.id and j.customer_id=new.customer_id and j.state='sent' and j.provider_id is not null and j.accepted_at is not null)
 ) then raise exception 'Bildirim durumu yalnız sağlayıcının kabul ettiği gönderimle değişir' using errcode='check_violation';end if;
 return new;
end $$;
revoke all on function public.mail_provider_notice_guard() from public,anon,authenticated;
drop trigger if exists mail_provider_notice_guard on public.mail_items;
create trigger mail_provider_notice_guard before insert or update on public.mail_items for each row execute function public.mail_provider_notice_guard();

create or replace function public.retry_operation(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if not public.is_staff() then raise exception 'Yetkisiz' using errcode='42501';end if;
 update operation_jobs j set state='queued',error_code=null,missing='[]'::jsonb,claim_token=null,next_attempt_at=now(),
 prepared=case when j.prepared is not null and c.email is distinct from j.prepared->>'to' then jsonb_set(j.prepared,'{to}',to_jsonb(btrim(coalesce(c.email,'')))) else j.prepared end,
 generation=j.generation+case when j.prepared is not null and c.email is distinct from j.prepared->>'to' then 1 else 0 end,updated_at=now()
 from customers c where j.id=p_id and c.id=j.customer_id and j.state in ('blocked','failed');
 if not found then raise exception 'Bu iş yeniden gönderilemez; belirsiz gönderimi önce sağlayıcıdan doğrulayın';end if;
end $$;
create or replace function public.operation_defer(p_id uuid,p_token uuid,p_error text,p_seconds integer default 300) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Yetkisiz' using errcode='42501';end if;
 update operation_jobs set state='queued',error_code=p_error,claim_token=null,next_attempt_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_seconds,300),300))),updated_at=now()
 where id=p_id and claim_token=p_token and state='preparing' and kind='einvoice_issue';
 if not found then raise exception 'İş sahipliği değişti';end if;
end $$;
revoke all on function public.operation_defer(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.operation_defer(uuid,uuid,text,integer) to service_role;

revoke all on function public.operation_claim(uuid),public.operation_prepare(uuid,uuid,jsonb),public.operation_begin_send(uuid,uuid,text),public.operation_finish(uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.operation_claim(uuid),public.operation_prepare(uuid,uuid,jsonb),public.operation_begin_send(uuid,uuid,text),public.operation_finish(uuid,uuid,text,text,jsonb,text) to service_role;
revoke all on function public.retry_operation(uuid) from public,anon;grant execute on function public.retry_operation(uuid) to authenticated;

create or replace function public.invoice_operation_jobs() returns trigger
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 -- Imported Paraşüt history and reconciliation are bookkeeping, not new customer mail/issuance consent.
 if new.source<>'panel' or public.ganu_flag('parasut_payment') then return null;end if;
 if new.status='ödendi' and (tg_op='INSERT' or old.status is distinct from new.status) then
  insert into operation_jobs(dedupe_key,kind,customer_id,contract_id,invoice_id) values('einvoice_issue:'||new.id,'einvoice_issue',new.customer_id,new.contract_id,new.id) on conflict(dedupe_key) do nothing;
 end if;
 if new.einvoice_status='kesildi' and new.einvoice_pdf like 'secure:customers/'||new.customer_id||'/%' and (tg_op='INSERT' or old.einvoice_pdf is distinct from new.einvoice_pdf or old.einvoice_status is distinct from new.einvoice_status) then
  insert into operation_jobs(dedupe_key,kind,customer_id,contract_id,invoice_id) values('einvoice_pdf:'||new.id,'einvoice_pdf',new.customer_id,new.contract_id,new.id) on conflict(dedupe_key) do nothing;
 end if;return null;
end $$;
revoke all on function public.invoice_operation_jobs() from public,anon,authenticated;
drop trigger if exists invoice_operation_jobs on public.invoices;
create trigger invoice_operation_jobs after insert or update on public.invoices for each row execute function public.invoice_operation_jobs();

create or replace function public.mark_invoice_paid_manual(p_invoice uuid, p_paid_date date, p_method text, p_amount numeric, p_reference text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare inv public.invoices;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Fatura bulunamadı'; end if;
  if inv.status = 'ödendi' then
    if inv.payment_reference=p_reference and inv.paid_date=p_paid_date and inv.payment_method=p_method and inv.amount=p_amount then return;end if;
    raise exception 'Fatura farklı bir ödeme kanıtıyla zaten ödendi';
  end if;
  if inv.payment_review is not null then raise exception 'PayTR ödeme incelemesi açık; önce inceleyin'; end if;
  if p_method is null or p_method not in ('havale','nakit','diğer') then raise exception 'Ödeme yöntemi havale, nakit ya da diğer olmalı'; end if;
  if p_amount is distinct from inv.amount then raise exception 'Tutar fatura tutarına eşit olmalı (kısmi ödeme desteklenmiyor)'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Banka işlem referansı ya da makbuz numarası zorunlu'; end if;
  if p_paid_date is null or p_paid_date > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Ödeme tarihi boş ya da ileri tarihli'; end if;
  perform set_config('ganu.manual_payment', 'on', true);
  update public.invoices set status = 'ödendi', paid_date = p_paid_date, payment_method = p_method, payment_reference = btrim(p_reference),
         payment_verified_by = auth.uid(), payment_verified_at = now()
   where id = p_invoice;
  perform set_config('ganu.manual_payment', '', true);
end $$;
create or replace function public.activate_customer(p_customer uuid, p_contract uuid, p_document uuid) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare cu public.customers; ct public.contracts;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into cu from public.customers where id = p_customer for update;
  if not found then raise exception 'Müşteri bulunamadı'; end if;
  select * into ct from public.contracts where id = p_contract and customer_id = p_customer for update;
  if not found then raise exception 'Sözleşme bu müşteriye ait değil'; end if;
  if ct.status not in ('hazırlık','aktif') then raise exception 'Bu sözleşme aktifleştirilemez (%)', ct.status; end if;
  if not public.signed_document_ok(p_customer, p_document) then
    raise exception 'İmzalı sözleşme belgesi bu müşteriye ait değil, "Sözleşme" türünde değil ya da dosyası yüklenmemiş';
  end if;
  if not exists(select 1 from (select * from public.invoices where contract_id=p_contract order by service_period_start nulls last,created_at limit 1) i where i.customer_id=p_customer and i.status='ödendi' and i.payment_review is null and i.amount>0) then raise exception 'Peşin ödeme doğrulanmadan adres aktifleştirilemez';end if;
  if not exists(select 1 from public.documents d join storage.objects o on o.bucket_id='secure-docs' and o.name=substr(d.file_url,8) where d.customer_id=p_customer and d.type='isyeri_kullanim' and d.file_url like 'secure:customers/'||p_customer||'/%') then raise exception 'İşyeri/adres kullanım belgesi yüklenmeli';end if;
  perform set_config('ganu.activate', 'on', true);
  update public.contracts set status = 'aktif', signed_document_id = p_document, signed_verified_at = now(), signed_verified_by = auth.uid()
   where id = p_contract;
  if cu.status <> 'aktif' then
    update public.customers set status = 'aktif' where id = p_customer;
  end if;
  perform set_config('ganu.activate', '', true);
end $$;
