/* ============================================================
   GANU Panel · Oturum yönetimi (çift mod)
   ------------------------------------------------------------
   • Supabase yapılandırılmışsa (.env → VITE_SUPABASE_*) gerçek
     e-posta + parola kimlik doğrulaması (supabase.auth) kullanılır.
   • Yapılandırılmamışsa yerel tek-parola kapısına düşülür (dev).
   Tüm API async'tir ve arayüz her iki modda da aynıdır.
   ============================================================ */
import { supabase, usingSupabase } from './supabase.js'

const SESSION_KEY = 'ganu.panel.session'
const PASS_KEY = 'ganu.panel.pass'
const DEFAULT_PASS = 'ganu2026' // yalnız yerel mod; panelden değiştirilebilir

export const authMode = usingSupabase ? 'supabase' : 'local'

/** Oturumdaki kullanıcıyı döndürür (yoksa null). */
export async function getUser() {
  if (usingSupabase) {
    const { data } = await supabase.auth.getSession()
    return data.session?.user ?? null
  }
  return localStorage.getItem(SESSION_KEY) === '1' ? { email: 'Yerel yönetici' } : null
}

/**
 * Giriş yap.
 *  - Supabase modu: { email, password }
 *  - Yerel mod: { password } (e-posta yok sayılır)
 * Dönüş: { ok: boolean, error?: string, user?: object }
 */
export async function login({ email = '', password = '' } = {}) {
  if (usingSupabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (error) return { ok: false, error: cevirHata(error.message) }
    return { ok: true, user: data.user }
  }
  const current = localStorage.getItem(PASS_KEY) || DEFAULT_PASS
  if (password === current) {
    localStorage.setItem(SESSION_KEY, '1')
    return { ok: true }
  }
  return { ok: false, error: 'Parola hatalı' }
}

/** Oturumu kapat. */
export async function logout() {
  if (usingSupabase) {
    try { await supabase.auth.signOut() } catch { /* yoksay */ }
  }
  localStorage.removeItem(SESSION_KEY)
}

/**
 * Parola değiştir.
 *  - Supabase modu: yeni parola yeterli (açık oturum gerekir).
 *  - Yerel mod: mevcut parola doğrulanır.
 * Dönüş: { ok: boolean, error?: string }
 */
export async function changePass(oldPass, newPass) {
  if (usingSupabase) {
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) return { ok: false, error: cevirHata(error.message) }
    return { ok: true }
  }
  const current = localStorage.getItem(PASS_KEY) || DEFAULT_PASS
  if (oldPass !== current) return { ok: false, error: 'Mevcut parola hatalı' }
  localStorage.setItem(PASS_KEY, newPass)
  return { ok: true }
}

/** Parola sıfırlama e-postası gönder (yalnız Supabase modu). */
export async function resetPassword(email) {
  if (!usingSupabase) return { ok: false, error: 'Bu özellik yalnızca bulut (Supabase) modunda kullanılabilir.' }
  const { error } = await supabase.auth.resetPasswordForEmail((email || '').trim(), {
    redirectTo: `${window.location.origin}/panel`,
  })
  if (error) return { ok: false, error: cevirHata(error.message) }
  return { ok: true }
}

/** Supabase oturum değişimlerini dinle; aboneliği iptal eden fonksiyon döner. */
export function onAuthChange(cb) {
  if (!usingSupabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session?.user ?? null))
  return () => data.subscription.unsubscribe()
}

/* Supabase hata mesajlarını Türkçeleştir. */
function cevirHata(msg = '') {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return 'E-posta veya parola hatalı'
  if (m.includes('email not confirmed')) return 'E-posta adresi doğrulanmamış'
  if (m.includes('rate limit') || m.includes('too many')) return 'Çok fazla deneme — lütfen biraz bekleyin'
  if (m.includes('password should be at least')) return 'Parola çok kısa (en az 6 karakter)'
  if (m.includes('network')) return 'Bağlantı hatası — internetinizi kontrol edin'
  return msg || 'İşlem başarısız'
}
