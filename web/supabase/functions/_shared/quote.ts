// Teklif modülünün saf yardımcıları (ağ/DB yok; node testiyle sınanır).
const enc = new TextEncoder()
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)))
}
// 32 bayt (256 bit) CSPRNG; URL-güvenli base64. DB'ye yalnız SHA-256'sı yazılır.
export function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
export const validToken = (t: unknown) => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t)
export function newOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return String(n).padStart(6, '0')
}
// OTP hash'i teklife ve gizli anahtara bağlı (HMAC): DB sızsa bile 10^6 deneme ile tersine çevrilemez.
export async function otpHash(secret: string, quoteId: string, otp: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`quote-otp\0${quoteId}\0${otp}`)))
}
export async function keyedHash(secret: string, domain: string, value: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`${domain}\0${value}`)))
}

export const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
// TCKN algoritması (11 hane, ilk hane 0 değil, 10. ve 11. hane kontrolü).
export function validTckn(v: unknown): boolean {
  const s = digits(v)
  if (!/^[1-9]\d{10}$/.test(s)) return false
  const d = [...s].map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8], even = d[1] + d[3] + d[5] + d[7]
  if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false
  return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10]
}
// VKN algoritması (10 hane).
export function validVkn(v: unknown): boolean {
  const s = digits(v)
  if (!/^\d{10}$/.test(s)) return false
  const d = [...s].map(Number)
  let sum = 0
  for (let i = 0; i < 9; i++) {
    const t = (d[i] + 10 - (i + 1)) % 10
    let p = (t * 2 ** (10 - (i + 1))) % 9
    if (t !== 0 && p === 0) p = 9
    sum += p
  }
  return (10 - (sum % 10)) % 10 === d[9]
}
export function maskId(v: unknown): string {
  const s = digits(v)
  if (!s) return ''
  return s.length <= 4 ? '****' : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`
}
export function maskEmail(v: unknown): string {
  const s = String(v ?? '')
  const [u, d] = s.split('@')
  if (!u || !d) return ''
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(1, u.length - 2))}@${d}`
}
export const validEmail = (v: unknown) => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(String(v ?? '').trim())
export const tl = (n: unknown) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)
export const trDate = (iso: unknown) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString('tr-TR', { timeZone: 'UTC' }) : '')
export const istanbulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export type PartyType = 'şahıs' | 'şirket' | 'kuruluş'
export type Party = { title: string; contact?: string; tc?: string; tax_no?: string; tax_office?: string; address?: string; city?: string; district?: string }

// Kabulde taraf kimliği zorunlu: şahıs/kuruluş → kurucu/kişi TCKN; şirket → VKN + vergi dairesi + yetkili adı.
// Adres alanları e-Arşiv için zorunludur (müşteri GANU adresini de yazabilir).
export function partyErrors(type: PartyType, p: Party): string[] {
  const out: string[] = []
  if (String(p.title || '').trim().length < 3) out.push(type === 'şirket' ? 'şirket unvanı' : 'ad soyad')
  if (type === 'şirket') {
    if (!validVkn(p.tax_no)) out.push('geçerli VKN')
    if (String(p.tax_office || '').trim().length < 2) out.push('vergi dairesi')
    if (String(p.contact || '').trim().length < 3) out.push('yetkili ad soyad')
  } else if (!validTckn(p.tc)) out.push('geçerli TC kimlik no')
  for (const [k, label] of [['address', 'adres'], ['city', 'il'], ['district', 'ilçe']] as const) if (String(p[k] || '').trim().length < 2) out.push(label)
  return out
}
export function cleanParty(type: PartyType, raw: Record<string, unknown>): Party {
  const s = (k: string, n = 200) => String(raw?.[k] ?? '').trim().slice(0, n)
  return {
    title: s('title'), contact: s('contact', 120), tax_office: s('tax_office', 100), address: s('address', 300), city: s('city', 60), district: s('district', 60),
    tc: type === 'şirket' ? '' : digits(raw?.tc).slice(0, 11), tax_no: type === 'şirket' ? digits(raw?.tax_no).slice(0, 10) : '',
  }
}

