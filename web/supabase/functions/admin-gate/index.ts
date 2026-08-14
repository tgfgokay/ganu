// ============================================================
// GANU · PROD READINESS — admin-gate Edge Function (Deno)
// ------------------------------------------------------------
// Amaç: "admin/owner, GERÇEK authenticated JWT ile admin RPC'sini
// çalıştırabiliyor" kanıtını üretmek. Bu kanıt prod_readiness_gate.sql
// tarafından aranır; yoksa production deploy'u DURUR.
//
// Neden pür SQL yetmez:
//   • SQL Editor'de request.jwt.claims ELLE set edilebilir → sahte "admin".
//   • Burada JWT, auth sunucusuyla getUser() ÜZERİNDEN doğrulanır (imza
//     kontrolü); elle uydurulan claim getUser'dan GEÇMEZ.
//   • Kanıt tablosu yalnız service-role'a açık → SQL editor'de elle yazılamaz.
//
// Dağıtım (JWT doğrulaması AÇIK — --no-verify-jwt KULLANMA):
//   supabase functions deploy admin-gate
// Secret'lar: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// Çağrı (gerçek owner/admin JWT ile):
//   curl -X POST "$SUPABASE_URL/functions/v1/admin-gate" \
//     -H "Authorization: Bearer <OWNER_ACCESS_TOKEN>" -H "apikey: <ANON>"
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROBE_ID = '00000000-0000-4000-8000-0000000000aa' // 0004_prod_gate.sql
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

function admin() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key, { auth: { persistSession: false } })
}

function randomPass(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return 'Gate-' + Array.from(a, (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST kullanın' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ ok: false, error: 'Authorization Bearer JWT gerekli' }, 401)
  }

  const url = Deno.env.get('SUPABASE_URL')!
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!

  try {
    // 1) JWT'yi GERÇEKTEN doğrula (auth sunucusu) — elle set claim buradan geçmez.
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: u, error: uErr } = await userClient.auth.getUser()
    if (uErr || !u?.user?.id) return json({ ok: false, error: 'Geçersiz/doğrulanamayan JWT' }, 401)
    const uid = u.user.id

    // 2) uid gerçekten auth.users'ta (getUser bunu zaten kanıtlar) + owner/admin mi?
    const db = admin()
    const { data: roleRow } = await db.from('staff_roles')
      .select('role').eq('user_id', uid).in('role', ['owner', 'admin']).maybeSingle()
    if (!roleRow) return json({ ok: false, error: 'Kullanıcı owner/admin değil' }, 403)

    // 3) Admin RPC yolunu GERÇEK JWT ile çalıştır (kanıt): set_portal_password
    //    probe müşteride. userClient → auth.uid()=uid → set_portal_password authz PASS.
    const { error: rpcErr } = await userClient.rpc('set_portal_password', {
      p_customer_id: PROBE_ID, p_new: randomPass(),
    })
    if (rpcErr) return json({ ok: false, error: 'admin RPC (set_portal_password) başarısız: ' + rpcErr.message }, 403)

    // 4) Kanıtı service-role ile yaz (SQL editor'de üretilemez).
    const { error: insErr } = await db.from('prod_gate_proof').insert({
      uid, role: roleRow.role, method: 'jwt',
      detail: { checked: 'set_portal_password@probe', ua: req.headers.get('user-agent') || '' },
    })
    if (insErr) return json({ ok: false, error: 'Kanıt yazılamadı: ' + insErr.message }, 500)

    return json({ ok: true, uid, role: roleRow.role, method: 'jwt' })
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500)
  }
})
