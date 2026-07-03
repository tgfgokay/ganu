/* ============================================================
   GANU Panel · Supabase istemcisi
   .env dosyasında VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY
   tanımlıysa istemci oluşur; yoksa null döner (yerel moda düşer).
   ============================================================ */
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (url && key) ? createClient(url, key) : null
export const usingSupabase = !!supabase
