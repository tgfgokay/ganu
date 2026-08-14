/* ============================================================
   GANU Panel · Veri Katmanı (soyut)
   ------------------------------------------------------------
   Şu an: localStorage (tarayıcıda, anında çalışır)
   Sonra: Supabase — sadece bu dosyadaki fonksiyonların içi
          değişir; sayfalar aynı kalır.
   Tüm fonksiyonlar async (Supabase'e uyum için Promise döner).
   ============================================================ */

import { supabase, usingSupabase } from './supabase.js'

const KEY = 'ganu.panel.v1'

/* Supabase tablo adları (koleksiyon adı → tablo) */
const TABLE = {
  customers: 'customers', contracts: 'contracts', mail_items: 'mail_items',
  invoices: 'invoices', documents: 'documents', notifications: 'notifications',
  requests: 'requests', inspections: 'inspections', partners: 'partners',
  expenses: 'expenses', request_messages: 'request_messages', bookings: 'bookings',
  commission_payments: 'commission_payments',
}

/* Panel yapılandırması (bildirim kanalları, API anahtarları) — ayrı anahtar */
const CFG_KEY = 'ganu.panel.config'
const DEFAULT_CFG = {
  channels: { email: true, sms: false, whatsapp: false },
  netgsm_user: '', netgsm_pass: '', netgsm_header: '',
  whatsapp_from: '',
  sender_name: 'GANU Sanal Ofis',
  auto_reminders: true, // yenileme hatırlatmaları
  real_send: false,     // true + bulut modu → Edge Function ile gerçek gönderim
  templates: {},        // olay bazlı özel şablon metinleri (varsayılanı ezer)
  // e-fatura / e-arşiv entegratörü (gizli anahtarlar Supabase secrets'ta)
  efatura_provider: '', // parasut | uyumsoft | foriba | izibiz | logo | mukellef
  efatura_user: '',
  efatura_mode: 'e-arsiv', // e-arsiv | e-fatura
  efatura_enabled: false,
  // ödeme bilgileri (müşteri portalındaki "Öde" ekranında gösterilir)
  payment_recipient: 'GANU Sanal Ofis', // hesap sahibi / alıcı ünvanı
  payment_bank: '',                     // banka adı (ör. Ziraat Bankası)
  payment_iban: '',
  payment_page_link: '', // sanal POS genel ödeme sayfası (iyzico link / PayTR) — sitede "kartla öde"
  // havale: dekont yüklenince ONAY BEKLEMEDEN otomatik aktive et.
  // Varsayılan KAPALI — para geldikten sonra yönetici dekonta bakıp
  // müşteri detayından onaylar. (Açılırsa sahte dekont riski yöneticiye ait.)
  auto_activate_receipt: false,
  // sanal POS (kart tahsilatı) — açıkken /satin-al kart adımı gerçek
  // ödemeye (pos-payment Edge Function) yönlenir; kapalıyken simülasyon.
  pos_enabled: false,
  pos_provider: 'paytr',                // paytr | iyzico
}
export function getConfig() {
  try { return { ...DEFAULT_CFG, ...(JSON.parse(localStorage.getItem(CFG_KEY)) || {}) } }
  catch { return { ...DEFAULT_CFG } }
}
export function setConfig(patch) {
  const next = { ...getConfig(), ...patch }
  localStorage.setItem(CFG_KEY, JSON.stringify(next))
  return next
}

/* ---------- yardımcılar ---------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const now = () => new Date().toISOString()
const clone = (v) => JSON.parse(JSON.stringify(v))

function read() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const db = JSON.parse(raw)
      // eski kayıtlarda olmayan koleksiyonları tamamla (göç)
      let changed = false
      for (const k of Object.keys(TABLE)) {
        if (!Array.isArray(db[k])) { db[k] = []; changed = true }
      }
      if (changed) write(db)
      return db
    }
  } catch { /* ignore */ }
  const seeded = seed()
  write(seeded)
  return seeded
}
function write(db) {
  localStorage.setItem(KEY, JSON.stringify(db))
  return db
}

/* ---------- tohum veri (ilk açılışta örnek) ---------- */
function seed() {
  const today = new Date()
  const iso = (d) => d.toISOString().slice(0, 10)
  const addDays = (n) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d) }

  const c1 = uid(), c2 = uid(), c3 = uid()
  const p1 = uid()
  return {
    partners: [
      { id: p1, name: 'Yılmaz Mali Müşavirlik', profession: 'Mali müşavir', contact: 'SMMM Ahmet Yılmaz', email: 'ahmet@yilmazsmmm.com', phone: '0532 900 10 20', iban: 'TR33 0006 1005 1978 6457 8413 26', tax_no: '9990001111', commission_rate: 10, access_code: 'ORTAK01', status: 'aktif', notes: 'İlk iş ortağı', created_at: now() },
    ],
    customers: [
      { id: c1, title: 'Aydın Yazılım Ltd. Şti.', contact: 'Merve Aydın', email: 'merve@aydinyazilim.com', phone: '0532 111 22 33', tax_no: '1234567890', tax_office: 'Beykoz VD', tc: '', status: 'aktif', access_code: 'AYDIN01', partner_id: p1, notes: '', created_at: now() },
      { id: c2, title: 'Deniz Ticaret A.Ş.', contact: 'Kaan Deniz', email: 'kaan@deniztic.com', phone: '0533 444 55 66', tax_no: '9876543210', tax_office: 'Kavacık VD', tc: '', status: 'aktif', access_code: 'DENIZ02', partner_id: p1, notes: 'E-ticaret', created_at: now() },
      { id: c3, title: 'Işık Danışmanlık', contact: 'Selin Işık', email: 'selin@isikdan.com', phone: '0555 777 88 99', tax_no: '', tax_office: '', tc: '11111111111', status: 'aktif', access_code: 'ISIK03', partner_id: '', notes: '', created_at: now() },
    ],
    contracts: [
      { id: uid(), customer_id: c1, package: 'Pro', start_date: addDays(-350), end_date: addDays(15), price: 14990, status: 'aktif', auto_renew: false, created_at: now() },
      { id: uid(), customer_id: c2, package: 'Kurumsal', start_date: addDays(-360), end_date: addDays(5), price: 24990, status: 'aktif', auto_renew: true, created_at: now() },
      { id: uid(), customer_id: c3, package: 'Başlangıç', start_date: addDays(-120), end_date: addDays(245), price: 7990, status: 'aktif', auto_renew: false, created_at: now() },
    ],
    mail_items: [
      { id: uid(), customer_id: c1, type: 'kargo', sender: 'Trendyol', received_date: iso(today), status: 'geldi', photo_url: '', shelf: 'Raf A-3', forward_tracking: '', delivered_to: '', delivered_at: '', notes: '', created_at: now() },
      { id: uid(), customer_id: c2, type: 'tebligat', sender: 'İstanbul Vergi D.', received_date: iso(today), status: 'bildirildi', photo_url: '', shelf: 'Kasa', forward_tracking: '', delivered_to: '', delivered_at: '', notes: 'Acil', created_at: now() },
      { id: uid(), customer_id: c1, type: 'mektup', sender: 'Ziraat Bankası', received_date: addDays(-2), status: 'teslim', photo_url: '', shelf: '', forward_tracking: '', delivered_to: 'Merve Aydın', delivered_at: addDays(-1), notes: '', created_at: now() },
      { id: uid(), customer_id: c3, type: 'kargo', sender: 'Aras Kargo', received_date: addDays(-1), status: 'yönlendirildi', photo_url: '', shelf: '', forward_tracking: '7350012345', delivered_to: '', delivered_at: '', notes: 'Kadıköy adresine', created_at: now() },
    ],
    invoices: [
      { id: uid(), customer_id: c1, amount: 14990, status: 'ödendi', issue_date: addDays(-20), due_date: addDays(-5), paid_date: addDays(-8), note: 'Pro yıllık', created_at: now() },
      { id: uid(), customer_id: c2, amount: 24990, status: 'bekliyor', issue_date: addDays(-3), due_date: addDays(12), paid_date: '', note: 'Kurumsal yıllık', created_at: now() },
      { id: uid(), customer_id: c3, amount: 7990, status: 'gecikti', issue_date: addDays(-40), due_date: addDays(-10), paid_date: '', note: 'Başlangıç yıllık', created_at: now() },
    ],
    documents: [
      { id: uid(), customer_id: c1, name: 'İmza Sirküleri', type: 'imza_sirkuleri', file_url: '', note: '2026', created_at: now() },
      { id: uid(), customer_id: c2, name: 'Vergi Levhası', type: 'vergi_levhasi', file_url: '', note: '', created_at: now() },
    ],
    notifications: [],
    requests: [
      { id: uid(), customer_id: c3, mail_id: '', kind: 'yönlendirme', note: 'Kadıköy şubeme yönlendirir misiniz?', status: 'yeni', created_at: now() },
    ],
    inspections: [
      { id: uid(), customer_id: c1, date: addDays(-30), result: 'olumlu', officer: '', attendee: 'Merve Aydın', note: 'Açılış yoklaması, sorun yok.', created_at: now() },
    ],
    expenses: [
      { id: uid(), date: addDays(-15), category: 'kira', amount: 25000, customer_id: '', billable: false, note: 'Temmuz ofis kirası', created_at: now() },
      { id: uid(), date: addDays(-5), category: 'kargo', amount: 180, customer_id: c3, billable: true, note: 'Kadıköy yönlendirme kargo ücreti', created_at: now() },
    ],
    request_messages: [],
    bookings: [
      { id: uid(), customer_id: c1, date: addDays(2), start: '10:00', end: '11:00', attendees: 3, note: 'Yatırımcı sunumu', status: 'onaylandı', created_by: 'ganu', created_at: now() },
      { id: uid(), customer_id: c2, date: addDays(3), start: '14:00', end: '15:30', attendees: 2, note: 'Müşteri görüşmesi', status: 'talep', created_by: 'musteri', created_at: now() },
    ],
  }
}

