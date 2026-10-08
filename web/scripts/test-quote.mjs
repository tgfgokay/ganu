// Teklif modülü: saf yardımcılar + ödeme sonrası hat (sahte DB, ağ yok).
import assert from 'node:assert/strict'
const envVars = { EINVOICE_AUTO: '', RESEND_API_KEY: 're_test', MAIL_FROM: 'GANU <info@ganu.com.tr>' }
globalThis.Deno = { env: { get: (k) => envVars[k] ?? '' } }
const Q = await import('../supabase/functions/_shared/quote.ts')
const { runQuotePipeline } = await import('../supabase/functions/_shared/quote-pipeline.ts')

// Kimlik doğrulama
assert.equal(Q.validTckn('10000000146'), true)
assert.equal(Q.validTckn('12345678901'), false)
assert.equal(Q.validTckn('01234567890'), false)
assert.equal(Q.validVkn('1234567891'), false)
assert.equal(Q.validVkn('3892020110'), true, 'GANU VKN geçerli olmalı')
assert.equal(Q.maskId('10000000146'), '*******0146')
assert.equal(Q.maskEmail('ahmet@ornek.com'), 'ah***@ornek.com')
assert.equal(Q.validToken(Q.newToken()), true)
assert.equal(Q.validToken('kısa'), false)
assert.match(Q.newOtp(), /^\d{6}$/)
const h1 = await Q.otpHash('x'.repeat(32), 'q1', '123456'), h2 = await Q.otpHash('x'.repeat(32), 'q2', '123456')
assert.notEqual(h1, h2, 'OTP hash teklife bağlı olmalı')
assert.equal(Q.quoteAmount(9990, 10), 8991)

// Taraf kuralları
const adr = { address: 'Kavacık Mah. Okul Cad. No:29', city: 'İstanbul', district: 'Beykoz' }
assert.deepEqual(Q.partyErrors('şahıs', { title: 'Ali Veli', tc: '10000000146', ...adr }), [])
assert.ok(Q.partyErrors('kuruluş', { title: 'Ali Veli', tc: '', ...adr }).includes('geçerli TC kimlik no'))
assert.deepEqual(Q.partyErrors('şirket', { title: 'GANU Ltd', tax_no: '3892020110', tax_office: 'Beykoz', contact: 'Ali Topçu', ...adr }), [])
assert.ok(Q.partyErrors('şirket', { title: 'GANU Ltd', tax_no: '3892020110', tax_office: 'Beykoz', ...adr }).includes('yetkili ad soyad'))
assert.equal(Q.cleanParty('şirket', { tc: '10000000146', tax_no: '389 202 0110' }).tc, '', 'şirkette TCKN tutulmaz')

// Sözleşme şablonu
const q = { quote_no: 'GANU-T-2026-0001', party_type: 'kuruluş', planned_company: 'Yeni Ltd', package_id: 'Pro', billing_period: 'yıllık', amount: 17091, list_amount: 18990, discount_pct: 10, start_date: '2026-10-08', valid_until: '2026-10-23', accepted_at: '2026-10-08T10:00:00Z', acceptance_method: 'otp_email', contract_sha256: 'a'.repeat(64), contract_text: 'METİN <b>' }
const c = { title: 'Ali Veli', tc: '10000000146', email: 'ali@ornek.com', phone: '05xx', ...adr }
const vars = Q.contractVars(q, c, '2026-10-08')
assert.equal(vars.bitis, '07.10.2027')
assert.equal(vars.musteri_kimlik, 'TCKN 10000000146')
assert.equal(vars.kurulacak_sirket, 'Yeni Ltd')
assert.equal(Q.renderContract('Taraf: {{musteri_unvan}} / {{ tutar }}', vars), 'Taraf: Ali Veli / 17.091,00 TL (KDV dahil)')
assert.throws(() => Q.renderContract('{{bilinmeyen}}', vars), /bilinmeyen alan/)
const mail = Q.paidMail(q, c, 'GEA2026000000001')
assert.ok(mail.html.includes('METİN &lt;b&gt;'), 'e-posta HTML kaçışı')
assert.ok(Q.quoteMail(q, { title: '<script>' }, 'https://ganu.com.tr/teklif#t=x').html.includes('&lt;script&gt;'))

