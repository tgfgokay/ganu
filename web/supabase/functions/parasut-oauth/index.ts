import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serverRpc } from '../_shared/parasut-auth.ts'
import { oauthHandler } from '../_shared/parasut-oauth-handler.ts'

const get = (key: string) => (Deno.env.get(key) || '').trim()
const staff = async (req: Request): Promise<string | null> => {
  const authorization = req.headers.get('Authorization') || ''
  if (!get('SUPABASE_URL') || !get('SUPABASE_ANON_KEY') || !authorization.toLowerCase().startsWith('bearer ')) return null
  const client = createClient(get('SUPABASE_URL'), get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
  const { data: identity, error: identityError } = await client.auth.getUser(authorization.slice(7).trim())
  if (identityError || !identity?.user?.id) return null
  const { data, error } = await client.rpc('is_staff')
  return !error && data === true ? identity.user.id : null
}
Deno.serve(oauthHandler({ get, fetch, rpc: serverRpc(get), staff }))