/* ---------- Supabase CRUD üretici ---------- */
function supaCollection(name) {
  const t = TABLE[name]
  return {
    async list() {
      const { data, error } = await supabase.from(t).select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
    async get(id) {
      const { data, error } = await supabase.from(t).select('*').eq('id', id).single()
      if (error) return null
      return data
    },
    async create(row) {
      const { data, error } = await supabase.from(t).insert(row).select().single()
      if (error) throw error
      return data
    },
    async update(id, patch) {
      const { data, error } = await supabase.from(t).update(patch).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    async remove(id) {
      const { error } = await supabase.from(t).delete().eq('id', id)
      if (error) throw error
      return true
    },
  }
}

/* ---------- yerel (localStorage) CRUD üretici ---------- */
function localCollection(name) {
  return {
    async list() {
      const db = read()
      return clone(db[name]).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    },
    async get(id) {
      const db = read()
      return clone(db[name].find((r) => r.id === id) || null)
    },
    async create(data) {
      const db = read()
      const row = { id: uid(), created_at: now(), ...data }
      db[name].unshift(row)
      write(db)
      return clone(row)
    },
    async update(id, patch) {
      const db = read()
      const i = db[name].findIndex((r) => r.id === id)
      if (i === -1) return null
      db[name][i] = { ...db[name][i], ...patch }
      write(db)
      return clone(db[name][i])
    },
    async remove(id) {
      const db = read()
      db[name] = db[name].filter((r) => r.id !== id)
      write(db)
      return true
    },
  }
}

/* Arka uç seçimi: env varsa Supabase, yoksa localStorage */
const collection = usingSupabase ? supaCollection : localCollection

export const customers = collection('customers')
export const contracts = collection('contracts')
export const mail = collection('mail_items')
export const invoices = collection('invoices')
export const documents = collection('documents')
export const notifications = collection('notifications')
export const requests = collection('requests')
export const inspections = collection('inspections')
export const partners = collection('partners')
export const expenses = collection('expenses')
export const requestMessages = collection('request_messages')
export const bookings = collection('bookings')
export const commissionPayments = collection('commission_payments')
export { usingSupabase }

/* ---------- talep mesajlaşması (panel ↔ müşteri) ----------
   Her talep bir konuşma dizisi taşır; from: 'ganu' | 'musteri'. */
export async function requestThread(requestId) {
  const all = await requestMessages.list()
  return all.filter((m) => m.request_id === requestId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
}
export async function sendRequestMessage({ request_id, from, text }) {
  const t = (text || '').trim()
  if (!t) return null
  return requestMessages.create({ request_id, from, text: t })
}

/* ---------- iş ortağı özeti (komisyon dahil) ----------
   Her ortak için: yönlendirdiği (getirdiği) müşteriler + hakediş.
   Komisyon tabanı = getirdiği müşterilerin ÖDENMİŞ faturaları;
   hakediş = taban × komisyon oranı (%). Şeffaf, tek ekranda. */
export async function partnerSummary() {
  const [ps, cs, inv, pays] = await Promise.all([partners.list(), customers.list(), invoices.list(), commissionPayments.list()])
  return ps.map((p) => enrichPartner(p, cs, inv, pays))
}

function enrichPartner(p, cs, inv, pays = []) {
  const refs = cs.filter((c) => c.partner_id === p.id)
  const refIds = new Set(refs.map((c) => c.id))
  const paid = inv.filter((i) => refIds.has(i.customer_id) && i.status === 'ödendi')
  const revenueBase = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const rate = Number(p.commission_rate) || 0
  const commissionEarned = Math.round(revenueBase * rate) / 100 // taban × oran%
  const myPays = pays.filter((x) => x.partner_id === p.id)
  const commissionPaid = myPays.reduce((s, x) => s + (Number(x.amount) || 0), 0)
  const commissionDue = Math.round((commissionEarned - commissionPaid) * 100) / 100
  return {
    ...p, customerCount: refs.length, customers: refs, revenueBase,
    commissionRate: rate, commissionEarned, commissionPaid, commissionDue,
    payments: myPays,
  }
}

/* ---------- komisyon ödemesi kaydet (dönem kesimi) ----------
   Ortağa yapılan hakediş ödemesini kaydeder:
   1) commission_payments satırı (portalda "ödendi" görünür, kalan düşer)
   2) masraf kaydı (kategori: komisyon) — gider takibine işlenir */
export async function recordCommissionPayment(partner, { amount = 0, date = '', note = '' } = {}) {
  const amt = Number(amount) || 0
  if (!partner?.id || amt <= 0) return null
  const d = date || new Date().toISOString().slice(0, 10)
  const exp = await expenses.create({
    date: d, category: 'komisyon', amount: amt, customer_id: '', billable: false,
    note: `İş ortağı komisyon ödemesi — ${partner.name}${note ? ` · ${note}` : ''}`,
  })
  return commissionPayments.create({
    partner_id: partner.id, amount: amt, date: d, note: (note || '').trim(), expense_id: exp?.id || '',
  })
}

/* ---------- iş ortağı: herkese açık başvuru (kayıt) ----------
   /is-ortakligi sayfasındaki formdan gelir; 'başvuru' durumunda oluşur.
   Komisyon oranı ve erişim kodu, onay sırasında panelden atanır. */
export async function partnerApply(form) {
  const row = {
    name: (form.name || '').trim(),
    profession: form.profession || 'Diğer',
    contact: (form.contact || '').trim(),
    email: (form.email || '').trim(),
    phone: (form.phone || '').trim(),
    iban: (form.iban || '').trim(),
    tax_no: (form.tax_no || '').trim(),
    commission_rate: 10, // standart yönlendirme komisyonu %10 (onayda panelden değiştirilebilir)
    access_code: '',
    status: 'başvuru',
    notes: (form.notes || '').trim(),
  }
  if (usingSupabase) {
    // anon yalnız INSERT yapabilir (SELECT policy yok) — dönüş satırı istenmez
    const { error } = await supabase.from('partners').insert(row)
    if (error) throw error
    return row
  }
  return partners.create(row)
}

/* ---------- iş ortağı portalı girişi ----------
   Erişim kodu ile (yalnız 'aktif' ortaklar) — müşteri portalıyla aynı desen.
   Dönüş: hakediş/komisyon ile zenginleştirilmiş ortak kaydı (veya null). */
export async function partnerLogin(code) {
  const q = (code || '').trim().toUpperCase()
  if (!q) return null
  if (usingSupabase) {
    // anon tablo okuyamaz — SECURITY DEFINER RPC kod doğrulayıp paketi döner
    const { data, error } = await supabase.rpc('partner_portal', { p_code: q })
    if (error || !data) return null
    const p = data.partner
    const cs = (data.customers || []).map((c) => ({ ...c, partner_id: p.id }))
    const inv = data.invoices || []
    return enrichPartner(p, cs, inv, data.payments || [])
  }
  const ps = await partners.list()
  const p = ps.find((x) =>
    (x.access_code || '').toUpperCase() === q &&
    x.status === 'aktif')
  if (!p) return null
  const [cs, inv, pays] = await Promise.all([customers.list(), invoices.list(), commissionPayments.list()])
  return enrichPartner(p, cs, inv, pays)
}

/* ---------- müşteri portalı girişi (Faz 2) ----------
   Yerel modda: müşteriye özel erişim kodu ile giriş.
   Bulut modunda: Supabase Auth (auth_uid) ile değiştirilecek.
   Güvenlik: yalnız 'aktif' ve 'askıda' müşteriler girebilir; 'ayrıldı'
   ve 'aday' giremez. Boş kod hiçbir kayda eşleşmez. */
export async function customerLogin(code) {
  const q = (code || '').trim().toUpperCase()
  if (!q) return null
  if (usingSupabase) {
    const { data } = await supabase.rpc('portal_login_code', { p_code: q })
    const c = Array.isArray(data) ? data[0] : data
    return c && c.status !== 'ayrıldı' && c.status !== 'aday' ? c : null
  }
  const cs = await customers.list()
  const c = cs.find((x) => (x.access_code || '').toUpperCase() === q)
  if (!c) return null
  if (c.status === 'ayrıldı' || c.status === 'aday') return null
  return c
}

/* ---------- parola özeti (sha256) ----------
   Saklama biçimi: 'sha256:<hex>' — düz metin eski kayıtlar da doğrulanır. */
export async function hashPass(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return 'sha256:' + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function passMatch(stored, given) {
  if (!stored) return false
  if (stored.startsWith('sha256:')) return stored === await hashPass(given)
  return stored === given // eski düz metin kayıt
}

/* Müşteri girişi: E-POSTA + ŞİFRE (standart akış).
   - Kimlik: e-posta (yoksa erişim kodu da kabul — telefonla kaydolanlar için)
   - Şifre: müşterinin belirlediği portal_password, yoksa erişim kodu (ilk şifre)
   Dönüş: { ok, customer } | { ok:false, error } */
export async function customerLoginEmail({ email = '', password = '' } = {}) {
  const id = (email || '').trim().toLowerCase()
  const pw = (password || '').trim()
  if (!id || !pw) return { ok: false, error: 'E-posta ve şifre gerekli.' }
  if (usingSupabase) {
    // anon tablo okuyamaz — RPC e-posta + parola/kod doğrular, sadece o kaydı döner
    const { data, error } = await supabase.rpc('portal_login', { p_email: id, p_pass: pw })
    if (error) return { ok: false, error: 'Giriş yapılamadı. Tekrar deneyin.' }
    const c = Array.isArray(data) ? data[0] : data
    if (!c) return { ok: false, error: 'E-posta veya şifre hatalı.' }
    if (c.status === 'aday') return { ok: false, error: 'Hesabınız henüz aktif değil — ödeme/aktivasyon bekleniyor.' }
    return { ok: true, customer: c }
  }
  const cs = await customers.list()
  const c = cs.find((x) =>
    (x.email || '').trim().toLowerCase() === id ||
    (x.access_code || '').toLowerCase() === id)
  if (!c) return { ok: false, error: 'E-posta veya şifre hatalı.' }
  if (c.status === 'aday') return { ok: false, error: 'Hesabınız henüz aktif değil — ödeme/aktivasyon bekleniyor.' }
  if (c.status === 'ayrıldı') return { ok: false, error: 'Hesabınız aktif değil. Bilgi için bize ulaşın.' }
  const valid = await passMatch(c.portal_password || '', pw) ||
    pw.toUpperCase() === (c.access_code || '').toUpperCase()
  if (!valid) return { ok: false, error: 'E-posta veya şifre hatalı.' }
  return { ok: true, customer: c }
}

/* Müşteri portal şifresini değiştir (mevcut şifre doğrulanır; yeni şifre HASH'lenir) */
export async function customerChangePassword(customerId, oldPass, newPass) {
  const oldP = (oldPass || '').trim()
  const newP = (newPass || '').trim()
  if (newP.length < 4) return { ok: false, error: 'Yeni şifre en az 4 karakter olmalı.' }
  if (usingSupabase) {
    const { data, error } = await supabase.rpc('portal_change_password', {
      p_customer_id: customerId, p_old: oldP, p_new: newP,
    })
    if (error || !data) return { ok: false, error: 'Mevcut şifre hatalı.' }
    return { ok: true }
  }
  const c = await customers.get(customerId)
  if (!c) return { ok: false, error: 'Kayıt bulunamadı.' }
  const valid = await passMatch(c.portal_password || '', oldP) ||
    oldP.toUpperCase() === (c.access_code || '').toUpperCase()
  if (!valid) return { ok: false, error: 'Mevcut şifre hatalı.' }
  await customers.update(customerId, { portal_password: await hashPass(newP) })
  return { ok: true }
}

/* ---------- havale dekontu bildirimi ----------
   Müşteri /satin-al havale sekmesinden dekont yükler. Kayıt 'aday'
   kalır; panelde onay kuyruğuna düşer (dashboard.paymentClaims).
   Yönetici dekontu görüp "Ödeme geldi" ile aktive eder.
   (Gerçek otomatik eşleşme banka API'si gerektirir — ileride.) */
export async function submitPaymentReceipt(customerId, { receiptUrl = '', amount = 0, pkg = '', sender = '' } = {}) {
  if (usingSupabase) {
    // anon UPDATE yok — RPC yalnız 'aday' kaydına dekont yazar
    const { data, error } = await supabase.rpc('purchase_submit_receipt', {
      p_customer_id: customerId, p_url: receiptUrl,
      p_expected: Number(amount) || 0, p_pkg: pkg, p_sender: sender,
    })
    if (error || !data) throw new Error(error?.message || 'Dekont kaydedilemedi.')
    return true
  }
  return customers.update(customerId, {
    payment_receipt_url: receiptUrl,
    payment_claimed_at: new Date().toISOString(),
    payment_expected: Number(amount) || 0,
    payment_pkg: pkg,
    payment_sender: sender,
  })
}

/* ---------- sanal POS (kart tahsilatı) ----------
   pos-payment Edge Function'ı 'init' ile çağırır; sağlayıcının 3D Secure
   ekranına yönlendirmek için iframe_url / redirect döner. Yalnız Supabase
   bağlıyken çalışır (secret'lar sunucuda). Sağlayıcı: 'paytr' | 'iyzico'.
   Config'te pos_enabled açık değilse UI bu yolu kullanmaz (simülasyon kalır). */
export async function posPay(provider, { customerId, pkg = '', code = '', email = '', name = '', phone = '' } = {}) {
  if (!usingSupabase) throw new Error('Sanal POS için Supabase bağlı olmalı (yerel modda simülasyon çalışır).')
  if (!customerId || !pkg) throw new Error('customerId ve paket zorunlu.')
  // P0.3: TUTAR İSTEMCİDEN GÖNDERİLMEZ. Sunucu, package_id + izinli indirim
  // kodundan fiyatı kendisi hesaplar; istemcinin ilettiği tutar yok sayılır.
  const { data, error } = await supabase.functions.invoke('pos-payment', {
    body: { action: 'init', provider, customer_id: customerId, package_id: pkg, code, email, name, phone },
  })
  if (error) throw new Error(error.message || 'POS başlatılamadı.')
  if (data?.error) throw new Error(data.error)
  return data // { provider, mode, token?, iframe_url?, merchant_oid, amount }
}

/* Config'te sanal POS açık mı? (varsayılan kapalı → kart ekranı simülasyon) */
export function posEnabled() {
  const cfg = getConfig()
  return !!(cfg && cfg.pos_enabled)
}

/* ---------- online müşteri başvurusu ----------
   Sitedeki formdan gelir; 'aday' durumunda oluşur, portala giremez.
   Panelden durumu 'aktif' yapılınca müşteriye dönüşür. */
export async function customerApply(form) {
  // ortak yönlendirme linki (?ref=KOD) → müşteri-ortak eşleşmesi
  const ref = (form.ref || '').trim().toUpperCase()
  let partner_id = ''
  let refNote = ''
  if (ref) {
    if (usingSupabase) {
      refNote = `Ref: ${ref}` // anon partner okuyamaz — panel onayında eşleştirilir
    } else {
      const ps = await partners.list()
      const p = ps.find((x) => (x.access_code || '').toUpperCase() === ref && x.status === 'aktif')
      if (p) partner_id = p.id; else refNote = `Ref: ${ref}`
    }
  }
  const row = {
    title: (form.title || '').trim(),
    contact: (form.contact || '').trim(),
    email: (form.email || '').trim(),
    phone: (form.phone || '').trim(),
    // VKN (10 hane) / TC (11 hane) — e-belge kesimi için cari bilgisi
    tax_no: (form.tax_no || '').replace(/\D/g, '').length === 10 ? (form.tax_no || '').replace(/\D/g, '') : '',
    tc: (form.tax_no || '').replace(/\D/g, '').length === 11 ? (form.tax_no || '').replace(/\D/g, '') : '',
    tax_office: (form.tax_office || '').trim(),
    status: 'aday',
    access_code: '',
    partner_id,
    bni: !!form.bni,
    notes: [form.package ? `İstenen paket: ${form.package}` : '', refNote, (form.notes || '').trim()].filter(Boolean).join(' · '),
  }
  if (usingSupabase) {
    // anon INSERT policy dönüş satırı vermez — id'yi istemci üretir
    const id = crypto.randomUUID()
    const { error } = await supabase.from('customers').insert({ ...row, id, partner_id: partner_id || null })
    if (error) throw error
    return { ...row, id }
  }
  return customers.create(row)
}

/* ---------- müşteri portalı veri katmanı ----------
   Bulut modunda anon istemci tabloları OKUYAMAZ (RLS). Tüm portal
   okuma/yazmaları SECURITY DEFINER RPC'ler üzerinden gider; erişim
   kodu her çağrıda doğrulanır. Yerel modda koleksiyonlardan süzülür. */
export async function portalBundle(cust) {
  if (!cust?.id) return null
  if (usingSupabase) {
    const { data, error } = await supabase.rpc('portal_bundle', { p_customer_id: cust.id, p_code: cust.access_code || '' })
    if (error || !data) return null
    return {
      customer: data.customer, contracts: data.contracts || [], mail: data.mail || [],
      invoices: data.invoices || [], documents: data.documents || [],
      requests: data.requests || [], messages: data.messages || [], bookings: data.bookings || [],
    }
  }
  const [ct, ml, inv, docs, rq, msgs, bk] = await Promise.all([
    contracts.list(), mail.list(), invoices.list(), documents.list(), requests.list(), requestMessages.list(), bookings.list(),
  ])
  const mine = (rows) => rows.filter((x) => x.customer_id === cust.id)
  const myReqIds = new Set(mine(rq).map((r) => r.id))
  return {
    customer: cust, contracts: mine(ct), mail: mine(ml), invoices: mine(inv),
    documents: mine(docs), requests: mine(rq),
    messages: msgs.filter((m) => myReqIds.has(m.request_id)), bookings: mine(bk),
  }
}

export async function portalCreateRequest(cust, { kind = 'yönlendirme', note = '', mail_id = '' } = {}) {
  if (usingSupabase) {
    const { data, error } = await supabase.rpc('portal_create_request', {
      p_customer_id: cust.id, p_code: cust.access_code || '',
      p_mail_id: mail_id || null, p_kind: kind, p_note: note,
    })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  }
  return requests.create({ customer_id: cust.id, mail_id: mail_id || '', kind, note, status: 'yeni' })
}

export async function portalSendMessage(cust, requestId, text) {
  const t = (text || '').trim()
  if (!t) return null
  if (usingSupabase) {
    const { data, error } = await supabase.rpc('portal_send_message', {
      p_customer_id: cust.id, p_code: cust.access_code || '', p_request_id: requestId, p_text: t,
    })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  }
  return sendRequestMessage({ request_id: requestId, from: 'musteri', text: t })
}

export async function portalCreateBooking(cust, form) {
  if (usingSupabase) {
    const { data, error } = await supabase.rpc('portal_create_booking', {
      p_customer_id: cust.id, p_code: cust.access_code || '',
      p_date: form.date, p_start: form.start, p_end: form.end,
      p_attendees: Number(form.attendees) || 1, p_note: form.note || '',
    })
    if (error) throw error
    return Array.isArray(data) ? data[0] : data
  }
  return bookings.create({ customer_id: cust.id, ...form, attendees: Number(form.attendees) || 1, status: 'talep', created_by: 'musteri' })
}

export async function portalSetKvkk(cust) {
  const at = new Date().toISOString()
  if (usingSupabase) {
    const { error } = await supabase.rpc('portal_set_kvkk', { p_customer_id: cust.id, p_code: cust.access_code || '' })
    if (error) throw error
    return { ...cust, kvkk_consent_at: at }
  }
  const updated = await customers.update(cust.id, { kvkk_consent_at: at })
  return updated || { ...cust, kvkk_consent_at: at }
}

/* ---------- türetilmiş sorgular (dashboard) ---------- */
export function daysLeft(endDate) {
  const end = new Date(endDate + 'T00:00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((end - t) / 86400000)
}

export async function dashboard() {
  const [cs, ct, ml, inv, rq] = await Promise.all([customers.list(), contracts.list(), mail.list(), invoices.list(), requests.list()])
  const byId = Object.fromEntries(cs.map((c) => [c.id, c]))
  const todayIso = new Date().toISOString().slice(0, 10)

  const withCustomer = (rows) => rows.map((r) => ({ ...r, customer: byId[r.customer_id] || null }))

  const todayMail = withCustomer(ml.filter((m) => m.received_date === todayIso))
  const pending = withCustomer(ml.filter((m) => m.status === 'geldi' || m.status === 'bildirildi'))
  // acil: teslim edilmemiş resmi tebligatlar
  const tebligat = withCustomer(ml.filter((m) => m.type === 'tebligat' && m.status !== 'teslim' && m.status !== 'yönlendirildi'))
  const renewals = withCustomer(
    ct.map((c) => ({ ...c, _days: daysLeft(c.end_date) }))
      .filter((c) => c._days <= 30)
      .sort((a, b) => a._days - b._days)
  )
  const openRequests = withCustomer(rq.filter((r) => r.status === 'yeni' || r.status === 'işlemde'))
  const applicants = cs.filter((c) => c.status === 'aday')
  const paymentClaims = applicants.filter((c) => c.payment_claimed_at || (c.notes || '').includes('Ödeme bildirimi'))

  // gelir/ödeme özeti
  const paid = inv.filter((i) => i.status === 'ödendi')
  const outstanding = inv.filter((i) => i.status !== 'ödendi')
  const revenue = paid.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const outstandingTotal = outstanding.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  return {
    counts: { customers: cs.length, mail: ml.length, contracts: ct.length, invoices: inv.length },
    todayMail,
    pending,
    tebligat,
    renewals,
    openRequests,
    applicants,
    paymentClaims,
    finance: { revenue, outstandingTotal, outstandingCount: outstanding.length },
  }
}

/* ---------- gelir raporu (aylık ciro) ---------- */
export async function revenueByMonth(months = 6) {
  const inv = await invoices.list()
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('tr-TR', { month: 'short' }), total: 0 })
  }
  const map = Object.fromEntries(buckets.map((b) => [b.key, b]))
  inv.filter((i) => i.status === 'ödendi').forEach((i) => {
    const k = (i.paid_date || i.issue_date || '').slice(0, 7)
    if (map[k]) map[k].total += Number(i.amount) || 0
  })
  return buckets
}

/* ---------- yardımcı: müşteri adı çözümleme ---------- */
export async function withCustomerNames(rows) {
  const cs = await customers.list()
  const byId = Object.fromEntries(cs.map((c) => [c.id, c]))
  return rows.map((r) => ({ ...r, customer: byId[r.customer_id] || null }))
}

/* ---------- sabitler ---------- */
export const MAIL_TYPES = ['mektup', 'kargo', 'tebligat']
export const MAIL_STATUS = ['geldi', 'bildirildi', 'teslim', 'yönlendirildi', 'imha']
export const PACKAGES = ['Başlangıç', 'Pro', 'Kurumsal']
/* Tarife (14.08.2026 güncel — pazar-arastirma/rakip-fiyat-analizi-2026-08.md)
   KDV DAHİL. Satın alma yıllık peşin tahsil edilir (yıllık ≈ 10 aylık = 2 ay bedava).
   Kurumsal: özel teklif — sabit fiyatı yok (taban ~29.990 ₺). */
export const PACKAGE_MONTHLY = { 'Başlangıç': 999, 'Pro': 1899 }    // aylık, ₺
export const PACKAGE_PRICES = { 'Başlangıç': 9990, 'Pro': 18990 }   // yıllık peşin, ₺
export const PACKAGE_CUSTOM = new Set(['Kurumsal'])                 // sabit fiyatsız (teklif)

/* ---------- Fiyat kataloğu tek gerçek kaynak (P0.2/#7) ----------
   Supabase bağlıysa fiyatlar 'packages' tablosundan okunur ve yukarıdaki
   objeler YERİNDE güncellenir; site, checkout, panel ve POS aynı değerleri
   kullanır. Yerel/dev modda yukarıdaki sabitler geçerlidir.
   Bileşenler onCatalog ile abone olup katalog yüklenince yeniden render eder. */
const _catalogSubs = new Set()
export function onCatalog(cb) { _catalogSubs.add(cb); return () => _catalogSubs.delete(cb) }
export async function loadCatalog() {
  if (!usingSupabase) return false
  const { data, error } = await supabase
    .from('packages').select('id,name,list_amount,monthly_amount,is_custom,active,sort')
    .eq('active', true).order('sort')
  if (error || !Array.isArray(data) || !data.length) return false
  for (const k of Object.keys(PACKAGE_PRICES)) delete PACKAGE_PRICES[k]
  for (const k of Object.keys(PACKAGE_MONTHLY)) delete PACKAGE_MONTHLY[k]
  PACKAGE_CUSTOM.clear()
  const names = []
  for (const p of data) {
    names.push(p.id)
    if (p.is_custom || !(Number(p.list_amount) > 0)) { PACKAGE_CUSTOM.add(p.id); continue }
    PACKAGE_PRICES[p.id] = Number(p.list_amount)
    if (p.monthly_amount != null) PACKAGE_MONTHLY[p.id] = Number(p.monthly_amount)
  }
  PACKAGES.splice(0, PACKAGES.length, ...names)
  _catalogSubs.forEach((cb) => { try { cb() } catch { /* yoksay */ } })
  return true
}
/* BNI Nişantaşı kaynaklı müşteri indirimi (%). Sitede GÖRÜNMEZ; yalnız panelde,
   müşteri "BNI" işaretliyse ödeme anında uygulanır. Oran ayda bir elle gözden
   geçirilir — değişecek tek yer burası. 0 = indirim yok. */
export const BNI_INDIRIM = 10
export function bniPrice(amount) {
  return Math.round((Number(amount) || 0) * (100 - BNI_INDIRIM)) / 100
}
/* İndirim kodları — kamuya açık DEĞİL; sahibi (ör. BNI üyesi) müşteriye verir.
   Müşteri satın alma sayfasında kodu kendi girer. kod → % indirim.
   Yeni kod eklemek / oranı değiştirmek tek satır; ayda bir gözden geçir. */
export const INDIRIM_KODLARI = { BNINISANTASI: BNI_INDIRIM }
export function indirimCoz(code) {
  const k = String(code || '').trim().toUpperCase().replace(/\s+/g, '')
  const pct = INDIRIM_KODLARI[k]
  return pct ? { code: k, pct } : null
}
export function indirimliTutar(amount, pct) {
  return Math.round((Number(amount) || 0) * (100 - (Number(pct) || 0))) / 100
}
export const INVOICE_STATUS = ['bekliyor', 'ödendi', 'gecikti']
export const CUSTOMER_STATUS = ['aday', 'aktif', 'askıda', 'ayrıldı']

/* Etkin fatura durumu: 'bekliyor' + vadesi geçmiş → 'gecikti' (türetilmiş).
   Kayıt değiştirilmez; tüm ekranlar gösterimde bunu kullanır. */
export function invStatus(inv) {
  if (inv?.status === 'bekliyor' && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)) {
    return 'gecikti'
  }
  return inv?.status || 'bekliyor'
}
export const PARTNER_STATUS = ['başvuru', 'aktif', 'pasif']
export const PARTNER_PROFESSIONS = ['Mali müşavir', 'Avukat', 'Marka & patent vekili', 'Şirket kuruluşu danışmanı', 'Diğer']
export const DOC_TYPES = [
  { v: 'imza_sirkuleri', l: 'İmza Sirküleri' },
  { v: 'vergi_levhasi', l: 'Vergi Levhası' },
  { v: 'kimlik', l: 'Kimlik' },
  { v: 'sozlesme', l: 'Sözleşme' },
  { v: 'isyeri_kullanim', l: 'İşyeri/Adres Kullanım Belgesi' },
  { v: 'diger', l: 'Diğer' },
]
export const REQUEST_KINDS = ['yönlendirme', 'gel-al', 'tara', 'imha', 'destek', 'diğer']
export const EXPENSE_CATEGORIES = [
  { v: 'kira', l: 'Kira' },
  { v: 'aidat', l: 'Aidat / ortak gider' },
  { v: 'fatura', l: 'Elektrik / su / internet' },
  { v: 'kargo', l: 'Kargo / posta gideri' },
  { v: 'harc', l: 'Resmî harç / vergi' },
  { v: 'kirtasiye', l: 'Kırtasiye / sarf' },
  { v: 'personel', l: 'Personel / hizmet' },
  { v: 'komisyon', l: 'İş ortağı komisyonu' },
  { v: 'diger', l: 'Diğer' },
]
export const REQUEST_STATUS = ['yeni', 'işlemde', 'tamamlandı', 'reddedildi']

/* ---------- toplantı odası rezervasyonu ----------
   Randevu durumları + çalışma saatleri (yerel iş kuralı). */
export const BOOKING_STATUS = ['talep', 'onaylandı', 'reddedildi', 'iptal']
export const ROOM_OPEN = '09:00'
export const ROOM_CLOSE = '18:00'

/* 'HH:MM' aralığı üretir (varsayılan 30 dk adım, ofis saatleri) */
export function timeSlots(open = ROOM_OPEN, close = ROOM_CLOSE, stepMin = 30) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const pad = (n) => String(n).padStart(2, '0')
  const out = []
  for (let m = toMin(open); m <= toMin(close); m += stepMin) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`)
  return out
}

/* İki zaman aralığı çakışıyor mu (HH:MM sıfır dolgulu → string kıyas geçerli) */
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd
}

/* Aynı gün + çakışan saat + engelleyici durum (talep/onaylandı) var mı?
   exceptId: düzenlenen kaydın kendisi hariç tutulur. */
export function bookingConflict(list, { date, start, end, exceptId } = {}) {
  if (!date || !start || !end) return null
  return list.find((b) =>
    b.id !== exceptId &&
    b.date === date &&
    (b.status === 'talep' || b.status === 'onaylandı') &&
    overlaps(start, end, b.start, b.end)
  ) || null
}
export const INSPECTION_RESULT = ['bekleniyor', 'olumlu', 'olumsuz']
export const CHANNELS = ['email', 'sms', 'whatsapp']
export const EFATURA_PROVIDERS = [
  { v: 'parasut', l: 'Paraşüt' },
  { v: 'uyumsoft', l: 'Uyumsoft' },
  { v: 'foriba', l: 'Foriba (Sovos)' },
  { v: 'izibiz', l: 'İzibiz' },
  { v: 'logo', l: 'Logo İşbaşı' },
  { v: 'mukellef', l: 'Mükellef' },
]

/* ---------- bildirim şablonları ----------
   {ad}, {tur}, {gonderen}, {tarih}, {gun}, {paket}, {tutar} yer tutucuları */
export const NOTIFY_TEMPLATES = {
  mail_arrived:   { label: 'Kargo/posta geldi',        text: 'Sayın {ad}, adınıza bir {tur} ofisimize ulaştı ({gonderen}). Teslim/yönlendirme için bize ulaşabilirsiniz. — {firma}' },
  tebligat_arrived:{ label: 'Resmi tebligat geldi (ACİL)', text: 'Sayın {ad}, adınıza RESMİ BİR TEBLİGAT/EVRAK ulaştı ({gonderen}). Yasal süreler işleyebilir, lütfen acilen bize ulaşın. — {firma}' },
  delivered:      { label: 'Teslim edildi',            text: 'Sayın {ad}, {tarih} tarihinde gönderiniz teslim edilmiştir. — {firma}' },
  renewal_due:    { label: 'Sözleşme yenileme',         text: 'Sayın {ad}, {paket} sözleşmeniz {gun} gün sonra ({tarih}) sona eriyor. Adresinizin geçerli kalması için yenilemeyi unutmayın. — {firma}' },
  invoice_issued: { label: 'Fatura oluşturuldu',        text: 'Sayın {ad}, {tutar} tutarında faturanız oluşturuldu. — {firma}' },
  einvoice_ready: { label: 'e-Belge kesildi (PDF)',      text: 'Sayın {ad}, {tutar} tutarındaki e-belgeniz ({belge_no}) düzenlenmiştir. Faturanızı görüntülemek için: {link} — {firma}' },
  mail_waiting:   { label: 'Bekleyen gönderi hatırlatma', text: 'Sayın {ad}, {tarih} tarihinde gelen {tur} ({gonderen}) hâlâ ofisimizde teslim alınmayı bekliyor. Teslim/yönlendirme için bize ulaşın. — {firma}' },
  booking_confirmed:{ label: 'Toplantı odası onaylandı', text: 'Sayın {ad}, {tarih} günü {saat} toplantı odası rezervasyonunuz onaylanmıştır. Bekleriz. — {firma}' },
  booking_rejected: { label: 'Toplantı odası reddedildi', text: 'Sayın {ad}, {tarih} günü {saat} toplantı odası talebiniz maalesef karşılanamadı. Uygun bir saat için bize ulaşın. — {firma}' },
}

export function renderTemplate(text, vars = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString())
}

/* Şablon yer tutucuları — UI'da açıklama + önizleme için */
export const TEMPLATE_VARS = [
  { key: 'ad',       desc: 'Müşteri yetkilisi / ünvan' },
  { key: 'firma',    desc: 'Gönderen imzası (ayarlardan)' },
  { key: 'tur',      desc: 'Gönderi türü (mektup/kargo/tebligat)' },
  { key: 'gonderen', desc: 'Gönderen kişi/kurum' },
  { key: 'tarih',    desc: 'İlgili tarih' },
  { key: 'gun',      desc: 'Kalan gün sayısı' },
  { key: 'paket',    desc: 'Sözleşme paketi' },
  { key: 'tutar',    desc: 'Fatura tutarı' },
  { key: 'saat',     desc: 'Toplantı saati (ör. 10:00–11:00)' },
  { key: 'link',     desc: 'e-Belge PDF bağlantısı' },
  { key: 'belge_no', desc: 'e-Belge numarası' },
]

/* Önizleme için örnek değerler (canlı önizlemede kullanılır) */
export function sampleVars() {
  const cfg = getConfig()
  return {
    ad: 'Ahmet Yılmaz', firma: cfg.sender_name || 'GANU Sanal Ofis',
    tur: 'kargo', gonderen: 'PTT', tarih: '15.07.2026',
    gun: '7', paket: 'Prestij', tutar: '1.500 ₺',
  }
}

/* Etkin şablon: özel metin (config) varsa onu, yoksa varsayılanı döndürür.
   { key, label, text, custom } */
export function getTemplate(eventKey) {
  const base = NOTIFY_TEMPLATES[eventKey]
  if (!base) return null
  const custom = getConfig().templates?.[eventKey]
  const isCustom = custom != null && custom !== base.text
  return { key: eventKey, label: base.label, text: isCustom ? custom : base.text, custom: isCustom }
}

/* Tüm şablonlar — etkin metinle (sırayı NOTIFY_TEMPLATES belirler) */
export function getTemplates() {
  return Object.keys(NOTIFY_TEMPLATES).map((k) => getTemplate(k))
}

/* Bir şablonu özelleştir ya da sıfırla (null / boş / varsayılana eşit → sıfırlar) */
export function setTemplate(eventKey, text) {
  const base = NOTIFY_TEMPLATES[eventKey]
  if (!base) return null
  const templates = { ...(getConfig().templates || {}) }
  if (text == null || text.trim() === '' || text === base.text) delete templates[eventKey]
  else templates[eventKey] = text
  setConfig({ templates })
  return getTemplate(eventKey)
}

/* ---------- kargo takip linkleri (yönlendirme çıkış kargoları) ---------- */
export const CARRIERS = [
  { v: 'aras',    l: 'Aras Kargo',    url: (t) => `https://kargotakip.araskargo.com.tr/?code=${encodeURIComponent(t)}` },
  { v: 'yurtici', l: 'Yurtiçi Kargo', url: (t) => `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(t)}` },
  { v: 'mng',     l: 'MNG Kargo',     url: (t) => `https://www.mngkargo.com.tr/gonderitakip?takipNo=${encodeURIComponent(t)}` },
  { v: 'ptt',     l: 'PTT Kargo',     url: (t) => `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(t)}` },
]
export function trackingUrl(carrier, code) {
  const c = CARRIERS.find((x) => x.v === carrier)
  return c && code ? c.url(code) : ''
}

