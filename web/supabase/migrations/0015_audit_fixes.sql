-- 0015 — Süreç denetimi (10.10.2026, ChatGPT 5 tur) düzeltmeleri. Yalnız ekleme ve fonksiyon değişikliği; mevcut satırlar
-- yerinde kalır. Ticari/hukuki olaylar yazılım durumlarından ayrılır:
--   • teklif: gönderim personelce işaretlenir, gönderilmiş teklif değişmez, revizyon yeni numaradır, süresi geçmiş kabul edilmez;
--   • sözleşme: yenileme eski dönemi değiştirmez, yeni dönem satırı açar (previous_contract_id);
--   • fatura: hizmet dönemi + dönem başına tek fatura; elle tahsilat banka referansı, elle e-belge ETTN ister;
--   • damga vergisi: kabulde taslak; imzalı belgeyle kesinleşir; beyan ve vergi ödemesi ayrı izlenir;
--   • tebligat: girişim/teslim ayrımı, bildirim kanıtı olmadan kapanmaz, imha edilemez;
--   • ayrılış ve KVKK aydınlatma/UETS bildirimi müşteri üzerinde izlenir.

-- Takvim kuralı (tek yer): n ay sonraki aynı günün bir öncesi; o gün yoksa hedef ayın son günü.
-- 09.10.2026+12 → 08.10.2027 · 31.01.2026+1 → 28.02.2026 · 31.01.2026+12 → 30.01.2027
create or replace function public.term_end(p_start date, p_months integer) returns date
language plpgsql immutable set search_path = pg_catalog as $$
declare
  first_day date := (date_trunc('month', p_start) + make_interval(months => p_months))::date;
  last_day date := (date_trunc('month', p_start) + make_interval(months => p_months + 1) - interval '1 day')::date;
  d integer := extract(day from p_start)::integer;
begin
  if p_start is null or p_months is null or p_months < 1 then return null; end if;
  if d > extract(day from last_day)::integer then return last_day; end if;
  return first_day + (d - 2);
end $$;
grant execute on function public.term_end(date, integer) to authenticated;

-- ---------------------------------------------------------------- Teklif
alter table public.quotes add column if not exists replaces_quote_id uuid references public.quotes(id) on delete set null;
alter table public.quotes add column if not exists superseded_at timestamptz;
alter table public.quotes add column if not exists sent_channel text;
alter table public.quotes drop constraint if exists quotes_sent_channel_check;
alter table public.quotes add constraint quotes_sent_channel_check check (sent_channel is null or sent_channel in ('whatsapp','e-posta','elden','diğer'));
create unique index if not exists quotes_one_direct_revision on public.quotes(replaces_quote_id) where replaces_quote_id is not null;

-- Gönderilmiş ya da kabul edilmiş teklifin ticari koşulları değişmez (iletişim bilgisi düzeltilebilir).
create or replace function public.quotes_freeze() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if old.status in ('gönderildi','kabul') and (
       new.title is distinct from old.title or new.package is distinct from old.package
    or new.billing_period is distinct from old.billing_period or new.term_months is distinct from old.term_months
    or new.list_price is distinct from old.list_price or new.discount_pct is distinct from old.discount_pct
    or new.price is distinct from old.price or new.bni is distinct from old.bni or new.valid_until is distinct from old.valid_until
    or new.notes is distinct from old.notes or new.tax_no is distinct from old.tax_no or new.tc is distinct from old.tc) then
    raise exception 'Gönderilmiş teklif değiştirilemez; revizyon açın' using errcode = 'check_violation';
  end if;
  if new.status = 'kabul' and old.status is distinct from 'kabul' and new.contract_id is null then
    raise exception 'Teklif yalnız müşteriye dönüştürülerek kabul edilir' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists quotes_freeze on public.quotes;
create trigger quotes_freeze before update on public.quotes for each row execute function public.quotes_freeze();

