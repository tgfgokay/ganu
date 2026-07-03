// ============================================================
// GANU Panel · e-Fatura / e-Arşiv kesme Edge Function (Deno)
// ------------------------------------------------------------
// Türkiye'de e-belge, GİB onaylı bir ENTEGRATÖR üzerinden kesilir.
// Bu fonksiyon istemciden gelen fatura + müşteri bilgisini alır,
// seçilen entegratörün API'sine iletir ve belge UUID/numarasını döner.
//
// Gizli anahtarlar ASLA istemciye konmaz — Supabase secrets:
//   supabase secrets set EFATURA_PROVIDER=parasut
//   supabase secrets set PARASUT_CLIENT_ID=... PARASUT_CLIENT_SECRET=...
//   supabase secrets set PARASUT_COMPANY_ID=... PARASUT_EMAIL=... PARASUT_PASSWORD=...
//   # veya Uyumsoft/İzibiz/Foriba için ilgili anahtarlar
//
// Dağıtım:
//   supabase functions deploy issue-einvoice
//
// İstek gövdesi (JSON):
//   { provider, mode: "e-arsiv"|"e-fatura",
//     invoice: { amount, issue_date, note },
//     customer: { title, contact, tax_no, tax_office, tc, email } }
//
// NOT: Aşağıdaki sağlayıcı çağrıları İSKELET'tir. Hesap açılıp
// entegratör dokümanına göre gerçek uç noktalar/gövdeler doldurulacak.
// ============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Invoice = { amount: number; issue_date?: string; note?: string }
type Customer = { title?: string; contact?: string; tax_no?: string; tax_office?: string; tc?: string; email?: string }

// ---- Paraşüt (örnek iskelet) ----
async function issueParasut(mode: string, invoice: Invoice, customer: Customer) {
  const clientId = Deno.env.get('PARASUT_CLIENT_ID')
  const clientSecret = Deno.env.get('PARASUT_CLIENT_SECRET')
  const companyId = Deno.env.get('PARASUT_COMPANY_ID')
  const email = Deno.env.get('PARASUT_EMAIL')
  const password = Deno.env.get('PARASUT_PASSWORD')
  if (!clientId || !clientSecret || !companyId || !email || !password) {
    throw new Error('Paraşüt secrets eksik (CLIENT_ID/SECRET, COMPANY_ID, EMAIL, PASSWORD).')
  }

  // 1) OAuth token
  const tokenRes = await fetch('https://api.parasut.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'password', client_id: clientId, client_secret: clientSecret,
      username: email, password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
    }),
  })
  const token = await tokenRes.json()
  if (!tokenRes.ok) throw new Error('Paraşüt token hata: ' + JSON.stringify(token))

  // 2) Satış faturası oluştur (gerçek gövde entegratör dokümanına göre doldurulacak)
  //    Ardından e-arşiv/e-fatura'ya dönüştür (mode'a göre).
  //    Bu iskelet, hesap açılınca tamamlanacak.
  return {
    provider: 'parasut', mode,
    uuid: crypto.randomUUID(),
    number: 'TASLAK',
    status: 'kesildi',
    _note: 'İskelet: Paraşüt satış faturası + e-belge dönüşümü buraya eklenecek.',
  }
}

// ---- Diğer entegratörler için yer tutucu ----
async function issueGeneric(provider: string, mode: string, _invoice: Invoice, _customer: Customer) {
  // İzibiz / Uyumsoft / Foriba / Logo / Mükellef — her biri kendi API'siyle
  throw new Error(`'${provider}' entegratörü henüz bağlanmadı. Hesap açılınca bu fonksiyona eklenecek.`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)

  try {
    const { provider, mode = 'e-arsiv', invoice, customer } = await req.json()
    if (!provider || !invoice) return json({ error: 'provider ve invoice zorunlu' }, 400)
    if (!customer?.tax_no && !customer?.tc) return json({ error: 'Müşteri vergi no/TC zorunlu' }, 400)

    let result
    if (provider === 'parasut') result = await issueParasut(mode, invoice, customer)
    else result = await issueGeneric(provider, mode, invoice, customer)

    return json(result)
  } catch (e) {
    return json({ status: 'başarısız', error: String((e as Error).message || e) }, 500)
  }
})