/* ---------- dosya/foto → depolanabilir referans (P0.5) ----------
   Yerel mod: görseli küçültüp dataURL üretir (tarayıcıda saklanır).
   Bulut modu: PRIVATE 'secure-docs' bucket'ına yükler ve DB'ye "secure:<path>"
   (public URL DEĞİL) saklar. Görüntülemede resolveStoredUrl() kısa ömürlü
   signed URL çözer. Böylece kalıcı public link tutulmaz. */
const STORAGE_BUCKET = 'secure-docs' // PRIVATE (public=false). Bkz. 0002_private_storage.sql
const SIGNED_TTL = 300               // saniye (kısa ömürlü)

async function uploadToStorage(blob, ext = 'jpg', prefix = 'mail') {
  // tahmin edilemez yol; müşteri klasörlemesi için prefix (mail/receipts/customers)
  const path = `${prefix}/${uid()}-${uid()}.${ext}`
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || 'application/octet-stream', upsert: false,
  })
  if (error) throw error
  return `secure:${path}` // public URL değil — DB'ye referans saklanır
}

/* Depolanan referansı görüntülenebilir URL'e çevirir.
   - "secure:<path>" → kısa ömürlü signed URL (private bucket)
   - dataURL / http(s) (eski/yerel) → olduğu gibi döner */