// Şablon değişkenleri {{anahtar}}. Bilinmeyen anahtar boş kalmaz: hata verir (eksik sözleşme gönderilmez).
export const TEMPLATE_KEYS = ['teklif_no', 'tarih', 'taraf_turu', 'musteri_unvan', 'musteri_kimlik', 'musteri_vergi_dairesi', 'musteri_adres', 'musteri_eposta', 'musteri_telefon', 'yetkili', 'kurulacak_sirket', 'paket', 'donem', 'tutar', 'liste_tutar', 'indirim', 'baslangic', 'bitis'] as const
export type TemplateVars = Record<(typeof TEMPLATE_KEYS)[number], string>
export function renderContract(body: string, vars: TemplateVars): string {
  const unknown: string[] = []
  const out = body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k: string) => {
    if (!(TEMPLATE_KEYS as readonly string[]).includes(k)) { unknown.push(k); return '' }
    return String((vars as Record<string, string>)[k] ?? '')
  })
  if (unknown.length) throw new Error(`Sözleşme şablonunda bilinmeyen alan: ${[...new Set(unknown)].join(', ')}`)
  return out
}
export function contractVars(q: Record<string, any>, c: Record<string, any>, today = istanbulToday()): TemplateVars {
  const start = q.start_date || today
  const d = new Date(`${start}T00:00:00Z`)
  if (q.billing_period === 'aylık') d.setUTCMonth(d.getUTCMonth() + 1); else d.setUTCFullYear(d.getUTCFullYear() + 1)
  d.setUTCDate(d.getUTCDate() - 1)
  const kimlik = q.party_type === 'şirket' ? `VKN ${digits(c.tax_no)}` : `TCKN ${digits(c.tc)}`
  return {
    teklif_no: q.quote_no, tarih: trDate(today), taraf_turu: q.party_type === 'şirket' ? 'Tüzel kişi' : q.party_type === 'kuruluş' ? 'Gerçek kişi (kurulacak şirket hesabına)' : 'Gerçek kişi',
    musteri_unvan: c.title || '', musteri_kimlik: kimlik, musteri_vergi_dairesi: c.tax_office || '-', musteri_adres: [c.address, c.district, c.city].filter(Boolean).join(', '),
    musteri_eposta: c.email || '', musteri_telefon: c.phone || '', yetkili: q.party_type === 'şirket' ? (c.contact || '') : (c.title || ''),
    kurulacak_sirket: q.party_type === 'kuruluş' ? (q.planned_company || '-') : '-', paket: q.package_id, donem: q.billing_period,
    tutar: `${tl(q.amount)} TL (KDV dahil)`, liste_tutar: `${tl(q.list_amount)} TL`, indirim: q.discount_pct ? `%${q.discount_pct}` : '-',
    baslangic: trDate(start), bitis: trDate(d.toISOString().slice(0, 10)),
  }
}