// Ödeme sonrası hat: sahte DB
function fakeDb({ invStatus = 'ödendi', amount = 17091, addressDoc = 'gerekmiyor', paidMail = null } = {}) {
  const st = { quote: { id: 'q1', status: 'kabul', invoice_id: 'i1', customer_id: 'c1', amount: 17091, address_doc: addressDoc, paid_mail_at: paidMail, welcome_mail_at: null, activated_at: null, ...q },
    inv: { id: 'i1', status: invStatus, amount, einvoice_status: null, einvoice_no: null, quote_id: 'q1' }, cust: { id: 'c1', email: 'ali@ornek.com', ...c }, rpc: [], updates: [] }
  const table = (name) => {
    const ctx = { name, filters: {} }
    const api = {
      select: () => api, eq: (k, v) => { ctx.filters[k] = v; return api }, in: () => api,
      maybeSingle: async () => ({ data: name === 'quotes' ? st.quote : name === 'invoices' ? st.inv : st.cust }),
      single: async () => ({ data: name === 'customers' ? st.cust : null }),
      update: (patch) => { st.updates.push([name, patch]); if (name === 'quotes') Object.assign(st.quote, patch); return api },
      then: (res) => res({ error: null }),
    }
    return api
  }
  const db = {
    from: table,
    rpc: async (fn, args) => {
      st.rpc.push(fn)
      if (fn === 'quote_claim_mail') { const k = args.p_kind === 'paid' ? 'paid_mail_at' : 'welcome_mail_at'; if (st.quote[k]) return { data: false }; st.quote[k] = 'now'; return { data: true } }
      if (fn === 'quote_try_activate') {
        const missing = []; if (st.inv.status !== 'ödendi') missing.push('ödeme'); if (st.quote.address_doc === 'bekliyor') missing.push('adres_belgesi')
        if (missing.length) return { data: { state: 'eksik', missing } }
        if (st.quote.activated_at) return { data: { state: 'zaten' } }
        st.quote.activated_at = 'now'; return { data: { state: 'aktif' } }
      }
      return { data: null }
    },
  }
  return { db, st }
}
const sent = []
globalThis.fetch = async (url, init) => { sent.push([url, JSON.parse(init.body).subject, init.headers['Idempotency-Key']]); return new Response(JSON.stringify({ id: 'm1' }), { status: 200 }) }

let { db, st } = fakeDb({ invStatus: 'bekliyor' })
let r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'ödeme_bekleniyor'); assert.equal(sent.length, 0)

;({ db, st } = fakeDb({ addressDoc: 'bekliyor' }))
r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'eksik'); assert.deepEqual(r.missing, ['adres_belgesi']); assert.equal(sent.length, 1, 'ödeme e-postası adres belgesi beklenirken de gider')
assert.ok(r.steps.includes('e-Belge: otomatik kapalı (elle kesilecek)'))
st.quote.address_doc = 'yüklendi'
r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'aktif'); assert.equal(sent.length, 2, 'ikinci çalıştırmada ödeme e-postası tekrar gitmez, hoş geldin gider')
r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'aktif'); assert.equal(sent.length, 2, 'üçüncü çalıştırma e-posta göndermez')
assert.ok(sent.every(([, , key]) => /^quote-(paid|welcome)-q1$/.test(key)), 'Resend idempotency anahtarı')

;({ db, st } = fakeDb({ amount: 100 }))
r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'hata'); assert.match(r.error, /tutar/)

envVars.RESEND_API_KEY = ''
;({ db, st } = fakeDb())
r = await runQuotePipeline(db, 'q1', 'https://ganu.com.tr')
assert.equal(r.state, 'aktif', 'e-posta servisi yokken aktivasyon yine olur')
assert.ok(r.steps.includes('ödeme e-postası: e-posta servisi kurulmadı'))

console.log('quote tests: PASS')