export async function resolveStoredUrl(stored) {
  if (!stored) return ''
  if (typeof stored === 'string' && stored.startsWith('secure:')) {
    if (!usingSupabase) return ''
    const path = stored.slice('secure:'.length)
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, SIGNED_TTL)
    if (error) return ''
    return data?.signedUrl || ''
  }
  return stored // dataURL / eski public URL — dokunma
}

export async function fileToStoredUrl(file, { maxW = 1000, quality = 0.6 } = {}) {
  if (!file) return ''
  const isImage = file.type.startsWith('image/')
  if (usingSupabase) {
    try {
      if (!isImage) return await uploadToStorage(file, (file.name || '').split('.').pop() || 'bin')
      const small = await shrinkImage(file, { maxW, quality })
      return await uploadToStorage(small, 'jpg')
    } catch { /* Storage kurulmamışsa dataURL'e düş */ }
  }
  if (!isImage) {
    // görsel değilse (PDF vb.) doğrudan dataURL — yerel modda küçük tut
    return await new Promise((res) => {
      const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file)
    })
  }
  const dataUrl = await new Promise((res) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file)
  })
  return await new Promise((res) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      res(cv.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => res(dataUrl)
    img.src = dataUrl
  })
}

/* Görseli küçültüp JPEG Blob döndürür (Storage yüklemesi için) */
async function shrinkImage(file, { maxW = 1000, quality = 0.6 } = {}) {
  const dataUrl = await new Promise((res) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file)
  })
  return await new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width)
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale)
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      cv.getContext('2d').drawImage(img, 0, 0, w, h)
      cv.toBlob((b) => (b ? res(b) : rej(new Error('blob üretilemedi'))), 'image/jpeg', quality)
    }
    img.onerror = () => res(file) // küçültme olmazsa orijinali yükle
    img.src = dataUrl
  })
}

