// Private secure-docs nesnesi için gerçek Supabase JWT sahipliğini doğrular ve
// 300 saniyelik signed URL döner. Gateway JWT doğrulaması AÇIKTIR. access_code
// kabul edilmez; müşteri customers.auth_uid, personel staff_roles ile yetkilidir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE = Deno.env.get('SITE_URL') || ''
let origin = ''
try { origin = SITE ? new URL(SITE).origin : '' } catch { origin = '' }
const cors = {
  ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (!origin) return json({ error: 'SITE_URL yapılandırılmadı' }, 500)
  const requestOrigin = req.headers.get('origin') || ''
  if (requestOrigin && requestOrigin !== origin) return json({ error: 'Origin izinli değil' }, 403)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  try {
    const { path = '' } = await req.json()
    if (typeof path !== 'string' || !/^(customers|mail|receipts)\/[0-9a-f-]+\/[A-Za-z0-9._-]+$/.test(path)) {
      return json({ error: 'Geçersiz dosya yolu' }, 400)
    }
    const url = Deno.env.get('SUPABASE_URL')
    const anon = Deno.env.get('SUPABASE_ANON_KEY')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anon || !key) throw new Error('Storage sunucu secret eksik')
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'JWT gerekli' }, 401)

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    const uid = userData?.user?.id
    if (userErr || !uid) return json({ error: 'JWT doğrulanamadı' }, 401)

    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data: staff } = await db.from('staff_roles').select('user_id').eq('user_id', uid).maybeSingle()
    let allowed = !!staff
    if (!allowed) {
      const { data: customer, error: customerErr } = await db.from('customers')
        .select('id').eq('auth_uid', uid).maybeSingle()
      if (customerErr) throw customerErr
      if (customer?.id) {
        allowed = path.startsWith(`customers/${customer.id}/`) ||
          path.startsWith(`mail/${customer.id}/`) || path.startsWith(`receipts/${customer.id}/`)
      }
    }
    if (!allowed) return json({ error: 'Dosyaya erişim yok' }, 403)

    const { data, error } = await db.storage.from('secure-docs').createSignedUrl(path, 300)
    if (error || !data?.signedUrl) throw error || new Error('Signed URL üretilemedi')
    return json({ url: data.signedUrl, expires_in: 300 })
  } catch (e) {
    console.error('get-file:', (e as Error)?.message || e)
    return json({ error: 'Dosya bağlantısı üretilemedi' }, 500)
  }
})