export function quoteAmount(list: number, pct: number): number {
  const p = Math.min(100, Math.max(0, Math.trunc(Number(pct) || 0)))
  return Math.round((Number(list) || 0) * (100 - p)) / 100
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
const shell = (title: string, inner: string) => `<!doctype html><html lang="tr"><body style="margin:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;color:#1f2937"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:28px"><tr><td><div style="font-size:13px;letter-spacing:.12em;color:#0f766e;font-weight:bold">GANU</div><h1 style="font-size:20px;margin:8px 0 16px">${esc(title)}</h1>${inner}<p style="font-size:12px;color:#6b7280;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px">GANU Ofis Hizmetleri Ltd. Şti. · Kavacık Mah. Okul Cad. No:29 Kat:4 D:8 Beykoz / İstanbul · info@ganu.com.tr</p></td></tr></table></td></tr></table></body></html>`
const btn = (href: string, label: string) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`

export type Mail = { subject: string; html: string; text: string }
export function quoteMail(q: Record<string, any>, c: Record<string, any>, link: string): Mail {
  const subject = `GANU sanal ofis teklifiniz · ${q.quote_no}`
  const rows = `<table style="font-size:14px;border-collapse:collapse;width:100%">${[['Paket', `${q.package_id} (${q.billing_period})`], ['Tutar', `${tl(q.amount)} TL (KDV dahil)`], ...(q.discount_pct ? [['İndirim', `%${q.discount_pct}`]] : []), ['Geçerlilik', trDate(q.valid_until)]].map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7280">${esc(k)}</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(v)}</td></tr>`).join('')}</table>`
  const html = shell('Teklifiniz hazır', `<p>Sayın ${esc(c.contact || c.title)},</p><p>Talebiniz üzerine hazırlanan teklif aşağıdadır. Bağlantıdan sözleşme metnini inceleyip e-postanıza gelecek doğrulama koduyla onaylayabilir, ardından kartla ya da havaleyle ödeme yapabilirsiniz.</p>${rows}${btn(link, 'Teklifi incele ve onayla')}<p style="font-size:12px;color:#6b7280">Bağlantı size özeldir; başkasıyla paylaşmayın.</p>`)
  const text = `Sayın ${c.contact || c.title},\n\nGANU sanal ofis teklifiniz (${q.quote_no}):\nPaket: ${q.package_id} (${q.billing_period})\nTutar: ${tl(q.amount)} TL (KDV dahil)\nGeçerlilik: ${trDate(q.valid_until)}\n\nİncele ve onayla: ${link}\n\nGANU Ofis Hizmetleri · info@ganu.com.tr`
  return { subject, html, text }
}
export function otpMail(q: Record<string, any>, otp: string): Mail {
  const subject = `Doğrulama kodu: ${otp} · ${q.quote_no}`
  const html = shell('Teklif onay kodu', `<p>${esc(q.quote_no)} numaralı teklifi ve sözleşmeyi onaylamak için kodunuz:</p><p style="font-size:30px;letter-spacing:.3em;font-weight:bold;margin:18px 0">${esc(otp)}</p><p style="font-size:13px;color:#6b7280">Kod 10 dakika geçerlidir. Bu işlemi siz başlatmadıysanız e-postayı dikkate almayın.</p>`)
  return { subject, html, text: `${q.quote_no} onay kodunuz: ${otp} (10 dakika geçerli).` }
}
export function paidMail(q: Record<string, any>, c: Record<string, any>, einvoice: string): Mail {
  const subject = `Ödemeniz alındı · ${q.quote_no}`
  const html = shell('Ödemeniz alındı', `<p>Sayın ${esc(c.contact || c.title)},</p><p>${esc(q.quote_no)} numaralı teklifiniz için ${esc(tl(q.amount))} TL ödemeniz alınmıştır. ${einvoice ? `Faturanız ${esc(einvoice)} numarasıyla düzenlenmiştir.` : 'Faturanız düzenlendiğinde ayrıca iletilecektir.'}</p><p>Onayladığınız hizmet sözleşmesinin tam metni ve onay kaydı aşağıdadır.</p><pre style="white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;font-size:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px">${esc(q.contract_text)}</pre><p style="font-size:12px;color:#6b7280">Onay: ${esc(new Date(q.accepted_at).toISOString())} UTC · yöntem: ${esc(q.acceptance_method === 'otp_email' ? 'e-posta doğrulama kodu' : 'ıslak imza')} · SHA-256: ${esc(q.contract_sha256)}</p>`)
  const text = `${q.quote_no}: ${tl(q.amount)} TL ödemeniz alındı.${einvoice ? ` Fatura no: ${einvoice}.` : ''}\n\nSözleşme metni:\n\n${q.contract_text}\n\nOnay: ${new Date(q.accepted_at).toISOString()} UTC · SHA-256 ${q.contract_sha256}`
  return { subject, html, text }
}
export function welcomeMail(q: Record<string, any>, c: Record<string, any>): Mail {
  const subject = 'GANU sanal ofis hizmetiniz başladı'
  const html = shell('Hoş geldiniz', `<p>Sayın ${esc(c.contact || c.title)},</p><p>${esc(q.package_id)} paketiniz etkinleştirildi. Yasal adres bilgileriniz, posta/kargo bildirimleri ve toplantı odası talepleriniz için bize info@ganu.com.tr adresinden ulaşabilirsiniz.</p><p><strong>Adres:</strong> Kavacık Mah. Okul Cad. No:29 Kat:4 D:8 Beykoz / İstanbul</p>`)
  return { subject, html, text: `${q.package_id} paketiniz etkinleştirildi. Adres: Kavacık Mah. Okul Cad. No:29 Kat:4 D:8 Beykoz / İstanbul · info@ganu.com.tr` }
}