/* ---------- gerçek gönderim (Supabase Edge Function) ----------
   Yalnızca bulut modu + ayarlarda real_send açıkken çalışır.
   Gizli anahtarlar istemcide DEĞİL, Edge Function secrets'ta durur.
   Dönüş: { status:'gönderildi'|'başarısız', error? } */
async function sendViaEdge({ channel, to, subject, message }) {
  if (!usingSupabase || !to) return { status: 'kayıt' }
  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: { channel, to, subject, message },
    })
    if (error) return { status: 'başarısız', error: error.message }
    return { status: data?.status || 'gönderildi', error: data?.error }
  } catch (e) {
    return { status: 'başarısız', error: String(e?.message || e) }
  }
}

/* ---------- bildirim log ----------
   real_send kapalıysa yalnızca 'kayıt' tutar (simülasyon).
   Açıksa + bulut modundaysa Edge Function'ı çağırıp sonucu status'a yazar. */
export async function logNotification({ customer_id, channel, event, to, message, subject }) {
  const cfg = getConfig()
  let status = 'kayıt'
  let error
  if (cfg.real_send && usingSupabase && to) {
    const res = await sendViaEdge({ channel, to, subject, message })
    status = res.status
    error = res.error
  }
  return notifications.create({
    customer_id, channel, event, to,
    message: error ? `${message}\n[hata: ${error}]` : message,
    status, // kayıt | gönderildi | başarısız
    sent_at: now(),
  })
}

