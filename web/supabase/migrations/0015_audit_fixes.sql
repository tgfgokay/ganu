-- 0015 — Süreç denetimi (10.10.2026, ChatGPT 5 tur) düzeltmeleri. Yalnız ekleme ve fonksiyon değişikliği; mevcut satırlar
-- yerinde kalır. Ticari/hukuki olaylar yazılım durumlarından ayrılır:
--   • teklif: gönderim personelce işaretlenir, gönderilmiş teklif değişmez, revizyon yeni numaradır, süresi geçmiş kabul edilmez;
--   • sözleşme: yenileme eski dönemi değiştirmez, yeni dönem satırı açar (previous_contract_id);
--   • fatura: hizmet dönemi + dönem başına tek fatura; elle tahsilat banka referansı, elle e-belge ETTN ister;
--   • damga vergisi: kabulde taslak; imzalı belgeyle kesinleşir; beyan ve vergi ödemesi ayrı izlenir;
--   • tebligat: girişim/teslim ayrımı, bildirim kanalı olmadan bildirildi/kapanmış sayılmaz, imha edilemez;
--   • ayrılış ve KVKK aydınlatma/UETS bildirimi müşteri üzerinde izlenir; yeni müşterinin adresi imzalı sözleşmeyle aktifleşir.
-- Tur 4 kırmızı takım bulguları (NULL atlatma, aylık takvim, durum geri dönüşleri, yenileme koşulları) ve Tur 5 bulguları
-- (sahte belgeyle aktivasyon, erken/imzasız yenileme, imzasız sözleşmenin faturalanması, RPC dışı kabul/ödeme/e-belge yolu)
-- kapatıldı: kritik geçişler yalnız ilgili sunucu fonksiyonunun işlem içi bayrağıyla (ganu.*) yapılabilir; PostgREST
-- set_config'i dışarı açmadığı için panel kullanıcısı bu bayrakları kendisi koyamaz.

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

-- Aylık faturalama çapası: başlangıç gününün n ay sonraki karşılığı; o gün yoksa ayın son günü (TBK 92).
-- 31.01 → 28.02 → 31.03 → 30.04: her takvim ayına tek dönem başlangıcı düşer.
create or replace function public.billing_anchor(p_start date, p_n integer) returns date
language plpgsql immutable set search_path = pg_catalog as $$
declare first_day date := (date_trunc('month', p_start) + make_interval(months => p_n))::date;
        last_d integer := extract(day from (first_day + interval '1 month' - interval '1 day'))::integer;
begin
  return first_day + (least(extract(day from p_start)::integer, last_d) - 1);
end $$;

-- Sözleşme kaç aylık: başlangıç → bitiş (bitiş günü dahil); 09.10.2026–08.10.2027 → 12, 31.01–28.02 → 1.
create or replace function public.term_months(p_start date, p_end date) returns integer
language sql immutable set search_path = pg_catalog as $$
  select greatest(1, round((extract(year from p_end + 1) - extract(year from p_start)) * 12
       + (extract(month from p_end + 1) - extract(month from p_start))
       + (extract(day from p_end + 1) - extract(day from p_start)) / 30.0)::integer)
$$;

