// PayTR Linkle Ödeme: imza, istek alanları ve bildirim kararı (ağ yok). Beklenen imzalar Node crypto ile bağımsız hesaplanır.
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildCreateRequest, callbackIdFor, decideCallback, expiryFor, hmacB64, invoiceIdFromCallback, linkName, toKurus, verifyCallback } from '../supabase/functions/paytr-link/paytr.ts'

const env = { merchantId: '123456', merchantKey: 'KEYkeyKEYkey1234', merchantSalt: 'SALTsaltSALT5678', callbackUrl: 'https://abc.supabase.co/functions/v1/paytr-link', maxInstallment: '1', debug: false, acceptTest: false }
const nodeHmac = (key, msg) => createHmac('sha256', key).update(msg).digest('base64')
const inv = { id: '0b1c2d3e-0000-4000-8000-000000000001', amount: 18990, status: 'bekliyor', note: 'Ekim 2026 yıllık', due_date: '2026-10-04' }
const customer = { title: 'Aydın Yazılım Ltd. Şti.', email: 'muhasebe@aydin.test' }
const run = async (name, fn) => { await fn(); console.log(`PASS ${name}`) }

await run('HMAC-SHA256 base64 Node crypto ile aynı (Türkçe karakterli metin)', async () => {
  assert.equal(await hmacB64('k', 'GANU şirket ödeme ğüşıöç'), nodeHmac('k', 'GANU şirket ödeme ğüşıöç'))
})

await run('create isteği: alanlar ve paytr_token (collection + email sırası)', async () => {
  const p = await buildCreateRequest(inv, customer, env, new Date('2026-09-30T09:00:00Z'))
  assert.equal(p.get('merchant_id'), '123456'); assert.equal(p.get('price'), '1899000'); assert.equal(p.get('currency'), 'TL')
  assert.equal(p.get('max_installment'), '1'); assert.equal(p.get('link_type'), 'collection'); assert.equal(p.get('lang'), 'tr')
  assert.equal(p.get('email'), 'muhasebe@aydin.test'); assert.equal(p.get('callback_link'), env.callbackUrl)
  assert.equal(p.get('callback_id'), '0b1c2d3e000040008000000000000001'); assert.equal(p.get('debug_on'), '0')
  assert.equal(p.get('expiry_date'), '2026-10-30 23:59:59')
  const name = p.get('name')
  assert.equal(name, 'GANU sanal ofis hizmeti · Aydın Yazılım Ltd. Şti. · Ekim 2026 yıllık')
  assert.equal(p.get('paytr_token'), nodeHmac(env.merchantKey, `${name}1899000TL1collectiontrmuhasebe@aydin.test${env.merchantSalt}`))
})

await run('create: e-postasız müşteri ve sıfır tutar reddedilir', async () => {
  await assert.rejects(buildCreateRequest(inv, { title: 'X Ltd.', email: '' }, env), /e-posta/)
  await assert.rejects(buildCreateRequest({ ...inv, amount: 0 }, customer, env), /sıfırdan büyük/)
})

await run('tutar kuruşa çevrimi ve ad uzunluğu', async () => {
  assert.equal(toKurus(1199), 119900); assert.equal(toKurus('999.99'), 99999); assert.equal(toKurus(14.45), 1445)
  assert.ok(linkName({ title: 'x'.repeat(300) }, inv).length <= 200)
})

await run('callback_id ↔ fatura UUID', async () => {
  assert.equal(invoiceIdFromCallback(callbackIdFor(inv.id)), inv.id)
  assert.equal(invoiceIdFromCallback('not-a-uuid'), null); assert.equal(invoiceIdFromCallback("0b1c2d3e0000400080000000000000'1"), null)
})

const post = (over = {}) => {
  const p = { merchant_oid: 'LNK98765AB', status: 'success', total_amount: '1899000', payment_amount: '1899000', payment_type: 'card', currency: 'TL', callback_id: callbackIdFor(inv.id), merchant_id: '123456', test_mode: '0', ...over }
  p.hash = over.hash ?? nodeHmac(env.merchantKey, `${p.callback_id}${p.merchant_oid}${env.merchantSalt}${p.status}${p.total_amount}`)
  return p
}

await run('bildirim imzası: doğru imza kabul, değiştirilmiş tutar/imza red', async () => {
  assert.equal(await verifyCallback(post(), env), true)
  const tampered = post(); tampered.total_amount = '100'
  assert.equal(await verifyCallback(tampered, env), false)
  assert.equal(await verifyCallback(post({ hash: 'AAAA' }), env), false)
  assert.equal(await verifyCallback(post(), { ...env, merchantSalt: 'baska' }), false)
})

await run('karar: doğru bildirim ödendi, taksit farkı ödenen tutara yansır', async () => {
  assert.deepEqual(decideCallback(inv, post(), env), { action: 'mark_paid', merchantOid: 'LNK98765AB', paid: 18990 })
  assert.deepEqual(decideCallback(inv, post({ total_amount: '1950000' }), env), { action: 'mark_paid', merchantOid: 'LNK98765AB', paid: 19500 })
})

await run('karar: tutar/para birimi uyuşmazlığı incelemeye, test/başka mağaza/fatura yok yok sayılır', async () => {
  assert.equal(decideCallback(inv, post({ payment_amount: '100' }), env).action, 'review')
  assert.equal(decideCallback(inv, post({ currency: 'USD' }), env).action, 'review')
  assert.equal(decideCallback(inv, post({ test_mode: '1' }), env).action, 'ignore')
  assert.equal(decideCallback(inv, post({ test_mode: '1' }), { ...env, acceptTest: true }).action, 'mark_paid')
  assert.equal(decideCallback(inv, post({ merchant_id: '999' }), env).action, 'ignore')
  assert.equal(decideCallback(null, post(), env).action, 'ignore')
  assert.equal(decideCallback(inv, post({ merchant_oid: 'x;drop' }), env).action, 'review')
})

await run('son kullanma tarihi İstanbul gününe göre', async () => {
  assert.equal(expiryFor(new Date('2026-09-30T22:30:00Z'), 0), '2026-10-01 23:59:59')
})

console.log('paytr link tests PASS')