/* ---------- olay bazlı bildirim ----------
   Ayarlarda açık kanallara göre şablonu doldurup log'a yazar.
   Sağlayıcı bağlanınca (Netgsm/WhatsApp/Edge Function) burada gerçek
   gönderim yapılır; şimdilik kayıt tutar. */
export async function notifyEvent(eventKey, customer, vars = {}) {
  const cfg = getConfig()
  const tpl = getTemplate(eventKey)
  if (!tpl || !customer) return []
  const message = renderTemplate(tpl.text, {
    ad: customer.contact || customer.title || '',
    firma: cfg.sender_name || 'GANU',
    ...vars,
  })
  const subject = `${cfg.sender_name || 'GANU'} · ${tpl.label}`
  const active = CHANNELS.filter((ch) => cfg.channels?.[ch])
  const targets = active.length ? active : ['email']
  const out = []
  for (const ch of targets) {
    const to = ch === 'email' ? (customer.email || '') : (customer.phone || '')
    out.push(await logNotification({ customer_id: customer.id, channel: ch, event: eventKey, to, message, subject }))
  }
  return out
}

/* ---------- e-fatura / e-arşiv kesimi (entegratör Edge Function) ----------
   Türkiye'de e-belge kesimi entegratör (Paraşüt/Uyumsoft/Foriba/İzibiz…)
   API'si üzerinden yapılır. Gizli anahtarlar istemcide DEĞİL, Supabase
   secrets'ta durur; kesim 'issue-einvoice' Edge Function'ında yapılır.
   Hesap bağlanana kadar bu fonksiyon kapalı (efatura_enabled=false) döner. */
