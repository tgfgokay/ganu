// Private secure-docs nesnesi için müşteri sahipliğini sunucuda doğrular ve
// 300 saniyelik signed URL döner. Anon portal çağrısı nedeniyle --no-verify-jwt
// ile deploy edilir; boş/yanlış access_code owns_secure_object tarafından reddedilir.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SITE = Deno.env.get('SITE_URL') || ''
const origin = SITE ? new URL(SITE).origin : '*'
const cors = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)
  try {
    const { path = '', code = '' } = await req.json()
    if (typeof path !== 'string' || !/^(customers|mail|receipts)\/[0-9a-f-]+\/[A-Za-z0-9._-]+$/.test(path)) {
      return json({ error: 'Geçersiz dosya yolu' }, 400)
    }
    if (typeof code !== 'string' || !code.trim()) return json({ error: 'Erişim kodu gerekli' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('Storage sunucu secret eksik')
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data: owns, error: ownErr } = await db.rpc('owns_secure_object', { p_code: code, p_path: path })
    if (ownErr) throw ownErr
    if (owns !== true) return json({ error: 'Dosyaya erişim yok' }, 403)

    const { data, error } = await db.storage.from('secure-docs').createSignedUrl(path, 300)
    if (error || !data?.signedUrl) throw error || new Error('Signed URL üretilemedi')
    return json({ url: data.signedUrl, expires_in: 300 })
  } catch (e) {
    console.error('get-file:', (e as Error)?.message || e)
    return json({ error: 'Dosya bağlantısı üretilemedi' }, 500)
  }
})