-- İşlem içi yetki bayrakları: yalnız bu migration'daki RPC'ler açar (set_config(..., true) işlem sonunda düşer).
create or replace function public.ganu_flag(p_name text) returns boolean
language sql stable set search_path = pg_catalog as $$ select coalesce(current_setting('ganu.' || p_name, true), '') = 'on' $$;
create or replace function public.ganu_api_role() returns boolean
language sql stable set search_path = public, pg_catalog as $$ select coalesce(auth.role(), '') in ('authenticated','anon','service_role') $$;
-- Tetikleyiciler işlemi yapan rolün yetkisiyle çalışır; okuma yardımcıları bu yüzden personele açıktır (bayrak koyamazlar).
revoke all on function public.ganu_flag(text) from public, anon;
revoke all on function public.ganu_api_role() from public, anon;
grant execute on function public.ganu_flag(text), public.ganu_api_role() to authenticated, service_role;

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
  -- Kabul ve müşteri/sözleşme bağlantısı yalnız convert_quote ile kurulur (yabancı anahtarın NULL'a çekilmesi serbest).
  if (new.status = 'kabul' and old.status is distinct from 'kabul')
     or (new.contract_id is not null and new.contract_id is distinct from old.contract_id)
     or (new.customer_id is not null and new.customer_id is distinct from old.customer_id) then
    if not public.ganu_flag('convert') then
      raise exception 'Teklif yalnız müşteriye dönüştürülerek kabul edilir' using errcode = 'check_violation';
    end if;
  end if;
  -- Tek yönlü durumlar: taslak → gönderildi | red; gönderildi → kabul | red; kabul ve red kapanır.
  if new.status is distinct from old.status and not (
       (old.status = 'taslak' and new.status in ('gönderildi','red'))
    or (old.status = 'gönderildi' and new.status in ('kabul','red'))) then
    raise exception 'Teklif durumu % → % değiştirilemez', old.status, new.status using errcode = 'check_violation';
  end if;
  if old.superseded_at is not null and new.superseded_at is null then
    raise exception 'Revize edilmiş teklif geri alınamaz' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists quotes_freeze on public.quotes;
create trigger quotes_freeze before update on public.quotes for each row execute function public.quotes_freeze();

-- Personel teklifi gerçekten gönderdiğinde işaretler; revizyonsa önceki teklif aynı işlemde geçersizleşir.
create or replace function public.mark_quote_sent(p_quote uuid, p_channel text) returns void
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare q public.quotes; prev public.quotes;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if not found then raise exception 'Teklif bulunamadı'; end if;
  if q.status <> 'taslak' then raise exception 'Yalnız taslak teklif gönderildi olarak işaretlenir'; end if;
  if q.valid_until is null or q.valid_until < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'Geçerlilik tarihi boş ya da geçmiş';
  end if;
  if p_channel is null or p_channel not in ('whatsapp','e-posta','elden','diğer') then raise exception 'Gönderim kanalı zorunlu'; end if;
  if q.replaces_quote_id is not null then
    -- Önceki teklif kilitlenir; kabul edilmişse revizyon gönderilemez (işlem bütünüyle geri alınır).
    select * into prev from public.quotes where id = q.replaces_quote_id for update;
    if found and prev.status = 'kabul' then raise exception 'Önceki teklif kabul edilmiş; revizyon gönderilemez'; end if;
    update public.quotes set superseded_at = now() where id = q.replaces_quote_id and superseded_at is null;
  end if;
  update public.quotes set status = 'gönderildi', sent_at = now(), sent_channel = p_channel where id = p_quote;
end $$;
revoke all on function public.mark_quote_sent(uuid, text) from public, anon;
grant execute on function public.mark_quote_sent(uuid, text) to authenticated;

-- ---------------------------------------------------------------- Sözleşme, fatura dönemi
alter table public.contracts add column if not exists previous_contract_id uuid references public.contracts(id);  -- NO ACTION: devamı olan dönem tek başına silinemez
alter table public.contracts add column if not exists renewal_basis text;
alter table public.contracts add column if not exists price_notice_at date;
alter table public.contracts drop constraint if exists contracts_renewal_basis_check;
alter table public.contracts add constraint contracts_renewal_basis_check check (renewal_basis is null or renewal_basis in ('otomatik_madde','yeni_imza'));
create unique index if not exists contracts_one_successor on public.contracts(previous_contract_id) where previous_contract_id is not null;
-- İmzalı sözleşme doğrulaması: hangi belge, kim, ne zaman. 'hazırlık' sözleşme imza doğrulanınca 'aktif' olur.
alter table public.contracts add column if not exists signed_document_id uuid references public.documents(id) on delete set null;
alter table public.contracts add column if not exists signed_verified_at timestamptz;
alter table public.contracts add column if not exists signed_verified_by uuid;

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
-- PayTR yolu: paytr_merchant_oid yalnız imzası doğrulanmış bildirimi işleyen paytr_mark_paid (service role) tarafından yazılır.
-- Elle yol: mark_invoice_paid_manual banka referansı + doğrulayan personel yazar.
create or replace function public.invoices_paid_needs_proof() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.status = 'ödendi' and (tg_op = 'INSERT' or old.status is distinct from 'ödendi') and not (
       (new.paytr_merchant_oid is not null and coalesce(auth.role(), '') = 'service_role')
    or (coalesce(btrim(new.payment_reference), '') <> '' and new.payment_verified_by is not null and (public.ganu_flag('manual_payment') or not public.ganu_api_role()))) then
    raise exception 'Ödeme kanıtı olmadan fatura ödendi yapılamaz (PayTR bildirimi ya da banka referansı)' using errcode = 'check_violation';
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
  perform set_config('ganu.manual_payment', 'on', true);
  update public.invoices set status = 'ödendi', paid_date = p_paid_date, payment_method = p_method, payment_reference = btrim(p_reference),
         payment_verified_by = auth.uid(), payment_verified_at = now()
   where id = p_invoice;
  perform set_config('ganu.manual_payment', '', true);
end $$;
revoke all on function public.mark_invoice_paid_manual(uuid, date, text, numeric, text) from public, anon;
grant execute on function public.mark_invoice_paid_manual(uuid, date, text, numeric, text) to authenticated;

-- e-Belge 'kesildi' yalnız issue-einvoice (service role) ya da register_manual_einvoice ile işaretlenir.
create or replace function public.invoices_einvoice_guard() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.einvoice_status = 'kesildi' and (tg_op = 'INSERT' or old.einvoice_status is distinct from 'kesildi')
     and coalesce(auth.role(), '') in ('authenticated','anon') and not public.ganu_flag('manual_einvoice') then
    raise exception 'e-Belge yalnız Paraşüt üzerinden ya da "Elle kesildi" kaydıyla (ETTN + PDF) kesildi olur' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists invoices_einvoice_guard on public.invoices;
create trigger invoices_einvoice_guard before insert or update on public.invoices for each row execute function public.invoices_einvoice_guard();

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
  if p_kind is null or p_kind not in ('e-arşiv','e-fatura') then raise exception 'Belge türü e-arşiv ya da e-fatura olmalı'; end if;
  if coalesce(btrim(p_no), '') = '' then raise exception 'Belge numarası zorunlu'; end if;
  if p_ettn is null or p_ettn !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'ETTN 36 karakterlik UUID olmalı'; end if;
  if p_issue is null or p_issue > (now() at time zone 'Europe/Istanbul')::date then raise exception 'Belge tarihi boş ya da ileri tarihli'; end if;
  if coalesce(p_pdf, '') !~ '^secure:' or not exists (select 1 from storage.objects o where o.bucket_id = 'secure-docs' and o.name = substr(p_pdf, 8)) then
    raise exception 'Belgenin PDF dosyası yüklenmeli';
  end if;
  perform set_config('ganu.manual_einvoice', 'on', true);
  update public.invoices set einvoice_kind = p_kind, einvoice_no = btrim(p_no), issue_date = p_issue, einvoice_uuid = lower(p_ettn),
         due_date = case when status = 'ödendi' then due_date else p_issue + 7 end,
         einvoice_pdf = p_pdf, einvoice_status = 'kesildi', einvoice_error = null, einvoice_verified_by = auth.uid(), einvoice_verified_at = now()
   where id = p_invoice;
  perform set_config('ganu.manual_einvoice', '', true);
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
  -- Tek yönlü: taslak → imzalı (imza tarihi + imzalı belge) → beyan_edildi (beyan tarihi) → ödendi (vergi ödeme tarihi).
  if new.paper_status is distinct from old.paper_status then
    if not ((old.paper_status = 'taslak' and new.paper_status = 'imzalı') or (old.paper_status = 'imzalı' and new.paper_status = 'beyan_edildi')
         or (old.paper_status = 'beyan_edildi' and new.paper_status = 'ödendi')) then
      raise exception 'Damga vergisi durumu % → % değiştirilemez', old.paper_status, new.paper_status using errcode = 'check_violation';
    end if;
  end if;
  if new.paper_status is distinct from old.paper_status then
    if new.paper_status = 'imzalı' and (new.doc_date is null or new.signed_document_id is null
       or not public.signed_document_ok(new.customer_id, new.signed_document_id)) then
      raise exception 'İmza tarihi ve müşterinin yüklenmiş imzalı sözleşme belgesi zorunlu' using errcode = 'check_violation';
    end if;
    if new.paper_status = 'beyan_edildi' and new.filed_at is null then raise exception 'Beyan tarihi zorunlu' using errcode = 'check_violation'; end if;
    if new.paper_status = 'ödendi' and new.tax_paid_at is null then raise exception 'Vergi ödeme tarihi zorunlu' using errcode = 'check_violation'; end if;
  end if;
  if old.paper_status in ('beyan_edildi','ödendi') and (new.base is distinct from old.base or new.rate_per_mille is distinct from old.rate_per_mille
     or new.doc_date is distinct from old.doc_date or new.party_title is distinct from old.party_title) then
    raise exception 'Beyan edilmiş damga vergisi kaydı değiştirilemez' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists stamp_taxes_freeze on public.stamp_taxes;
create trigger stamp_taxes_freeze before update on public.stamp_taxes for each row execute function public.stamp_taxes_freeze();
-- Yeni kayıt doğrudan imzalı açılırsa da aynı kanıtlar istenir.
create or replace function public.stamp_taxes_insert_check() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.paper_status <> 'taslak' then raise exception 'Damga vergisi kaydı taslak açılır; imza "İmzalandı" ile işlenir' using errcode = 'check_violation'; end if;
  return new;
end $$;
drop trigger if exists stamp_taxes_insert_check on public.stamp_taxes;
create trigger stamp_taxes_insert_check before insert on public.stamp_taxes for each row execute function public.stamp_taxes_insert_check();

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
  if moved and new.type = 'tebligat' and new.status in ('bildirildi','teslim','yönlendirildi') and new.notify_channel is null then
    raise exception 'Tebligat bildirimi için kanal zorunlu (müşteriye nasıl haber verildi?)' using errcode = 'check_violation';
  end if;
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
alter table public.customers add column if not exists address_activated_at date;

-- Adres kullanımı doğrulanmış imzalı sözleşmeyle başlar: API rolleri müşteriyi 'aktif'e yalnız activate_customer ile geçirir
-- (belge müşteriye ait, "sozlesme" türünde, Storage'da mevcut ve personelce doğrulanmış). Mevcut aktif müşteriler etkilenmez.
create or replace function public.customers_activation_gate() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if new.status = 'aktif' and (tg_op = 'INSERT' or old.status is distinct from 'aktif') then
    if public.ganu_api_role() and not public.ganu_flag('activate') then
      raise exception 'Müşteri yalnız imzalı sözleşme doğrulanarak aktifleştirilir ("İmzalı sözleşmeyi doğrula")' using errcode = 'check_violation';
    end if;
    new.address_activated_at := coalesce(new.address_activated_at, (now() at time zone 'Europe/Istanbul')::date);
  end if;
  return new;
end $$;
drop trigger if exists customers_activation_gate on public.customers;
create trigger customers_activation_gate before insert or update on public.customers for each row execute function public.customers_activation_gate();

-- İmza doğrulaması ve yenileme bağı yalnız activate_customer / renew_contract ile yazılır; 'hazırlık' sözleşme
-- elle 'aktif' yapılamaz. Belge silinince signed_document_id'nin boşalması (FK set null) engellenmez.
create or replace function public.contracts_signature_guard() returns trigger
language plpgsql set search_path = public, pg_catalog as $$
begin
  if public.ganu_api_role() and not public.ganu_flag('activate') and not public.ganu_flag('renew') then
    if tg_op = 'INSERT' then
      if new.signed_verified_at is not null or new.signed_verified_by is not null or new.signed_document_id is not null
         or new.previous_contract_id is not null or new.renewal_basis is not null then
        raise exception 'İmza doğrulaması ve yenileme bağı yalnız "İmzalı sözleşmeyi doğrula" / "Yenile" ile yazılır' using errcode = 'check_violation';
      end if;
    elsif new.signed_verified_at is distinct from old.signed_verified_at or new.signed_verified_by is distinct from old.signed_verified_by
       or (new.signed_document_id is distinct from old.signed_document_id and new.signed_document_id is not null)
       or new.previous_contract_id is distinct from old.previous_contract_id or new.renewal_basis is distinct from old.renewal_basis
       or (old.status = 'hazırlık' and new.status = 'aktif') then
      raise exception 'İmza doğrulaması ve yenileme bağı yalnız "İmzalı sözleşmeyi doğrula" / "Yenile" ile yazılır' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists contracts_signature_guard on public.contracts;
create trigger contracts_signature_guard before insert or update on public.contracts for each row execute function public.contracts_signature_guard();

-- İmzalı sözleşme belgesinin müşteriye ait, sözleşme türünde ve Storage'da var olduğunu denetler.
create or replace function public.signed_document_ok(p_customer uuid, p_document uuid) returns boolean
language sql stable set search_path = public, pg_catalog as $$
  select exists (select 1 from public.documents d join storage.objects o on o.bucket_id = 'secure-docs' and o.name = substr(d.file_url, 8)
                  where d.id = p_document and d.customer_id = p_customer and d.type = 'sozlesme' and d.file_url like 'secure:%')
$$;
revoke all on function public.signed_document_ok(uuid, uuid) from public, anon;
grant execute on function public.signed_document_ok(uuid, uuid) to authenticated;

-- İmzalı sözleşmeyi doğrular: 'hazırlık' (ya da imzası doğrulanmamış aktif) sözleşmeyi belgeye bağlar ve aktif yapar;
-- müşteri aday ise adresini aktifleştirir. Mevcut (eski) aktif sözleşmelerin imzası da bununla doğrulanır.
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
  perform set_config('ganu.activate', 'on', true);
  update public.contracts set status = 'aktif', signed_document_id = p_document, signed_verified_at = now(), signed_verified_by = auth.uid()
   where id = p_contract;
  if cu.status <> 'aktif' then
    update public.customers set status = 'aktif' where id = p_customer;
  end if;
  perform set_config('ganu.activate', '', true);
end $$;
revoke all on function public.activate_customer(uuid, uuid, uuid) from public, anon;
grant execute on function public.activate_customer(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- Teklif dönüştürme (kontroller + dönem + taslak damga)
-- Fiyat, süre, bitiş, ilk fatura (her zaman açılır, vade fatura tarihi + 7 gün) ve damga matrahı sunucuda tekliften hesaplanır;
-- istemciden yalnız müşteri bilgisi, başlangıç tarihi ve not alınır. Yeni müşteri 'aday', sözleşme 'hazırlık' açılır; ikisi
-- imzalı sözleşme activate_customer ile doğrulanınca aktifleşir. Mevcut müşteriye dönüştürmede VKN/TCKN teklifle eşleşmeli.
create or replace function public.convert_quote(p_quote uuid, p_customer jsonb, p_contract jsonb, p_invoice jsonb default null, p_stamp jsonb default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_catalog as $$
declare
  q public.quotes; cu public.customers; ct public.contracts; inv public.invoices; st public.stamp_taxes; ex public.customers;
  c_id uuid; k_id uuid; i_id uuid; s_id uuid; v_start date; v_end date; v_first_end date; v_issue date; v_periods numeric;
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
    select * into ex from public.customers where id = (p_customer->>'id')::uuid;
    if not found then raise exception 'Müşteri bulunamadı'; end if;
    if coalesce(nullif(q.tax_no, ''), nullif(q.tc, '')) is not null
       and coalesce(nullif(q.tax_no, ''), nullif(q.tc, '')) is distinct from coalesce(nullif(ex.tax_no, ''), nullif(ex.tc, '')) then
      raise exception 'Teklifteki VKN/TCKN seçilen müşteriyle eşleşmiyor';
    end if;
    c_id := ex.id;
  else
    cu := jsonb_populate_record(null::public.customers, p_customer - 'id');
    if coalesce(btrim(cu.title), '') = '' then raise exception 'Müşteri ünvanı zorunlu'; end if;
    insert into public.customers(title, contact, email, phone, tax_no, tc, tax_office, address, city, district, status, partner_id, bni, notes)
    values (cu.title, cu.contact, cu.email, cu.phone, cu.tax_no, cu.tc, cu.tax_office, cu.address, cu.city, cu.district,
            'aday', cu.partner_id, coalesce(cu.bni, q.bni, false), cu.notes)
    returning id into c_id;
  end if;

  ct := jsonb_populate_record(null::public.contracts, p_contract);
  v_start := ct.start_date;
  if v_start is null then raise exception 'Sözleşme başlangıç tarihi zorunlu'; end if;
  v_end := public.term_end(v_start, q.term_months);
  -- Hizmet sözleşmesi şablonu (Madde 6.2) kendiliğinden yenileme içerir; ayar sözleşmeden farklıysa sözleşme sayfasından değiştirilir.
  -- Sözleşme imza doğrulanana kadar 'hazırlık'tadır (aylık fatura hazırlanmaz, yenilenmez).
  insert into public.contracts(customer_id, package, billing_period, start_date, end_date, price, status, auto_renew)
  values (c_id, q.package, q.billing_period, v_start, v_end, q.price, 'hazırlık', coalesce(ct.auto_renew, true))
  returning id into k_id;

  inv := jsonb_populate_record(null::public.invoices, coalesce(p_invoice, '{}'::jsonb));
  v_issue := v_start;
  v_first_end := case when q.billing_period = 'aylık' and q.term_months > 1 then least(v_end, public.billing_anchor(v_start, 1) - 1)
                      when q.billing_period = 'aylık' then v_end
                      else least(v_end, public.term_end(v_start, 12)) end;
  insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
  values (c_id, k_id, q.price, v_issue, v_issue + 7, 'bekliyor', inv.note, v_start, v_first_end)
  returning id into i_id;

  if p_stamp is not null then
    st := jsonb_populate_record(null::public.stamp_taxes, p_stamp);
    v_periods := case when q.billing_period = 'aylık' then q.term_months else q.term_months / 12.0 end;
    insert into public.stamp_taxes(customer_id, contract_id, party_title, party_tax_id, kind, paper_status, doc_date, period_start, period_end,
                                   base, rate_per_mille, payer, notes)
    select c_id, k_id, c.title, coalesce(nullif(c.tax_no, ''), nullif(c.tc, '')), 'sözleşme', 'taslak', null, v_start, v_end,
           round(q.price * v_periods / 1.2, 2), 9.48, coalesce(st.payer, 'müşteri'), st.notes
      from public.customers c where c.id = c_id
    returning id into s_id;
  end if;

  perform set_config('ganu.convert', 'on', true);
  update public.quotes set status = 'kabul', customer_id = c_id, contract_id = k_id, decided_at = coalesce(decided_at, now())
   where id = p_quote;
  perform set_config('ganu.convert', '', true);
  return jsonb_build_object('customer_id', c_id, 'contract_id', k_id, 'invoice_id', i_id, 'stamp_tax_id', s_id);
end $$;
revoke all on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.convert_quote(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------- Yenileme (eski dönem değişmez)
-- Yalnız imzası doğrulanmış aktif sözleşme ve aktif müşteri yenilenir.
-- 'otomatik_madde': sözleşmedeki kendiliğinden yenileme; dönem bittiği gün ya da sonrasında, auto_renew açık, fesih/yenilememe
--   bildirimi yok, 12 ay ve AYNI bedelle (fiyat değişikliği yeni imzalı sözleşmeyle). Yeni damga vergisi kâğıdı doğmaz.
-- 'yeni_imza': müşterinin yüklenmiş ve doğrulanan yeni imzalı sözleşmesiyle (p_signed_document); taslak damga kaydı açılır.
-- Yıllık dönemlerde süre 12 ay; yıllıkta yeni dönem faturası açılır, aylıkta "aylık faturaları hazırla" kullanılır.
create or replace function public.renew_contract(p_contract uuid, p_basis text, p_price numeric, p_price_notice_at date default null,
                                                 p_months integer default 12, p_signed_document uuid default null)
returns jsonb language plpgsql security invoker set search_path = public, pg_catalog as $$
declare old public.contracts; cu public.customers; k_id uuid; i_id uuid; s_id uuid; v_start date; v_end date; v_periods numeric;
        today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if p_basis is null or p_basis not in ('otomatik_madde','yeni_imza') then raise exception 'Geçerli yenileme dayanağı zorunlu'; end if;
  select * into old from public.contracts where id = p_contract for update;
  if not found then raise exception 'Sözleşme bulunamadı'; end if;
  if exists (select 1 from public.contracts where previous_contract_id = p_contract) then raise exception 'Bu dönem zaten yenilenmiş'; end if;
  select * into cu from public.customers where id = old.customer_id;
  if old.status <> 'aktif' or old.signed_verified_at is null or cu.status <> 'aktif' then
    raise exception 'Yalnız imzası doğrulanmış aktif sözleşme ve aktif müşteri yenilenir';
  end if;
  if p_price is null or p_price <= 0 then raise exception 'Yeni dönem bedeli zorunlu'; end if;
  if p_months is null or p_months < 1 or p_months > 60 then raise exception 'Süre 1-60 ay olmalı'; end if;
  if old.billing_period = 'yıllık' and p_months <> 12 then raise exception 'Yıllık faturalı sözleşme 12 ay yenilenir'; end if;
  if p_basis = 'otomatik_madde' then
    if not old.auto_renew then raise exception 'Sözleşmede kendiliğinden yenileme açık değil; yeni imzalı sözleşme gerekir'; end if;
    if cu.termination_notice_at is not null then raise exception 'Müşterinin fesih/yenilememe bildirimi kayıtlı'; end if;
    if today < old.end_date then raise exception 'Kendiliğinden yenileme dönemin bittiği gün ya da sonrasında yapılır (%)', to_char(old.end_date, 'DD.MM.YYYY'); end if;
    if p_months <> 12 then raise exception 'Kendiliğinden yenileme 12 aydır'; end if;
    if p_price <> old.price then raise exception 'Kendiliğinden yenilemede bedel değişmez; fiyat değişikliği yeni imzalı sözleşmeyle yapılır'; end if;
  else
    if p_signed_document is null or not public.signed_document_ok(old.customer_id, p_signed_document) then
      raise exception 'Yeni imzalı sözleşme belgesi yüklenmeli ve seçilmeli';
    end if;
  end if;
  v_start := old.end_date + 1;
  v_end := public.term_end(v_start, p_months);
  perform set_config('ganu.renew', 'on', true);
  insert into public.contracts(customer_id, package, billing_period, start_date, end_date, price, status, auto_renew, previous_contract_id, renewal_basis,
                               price_notice_at, signed_document_id, signed_verified_at, signed_verified_by)
  values (old.customer_id, old.package, old.billing_period, v_start, v_end, p_price, 'aktif', old.auto_renew, old.id, p_basis, p_price_notice_at,
          case when p_basis = 'yeni_imza' then p_signed_document else old.signed_document_id end, now(), auth.uid())
  returning id into k_id;
  perform set_config('ganu.renew', '', true);
  -- Eski dönem dokunulmadan kalır (bitiş tarihinde kendiliğinden sona erer); yenilendiği previous_contract_id'den anlaşılır.
  if old.billing_period = 'yıllık' then
    insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
    values (old.customer_id, k_id, p_price, greatest(v_start, today), greatest(v_start, today) + 7, 'bekliyor',
            old.package || ' · yenileme · ' || to_char(v_start, 'YYYY-MM'), v_start, v_end)
    returning id into i_id;
  end if;
  if p_basis = 'yeni_imza' then
    v_periods := case when old.billing_period = 'aylık' then p_months else p_months / 12.0 end;
    insert into public.stamp_taxes(customer_id, contract_id, party_title, party_tax_id, kind, paper_status, period_start, period_end, base, payer)
    values (old.customer_id, k_id, cu.title, coalesce(nullif(cu.tax_no, ''), nullif(cu.tc, '')), 'yenileme', 'taslak', v_start, v_end,
            round(p_price * v_periods / 1.2, 2), 'müşteri')
    returning id into s_id;
  end if;
  return jsonb_build_object('contract_id', k_id, 'invoice_id', i_id, 'stamp_tax_id', s_id);
end $$;
revoke all on function public.renew_contract(uuid, text, numeric, date, integer, uuid) from public, anon;
grant execute on function public.renew_contract(uuid, text, numeric, date, integer, uuid) to authenticated;

-- ---------------------------------------------------------------- Aylık faturaları hazırla (yerel kayıt; e-belge kesmez)
-- Yalnız imzası doğrulanmış aktif sözleşme ve aktif müşteri. Dönemler billing_anchor ile kurulur (her takvim ayına tek başlangıç);
-- son dönem sözleşme bitişinde kapanır. Seçilen ayda başlayan dönemler için bekleyen fatura açılır; tekrar çalışınca mevcut satır korunur.
create or replace function public.prepare_monthly_invoices(p_month date, p_contract uuid default null) returns integer
language plpgsql security invoker set search_path = public, pg_catalog as $$
declare c public.contracts; m_start date := date_trunc('month', p_month)::date; m_end date; k integer; n_months integer;
        ps date; pe date; n integer := 0; added integer;
begin
  if not public.is_staff() then raise exception 'Yetkisiz' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Ay zorunlu'; end if;
  m_end := (m_start + interval '1 month' - interval '1 day')::date;
  for c in select k.* from public.contracts k join public.customers cu on cu.id = k.customer_id
            where k.billing_period = 'aylık' and k.status = 'aktif' and k.signed_verified_at is not null and cu.status = 'aktif'
              and k.start_date <= m_end and k.end_date >= m_start and (p_contract is null or k.id = p_contract) loop
    n_months := public.term_months(c.start_date, c.end_date);
    for k in 0..(n_months - 1) loop
      ps := public.billing_anchor(c.start_date, k);
      exit when ps > c.end_date or ps > m_end;
      continue when ps < m_start;
      pe := case when k = n_months - 1 then c.end_date else least(public.billing_anchor(c.start_date, k + 1) - 1, c.end_date) end;
      insert into public.invoices(customer_id, contract_id, amount, issue_date, due_date, status, note, service_period_start, service_period_end)
      values (c.customer_id, c.id, c.price, ps, ps + 7, 'bekliyor', c.package || ' · ' || to_char(ps, 'YYYY-MM') || ' dönemi', ps, pe)
      on conflict (contract_id, service_period_start) where service_period_start is not null do nothing;
      get diagnostics added = row_count; n := n + added;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.prepare_monthly_invoices(date, uuid) from public, anon;
grant execute on function public.prepare_monthly_invoices(date, uuid) to authenticated;