export async function issueEInvoice(invoice, customer) {
  const cfg = getConfig()
  if (!cfg.efatura_enabled) {
    return { ok: false, reason: 'E-fatura entegrasyonu kapalı. Fatura & Gelir → e-Belge ayarlarından aç.' }
  }
  if (!cfg.efatura_provider) {
    return { ok: false, reason: 'Önce bir entegratör seç (Paraşüt, Uyumsoft, İzibiz…).' }
  }
  if (!usingSupabase) {
    return { ok: false, reason: 'E-belge yalnızca bulut modunda kesilir (Supabase gerekli).' }
  }
  if (!customer?.tax_no && !customer?.tc) {
    return { ok: false, reason: 'Müşterinin vergi no veya TC bilgisi eksik — e-belge için zorunlu.' }
  }
  try {
    const { data, error } = await supabase.functions.invoke('issue-einvoice', {
      body: {
        provider: cfg.efatura_provider,
        mode: cfg.efatura_mode,
        invoice: { amount: Number(invoice.amount) || 0, issue_date: invoice.issue_date, note: invoice.note || '' },
        customer: {
          title: customer.title, contact: customer.contact,
          tax_no: customer.tax_no, tax_office: customer.tax_office, tc: customer.tc,
          email: customer.email,
        },
      },
    })
    if (error) return { ok: false, reason: error.message }
    if (data?.status === 'başarısız') return { ok: false, reason: data.error }
    await invoices.update(invoice.id, {
      einvoice_uuid: data?.uuid || '',
      einvoice_no: data?.number || '',
      einvoice_status: data?.status || 'kesildi',
      einvoice_pdf: data?.pdf_url || '',
    })
    // e-belge kesildi → PDF linkiyle müşteriye OTOMATİK e-posta (zincirin son halkası)
    let mailed = false
    if (customer?.email) {
      try {
        await notifyEvent('einvoice_ready', customer, {
          tutar: `${Number(invoice.amount) || 0} ₺`,
          belge_no: data?.number || data?.uuid || '',
          link: data?.pdf_url || '',
          tarih: fmtTrDate(invoice.issue_date),
        })
        mailed = true
      } catch { /* bildirim hatası kesimi geri almaz */ }
    }
    return { ok: true, mailed, ...data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

/* ---------- kurulum adımları (onboarding) ----------
   Satın alma/başvuru sonrası süreç. Ayrı bir durum alanı YOK —
   her adım mevcut kayıtlardan türetilir; kayıt girildikçe kendiliğinden
   işaretlenir. Dönüş: [{ key, label, done, hint, to }] */
export function onboardingSteps(c, { contracts: ct = [], documents: docs = [], invoices: inv = [], inspections: insp = [] } = {}) {
  const my = (rows) => rows.filter((x) => x.customer_id === c.id)
  const myDocs = my(docs), myInv = my(inv)
  const contract = my(ct).find((x) => x.status === 'aktif')
  const signedDoc = myDocs.find((d) => d.type === 'sozlesme')
  const idDoc = myDocs.find((d) => ['kimlik', 'imza_sirkuleri', 'vergi_levhasi'].includes(d.type))
  const firstInv = myInv[0]
  const paidInv = myInv.find((i) => i.status === 'ödendi')
  const inspOk = my(insp).find((i) => i.result === 'olumlu')
  return [
    { key: 'iletisim', label: 'İletişim + vergi bilgileri', done: !!(c.phone || c.email) && !!(c.tax_no || c.tc),
      hint: 'Telefon/e-posta ve VKN ya da TC girilmeli (e-belge için zorunlu)', to: '' },
    { key: 'belge', label: 'Kimlik / imza belgeleri (MASAK-UBO)', done: !!idDoc,
      hint: 'Kimlik, imza sirküleri veya vergi levhası → Belge Kasası', to: '' },
    { key: 'sozlesme', label: 'Hizmet sözleşmesi', done: !!contract && !!signedDoc,
      hint: contract ? 'İmzalı nüshayı Belge Kasası\'na "Sözleşme" türüyle yükle' : 'Sözleşme kaydı oluştur (paket + süre + ücret)', to: '/panel/sozlesmeler' },
    { key: 'fatura', label: 'İlk fatura + tahsilat', done: !!paidInv,
      hint: firstInv ? 'Fatura kesildi — ödeme bekleniyor' : 'Fatura & Gelir → Yeni fatura', to: '/panel/faturalar' },
    { key: 'portal', label: 'Portal erişimi + KVKK onayı', done: !!c.access_code && !!c.kvkk_consent_at,
      hint: c.access_code ? `Kod verildi (${c.access_code}) — müşteri ilk girişte KVKK onaylayacak` : 'Erişim kodu üret ve müşteriye ilet', to: '' },
    { key: 'aktif', label: 'Müşteri aktif', done: c.status === 'aktif',
      hint: 'Sözleşme + ödeme tamamsa durumu "aktif" yap', to: '' },
    { key: 'yoklama', label: 'Vergi dairesi yoklaması (olumlu)', done: !!inspOk,
      hint: 'Kuruluş/adres nakli sonrası yoklamayı karşıla ve sonucu kaydet', to: '/panel/yoklama' },
  ]
}

/* ---------- ödeme onayı → kurulumu otomatik ilerlet ----------
   "Para hesaba geçti / kartla ödendi" onayı tek işlemde:
   sözleşme (1 yıl) + ÖDENDİ faturası + erişim kodu + aktif durum + bildirim.
   Kalan tek elle iş: belgeler ve yoklama. */
export async function activateAfterPayment(customer, pkg, amount, opts = {}) {
  const price = Number(amount) || PACKAGE_PRICES[pkg] || 0
  const bniPct = Number(opts.bniPct) || 0
  const noteSuffix = bniPct ? ` · BNI %${bniPct} indirim` : ''
  const today = new Date()
  const todayIso = isoLocal(today)
  const end = new Date(today); end.setFullYear(end.getFullYear() + 1)

  await contracts.create({
    customer_id: customer.id, package: pkg, price,
    start_date: todayIso, end_date: isoLocal(end), status: 'aktif', auto_renew: true,
  })
  const inv = await invoices.create({
    customer_id: customer.id, amount: price, status: 'ödendi',
    issue_date: todayIso, due_date: todayIso, paid_date: todayIso,
    note: `${pkg} yıllık — peşin tahsilat${noteSuffix}`,
  })
  const patch = { status: 'aktif' }
  if (!customer.access_code) {
    patch.access_code = Math.random().toString(36).slice(2, 8).toUpperCase()
  }
  const updated = await customers.update(customer.id, patch)
  const cust = updated || { ...customer, ...patch }

  // ödeme alındı → e-belge OTOMATİK kesilir (Paraşüt: cari bul/aç + fatura +
  // e-fatura/e-arşiv) ve issueEInvoice içinde PDF linkiyle müşteriye maillenir.
  // Kesim başarısızsa aktivasyon geri alınmaz; fatura panelde "kes" ile beklet.
  let einvoice = null
  const cfg = getConfig()
  if (cfg.efatura_enabled && usingSupabase && inv) {
    try { einvoice = await issueEInvoice(inv, cust) } catch { einvoice = { ok: false } }
  }
  // e-belge maili gittiyse ikinci bir "fatura kesildi" bildirimi atma
  if (!einvoice?.mailed) {
    await notifyEvent('invoice_issued', cust, { tutar: `${price} ₺`, tarih: fmtTrDate(todayIso) })
  }
  return { ...cust, _einvoice: einvoice }
}

/* ---------- otomasyon: sözleşme yenileme + hatırlatma ----------
   Panel her açıldığında (Dashboard) çalışır; iki iş yapar:
   1) Süresi DOLMUŞ + oto-yenile işaretli sözleşme: 1 yıl uzatılır,
      yenileme faturası kesilir, müşteriye bildirim düşer.
   2) 15 gün içinde bitecek sözleşme: müşteriye yenileme hatırlatması
      gönderilir (7 günde bir en fazla; auto_reminders açıksa).
   Dönüş: { renewed, reminded, invoiced } sayaçları. */
export async function runAutoTasks() {
  const cfg = getConfig()
  const [ct, cs, ml] = await Promise.all([contracts.list(), customers.list(), mail.list()])
  const byId = Object.fromEntries(cs.map((c) => [c.id, c]))
  const todayIso = new Date().toISOString().slice(0, 10)
  const out = { renewed: 0, reminded: 0, invoiced: 0, einvoiced: 0, sla: 0 }

  for (const c of ct) {
    if (c.status !== 'aktif') continue
    const cust = byId[c.customer_id]
    const days = daysLeft(c.end_date)

    if (days < 0 && c.auto_renew) {
      // yeni dönem: bitişten itibaren +1 yıl (yerel tarih — UTC kaymasına düşme)
      const [y, m, dd] = c.end_date.split('-')
      const newEnd = `${Number(y) + 1}-${m}-${dd}`
      const due = new Date(); due.setDate(due.getDate() + 15)
      await contracts.update(c.id, { start_date: c.end_date, end_date: newEnd, reminded_at: '' })
      const inv = await invoices.create({
        customer_id: c.customer_id, amount: Number(c.price) || 0, status: 'bekliyor',
        issue_date: todayIso, due_date: isoLocal(due), paid_date: '',
        note: `${c.package} yenileme (${fmtTrDate(c.end_date)} → ${fmtTrDate(newEnd)})`,
      })
      out.renewed++; out.invoiced++
      if (cust) await notifyEvent('invoice_issued', cust, { tutar: `${Number(c.price) || 0} ₺`, tarih: fmtTrDate(todayIso) })
      // OTOMATİK e-belge: entegrasyon açıksa yenileme faturası kesilir + PDF müşteriye maillenir
      if (cust && cfg.efatura_enabled && usingSupabase && inv) {
        const r = await issueEInvoice(inv, cust)
        if (r?.ok) out.einvoiced++
      }
    } else if (days >= 0 && days <= 15 && cfg.auto_reminders && cust) {
      const last = c.reminded_at ? new Date(c.reminded_at).getTime() : 0
      if (Date.now() - last > 7 * 86400000) {
        await notifyEvent('renewal_due', cust, { paket: c.package, gun: String(days), tarih: fmtTrDate(c.end_date) })
        await contracts.update(c.id, { reminded_at: new Date().toISOString() })
        out.reminded++
      }
    }
  }

  // KARGO SLA: teslim alınmayan gönderiler için otomatik ikinci bildirim
  // tebligat: 3 gün sonra (yasal süre kritik), diğer: 7 gün sonra; aynı aralıkla tekrarlanır
  if (cfg.auto_reminders) {
    for (const m of ml) {
      if (m.status !== 'geldi' && m.status !== 'bildirildi') continue
      const cust = byId[m.customer_id]
      if (!cust) continue
      const waitDays = daysLeft(m.received_date) * -1 // geçmiş tarih → pozitif bekleme
      const threshold = m.type === 'tebligat' ? 3 : 7
      if (waitDays < threshold) continue
      const last = m.sla_reminded_at ? new Date(m.sla_reminded_at).getTime() : 0
      if (Date.now() - last <= threshold * 86400000) continue
      await notifyEvent('mail_waiting', cust, {
        tur: m.type, gonderen: m.sender || '', tarih: fmtTrDate(m.received_date),
      })
      await mail.update(m.id, { sla_reminded_at: new Date().toISOString() })
      out.sla++
    }
  }
  return out
}
function fmtTrDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d) ? iso : d.toLocaleDateString('tr-TR')
}
/* Yerel takvim gününü YYYY-MM-DD üretir (toISOString UTC'ye kaydırır — kullanma) */
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ---------- geçiş (Supabase) doğrulama ----------
   Bulut modunda her tabloyu yoklar (erişim + satır sayısı), oturumu ve env
   anahtarlarını kontrol eder. Yerel modda localStorage sayımını raporlar.
   Gizli anahtar OKUMAZ; yalnızca erişilebilirlik/özet döndürür. */
export const TABLE_LABELS = {
  customers: 'Müşteriler', contracts: 'Sözleşmeler', mail_items: 'Kargo & Posta',
  invoices: 'Faturalar', documents: 'Belgeler', notifications: 'Bildirim kaydı',
  requests: 'Talepler', inspections: 'Yoklama', partners: 'İş ortakları',
  expenses: 'Masraflar', request_messages: 'Talep mesajları', bookings: 'Toplantı Odası',
}

export async function verifyMigration() {
  const cfg = getConfig()
  const names = Object.keys(TABLE)
  const tables = []
  const summary = { channels: { ...cfg.channels }, real_send: !!cfg.real_send, efatura_enabled: !!cfg.efatura_enabled }

  if (usingSupabase) {
    for (const name of names) {
      const t = TABLE[name]
      const label = TABLE_LABELS[name] || name
      try {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
        if (error) tables.push({ name, table: t, label, ok: false, error: error.message })
        else tables.push({ name, table: t, label, ok: true, count: count ?? 0 })
      } catch (e) {
        tables.push({ name, table: t, label, ok: false, error: String(e?.message || e) })
      }
    }
    let auth = { ok: false }
    try {
      const { data } = await supabase.auth.getUser()
      if (data?.user) auth = { ok: true, email: data.user.email }
    } catch { /* yoksay */ }
    return { mode: 'cloud', env: { url: true, key: true }, auth, tables, ...summary }
  }

  const db = read()
  for (const name of names) {
    const rows = Array.isArray(db[name]) ? db[name] : []
    tables.push({ name, table: TABLE[name], label: TABLE_LABELS[name] || name, ok: true, count: rows.length, local: true })
  }
  return { mode: 'local', env: { url: false, key: false }, auth: { ok: false }, tables, ...summary }
}