-- Personel teklifi gerçekten gönderdiğinde işaretler; revizyonsa önceki teklif aynı işlemde geçersizleşir.
create or replace function public.mark_quote_sent(p_quote uuid, p_channel text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare q public.quotes;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Teklif bulunamadı'; end if;
  if q.status <> 'taslak' then raise exception 'Yalnız taslak teklif gönderildi olarak işaretlenir'; end if;
  if q.valid_until is null or q.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'Geçerlilik tarihi boş ya da geçmiş';
  end if;
  update public.quotes set status = 'gönderildi', sent_at = now(), sent_channel = p_channel where id = p_quote;
  if q.replaces_quote_id is not null then
    update public.quotes set superseded_at = now(), status = 'red', decided_at = coalesce(decided_at, now())
     where id = q.replaces_quote_id and status in ('taslak','gönderildi');
  end if;
end $$;
revoke all on function public.mark_quote_sent(uuid, text) from public, anon;
grant execute on function public.mark_quote_sent(uuid, text) to authenticated;

-- ---------------------------------------------------------------- Sözleşme, fatura dönemi
alter table public.contracts add column if not exists previous_contract_id uuid references public.contracts(id) on delete restrict;
alter table public.contracts add column if not exists renewal_basis text;
alter table public.contracts add column if not exists price_notice_at date;
alter table public.contracts drop constraint if exists contracts_renewal_basis_check;
alter table public.contracts add constraint contracts_renewal_basis_check check (renewal_basis is null or renewal_basis in ('otomatik_madde','yeni_imza'));
create unique index if not exists contracts_one_successor on public.contracts(previous_contract_id) where previous_contract_id is not null;

alter table public.invoices add column if not exists service_period_start date;
alter table public.invoices add column if not exists service_period_end date;
alter table public.invoices drop constraint if exists invoices_service_period_check;
alter table public.invoices add constraint invoices_service_period_check check (
  (service_period_start is null and service_period_end is null)
  or (service_period_start is not null and service_period_end is not null and service_period_end >= service_period_start));
create unique index if not exists invoices_one_per_period on public.invoices(contract_id, service_period_start) where service_period_start is not null;

-- Elle tahsilat ve elle e-belge kanıtı.
alter table public.invoices add column if not exists payment_reference text;
alter table public.invoices add column if not exists payment_verified_by uuid;
alter table public.invoices add column if not exists payment_verified_at timestamptz;
alter table public.invoices add column if not exists einvoice_verified_by uuid;
alter table public.invoices add column if not exists einvoice_verified_at timestamptz;
create unique index if not exists invoices_einvoice_uuid_unique on public.invoices(lower(einvoice_uuid)) where einvoice_uuid is not null and einvoice_uuid <> '';

-- Ödendi geçişi kanıt ister: PayTR bildirimi (paytr_merchant_oid) ya da banka/makbuz referansı.
create or replace function public.invoices_paid_needs_proof() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.status = 'ödendi' and (tg_op = 'INSERT' or old.status is distinct from 'ödendi')
     and new.paytr_merchant_oid is null and coalesce(btrim(new.payment_reference), '') = '' then
    raise exception 'Ödeme kanıtı (banka referansı) olmadan fatura ödendi yapılamaz' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists invoices_paid_needs_proof on public.invoices;
create trigger invoices_paid_needs_proof before insert or update on public.invoices for each row execute function public.invoices_paid_needs_proof();

create or replace function public.mark_invoice_paid_manual(p_invoice uuid, p_paid_date date, p_method text, p_amount numeric, p_reference text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare inv public.invoices;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Fatura bulunamadı'; end if;
  if inv.status = 'ödendi' then raise exception 'Fatura zaten ödendi'; end if;
  if inv.payment_review is not null then raise exception 'PayTR ödeme incelemesi açık; önce inceleyin'; end if;
  if p_method is null or p_method not in ('havale','nakit','diğer') then raise exception 'Ödeme yöntemi havale, nakit ya da diğer olmalı'; end if;
  if p_amount is distinct from inv.amount then raise exception 'Tutar fatura tutarına eşit olmalı (kısmi ödeme desteklenmiyor)'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Banka işlem referansı ya da makbuz numarası zorunlu'; end if;
  if p_paid_date is null or p_paid_date > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Ödeme tarihi boş ya da ileri tarihli'; end if;
  update public.invoices set status = 'ödendi', paid_date = p_paid_date, payment_method = p_method, payment_reference = btrim(p_reference),
         payment_verified_by = auth.uid(), payment_verified_at = now()
   where id = p_invoice;
end $$;
revoke all on function public.mark_invoice_paid_manual(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.mark_invoice_paid_manual(uuid, date, text, numeric, text) to authenticated;

-- Paraşüt arayüzünde kesilmiş belgeyi faturaya bağlar (yeni belge kesmez). einvoice_claim 'kesildi' + parasut_invoice_id
-- boş satırı yeniden almadığı için bu belge panelden ikinci kez kesilmez.
create or replace function public.register_manual_einvoice(p_invoice uuid, p_kind text, p_no text, p_issue date, p_ettn text, p_pdf text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare inv public.invoices;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into inv from public.invoices where id = p_invoice for update;
  if not found then raise exception 'Fatura bulunamadı'; end if;
  if inv.einvoice_status in ('kesildi','işleniyor') then raise exception 'Bu faturanın e-belgesi zaten kayıtlı ya da işleniyor'; end if;
  if p_kind not in ('e-arşiv','e-fatura') then raise exception 'Belge türü e-arşiv ya da e-fatura olmalı'; end if;
  if coalesce(btrim(p_no), '') = '' then raise exception 'Belge numarası zorunlu'; end if;
  if p_ettn is null or p_ettn !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'ETTN 36 karakterlik UUID olmalı'; end if;
  if p_issue is null or p_issue > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Belge tarihi boş ya da ileri tarihli'; end if;
  if coalesce(p_pdf, '') !~ '^secure:' then raise exception 'Belgenin PDF dosyası yüklenmeli'; end if;
  update public.invoices set einvoice_kind = p_kind, einvoice_no = btrim(p_no), issue_date = p_issue, einvoice_uuid = lower(p_ettn),
         einvoice_pdf = p_pdf, einvoice_status = 'kesildi', einvoice_error = null, einvoice_verified_by = auth.uid(), einvoice_verified_at = now()
   where id = p_invoice;
end $$;
revoke all on function public.register_manual_einvoice(uuid, text, text, date, text, text) from public, anon;
grant execute on function public.register_manual_einvoice(uuid, text, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------- Damga vergisi kâğıt durumu
alter table public.stamp_taxes alter column doc_date drop not null;
alter table public.stamp_taxes add column if not exists paper_status text not null default 'taslak';
alter table public.stamp_taxes add column if not exists signed_document_id uuid references public.documents(id) on delete set null;
alter table public.stamp_taxes add column if not exists filed_at date;
alter table public.stamp_taxes add column if not exists tax_paid_at date;
alter table public.stamp_taxes drop constraint if exists stamp_taxes_paper_status_check;
alter table public.stamp_taxes add constraint stamp_taxes_paper_status_check check (paper_status in ('taslak','imzalı','beyan_edildi','ödendi'));
alter table public.stamp_taxes drop constraint if exists stamp_taxes_signed_needs_date;
alter table public.stamp_taxes add constraint stamp_taxes_signed_needs_date check (paper_status = 'taslak' or doc_date is not null) not valid;

-- Beyan edilmiş kaydın matrahı, oranı ve belge tarihi sessizce değişmez.
create or replace function public.stamp_taxes_freeze() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if old.paper_status in ('beyan_edildi','ödendi') and (new.base is distinct from old.base or new.rate_per_mille is distinct from old.rate_per_mille
     or new.doc_date is distinct from old.doc_date or new.party_title is distinct from old.party_title) then
    raise exception 'Beyan edilmiş damga vergisi kaydı değiştirilemez' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists stamp_taxes_freeze on public.stamp_taxes;
create trigger stamp_taxes_freeze before update on public.stamp_taxes for each row execute function public.stamp_taxes_freeze();

-- ---------------------------------------------------------------- Tebligat ve posta
alter table public.mail_items add column if not exists issuer text;
alter table public.mail_items add column if not exists reference_no text;
alter table public.mail_items add column if not exists attempted_at timestamptz;
alter table public.mail_items add column if not exists legal_result text;
alter table public.mail_items add column if not exists receiver_capacity text;
alter table public.mail_items add column if not exists notified_at timestamptz;
alter table public.mail_items add column if not exists notify_channel text;
alter table public.mail_items drop constraint if exists mail_items_legal_result_check;
alter table public.mail_items add constraint mail_items_legal_result_check check (legal_result is null or legal_result in ('teslim_alındı','teslim_girişimi','iade','diğer'));
alter table public.mail_items drop constraint if exists mail_items_tebligat_not_destroyed;
alter table public.mail_items add constraint mail_items_tebligat_not_destroyed check (not (type = 'tebligat' and status = 'imha')) not valid;

-- Bildirim zamanı sunucuda damgalanır; tebligat bildirim kaydı olmadan teslim/yönlendirme ile kapanmaz.
create or replace function public.mail_items_notice() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
declare moved boolean := tg_op = 'INSERT' or old.status is distinct from new.status;
begin
  if moved and new.status = 'bildirildi' and new.notified_at is null then new.notified_at := now(); end if;
  if moved and new.type = 'tebligat' and new.status in ('teslim','yönlendirildi') and new.notified_at is null then
    raise exception 'Tebligat müşteriye bildirilmeden kapatılamaz' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists mail_items_notice on public.mail_items;
create trigger mail_items_notice before insert or update on public.mail_items for each row execute function public.mail_items_notice();

-- ---------------------------------------------------------------- Müşteri: ayrılış, KVKK aydınlatma, e-tebligat sorumluluğu
alter table public.customers add column if not exists termination_notice_at date;
alter table public.customers add column if not exists service_last_day date;
alter table public.customers add column if not exists address_change_filed_at date;
alter table public.customers add column if not exists address_change_verified_at date;
alter table public.customers add column if not exists mail_handover_at date;
alter table public.customers add column if not exists privacy_notice_version text;
alter table public.customers add column if not exists privacy_notice_delivered_at date;
alter table public.customers add column if not exists etebligat_informed_at date;

-- ---------------------------------------------------------------- Teklif dönüştürme (kontroller + dönem + taslak damga)
create or replace function public.convert_quote(p_quote uuid, p_customer jsonb, p_contract jsonb, p_invoice jsonb default null, p_stamp jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_catalog as $$
declare
  q public.quotes; cu public.customers; ct public.contracts; inv public.invoices; st public.stamp_taxes;
  c_id uuid; k_id uuid; i_id uuid; s_id uuid; v_start date; v_end date; v_first_end date;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Teklif bulunamadı'; end if;
  if q.contract_id is not null then raise exception 'Bu teklif zaten müşteriye dönüştürülmüş'; end if;
  if q.status <> 'gönderildi' or q.superseded_at is not null or q.valid_until is null
     or q.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'Teklif gönderilmemiş, süresi geçmiş ya da revize edilmiş';
  end if;

  if nullif(p_customer->>'id', '') is not null then
    c_id := (p_customer->>'id')::uuid;
    if not exists (select 1 from public.customers where id = c_id) then raise exception 'Müşteri bulunamadı'; end if;
  else
    cu := jsonb_populate_record(null::public.customers, p_customer - 'id');
    insert into public.customers(title, contact, email, phone, tax_no, tc, tax_office, address, city, district, status, partner_id, bni, notes)
    values (cu.title, cu.contact, cu.email, cu.phone, cu.tax_no, cu.tc, cu.tax_office, cu.address, cu.city, cu.district,
            coalesce(cu.status, 'aktif'), cu.partner_id, coalesce(cu.bni, q.bni, false), cu.notes)
    returning id into c_id;
  end if;

  ct := jsonb_populate_record(null::public.contracts, p_contract);
  v_start := ct.start_date;
  if v_start is null then raise exception 'Sözleşme başlangıç tarihi zorunlu'; end if;
  v_end := public.term_end(v_start, q.term_months);           -- bitiş sunucuda hesaplanır; istemci değeri yok sayılır
  insert into public.contracts(customer_id, package, billing_period, start_date, end_date, price, status, auto_renew)
  values (c_id, q.package, q.billing_period, v_start, v_end, q.price, 'aktif', coalesce(ct.auto_renew, false))
  returning id into k_id;

  if p_invoice is not null then
    inv := jsonb_populate_record(null::public.invoices, p_invoice);
    v_first_end := least(v_end, public.term_end(v_start, case when q.billing_period = 'aylık' then 1 else 12 end));
    insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
    values (c_id, k_id, q.price, coalesce(inv.issue_date, v_start), coalesce(inv.due_date, coalesce(inv.issue_date, v_start) + 7), 'bekliyor', inv.note, v_start, v_first_end)
    returning id into i_id;
  end if;

  if p_stamp is not null then
    st := jsonb_populate_record(null::public.stamp_taxes, p_stamp);
    insert into public.stamp_taxes(customer_id, contract_id, party_title, party_tax_id, kind, paper_status, doc_date, period_start, period_end,
                                   base, rate_per_mille, payer, notes)
    select c_id, k_id, c.title, coalesce(nullif(c.tax_no, ''), nullif(c.tc, '')), 'sözleşme', 'taslak', null, v_start, v_end,
           st.base, coalesce(st.rate_per_mille, 9.48), coalesce(st.payer, 'müşteri'), st.notes
      from public.customers c where c.id = c_id
    returning id into s_id;
  end if;

  update public.quotes set status = 'kabul', customer_id = c_id, contract_id = k_id, decided_at = coalesce(decided_at, now())
   where id = p_quote;
  return jsonb_build_object('customer_id', c_id, 'contract_id', k_id, 'invoice_id', i_id, 'stamp_tax_id', s_id);
end $$;
revoke all on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- Yenileme (eski dönem değişmez)
-- p_basis: 'otomatik_madde' (sözleşmedeki kendiliğinden yenileme; yeni damga vergisi kâğıdı yok) | 'yeni_imza' (yeni imzalı
-- sözleşme; taslak damga kaydı açılır). Fiyat artışı yalnız sözleşmedeki bildirim süresi (≥45 gün) kanıtlanırsa uygulanır.
create or replace function public.renew_contract(p_contract uuid, p_basis text, p_price numeric, p_price_notice_at date default null, p_months integer default 12)
returns jsonb language plpgsql security invoker set search_path = public, pg_catalog as $$
declare old public.contracts; k_id uuid; i_id uuid; s_id uuid; v_start date; v_end date; cu public.customers;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into old from public.contracts where id = p_contract for update;
  if not found then raise exception 'Sözleşme bulunamadı'; end if;
  if exists (select 1 from public.contracts where previous_contract_id = p_contract) then raise exception 'Bu dönem zaten yenilenmiş'; end if;
  if p_basis not in ('otomatik_madde','yeni_imza') then raise exception 'Yenileme dayanağı otomatik_madde ya da yeni_imza olmalı'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Yeni dönem bedeli zorunlu'; end if;
  if p_months is null or p_months < 1 or p_months > 60 then raise exception 'Süre 1-60 ay olmalı'; end if;
  if p_basis = 'otomatik_madde' and p_price > old.price and (p_price_notice_at is null or p_price_notice_at > old.end_date - 45) then
    raise exception 'Otomatik yenilemede fiyat artışı için en az 45 gün önce yapılmış bildirim tarihi gerekli';
  end if;
  v_start := old.end_date + 1;
  v_end := public.term_end(v_start, p_months);
  insert into public.contracts(customer_id, package, billing_period, start_date, end_date, price, status, auto_renew, previous_contract_id, renewal_basis, price_notice_at)
  values (old.customer_id, old.package, old.billing_period, v_start, v_end, p_price, 'aktif', old.auto_renew, old.id, p_basis, p_price_notice_at)
  returning id into k_id;
  -- Eski dönem dokunulmadan kalır (bitiş tarihinde kendiliğinden sona erer); yenilendiği previous_contract_id'den anlaşılır.
  if old.billing_period = 'yıllık' then
    insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
    values (old.customer_id, k_id, p_price, v_start, v_start + 7, 'bekliyor', old.package || ' · yenileme · ' || to_char(v_start, 'YYYY-MM'),
            v_start, least(v_end, public.term_end(v_start, 12)))
    returning id into i_id;
  end if;
  if p_basis = 'yeni_imza' then
    select * into cu from public.customers where id = old.customer_id;
    insert into public.stamp_taxes(customer_id, contract_id, party_title, party_tax_id, kind, paper_status, period_start, period_end, base, payer)
    values (old.customer_id, k_id, cu.title, coalesce(nullif(cu.tax_no, ''), nullif(cu.tc, '')), 'yenileme', 'taslak', v_start, v_end,
            round(p_price * (case when old.billing_period = 'aylık' then p_months else p_months / 12.0 end) / 1.2, 2), 'müşteri')
    returning id into s_id;
  end if;
  return jsonb_build_object('contract_id', k_id, 'invoice_id', i_id, 'stamp_tax_id', s_id);
end $$;
revoke all on function public.renew_contract(uuid, text, numeric, date, integer) from public, anon;
grant execute on function public.renew_contract(uuid, text, numeric, date, integer) to authenticated;

-- ---------------------------------------------------------------- Aylık faturaları hazırla (yerel kayıt; e-belge kesmez)
-- Seçilen ay içinde başlayan aylık hizmet dönemleri için bekleyen fatura kaydı açar; tekrar çalışınca mevcut satırı korur.
create or replace function public.prepare_monthly_invoices(p_month date) returns integer
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare c public.contracts; m_start date := date_trunc('month', p_month)::date; m_end date; k integer; ps date; pe date; n integer := 0; added integer;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  m_end := (m_start + interval '1 month' - interval '1 day')::date;
  for c in select * from public.contracts where billing_period = 'aylık' and status = 'aktif' and start_date <= m_end and end_date >= m_start loop
    for k in 0..60 loop
      ps := case when k = 0 then c.start_date else public.term_end(c.start_date, k) + 1 end;
      exit when ps > c.end_date or ps > m_end;
      continue when ps < m_start;
      pe := least(public.term_end(c.start_date, k + 1), c.end_date);
      insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
      values (c.customer_id, c.id, c.price, ps, ps + 7, 'bekliyor', c.package || ' · ' || to_char(ps, 'YYYY-MM') || ' dönemi', ps, pe)
      on conflict (contract_id, service_period_start) where service_period_start is not null do nothing;
      get diagnostics added = row_count; n := n + added;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.prepare_monthly_invoices(date) from public, anon;
grant execute on function public.prepare_monthly_invoices(date) to authenticated;
