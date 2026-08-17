import { supabase, usingSupabase } from './supabase.js'
import { withBase } from '../../base.js'

export const authMode=usingSupabase?'supabase':'disabled'

async function staffUser(){
  if(!usingSupabase)return null
  const {data:sessionData}=await supabase.auth.getSession()
  const user=sessionData.session?.user||null
  if(!user)return null
  const {data,error}=await supabase.rpc('is_staff')
  return !error&&data===true?user:null
}

export const getUser=()=>staffUser()

export async function login({email='',password=''}={}){
  if(!usingSupabase)return {ok:false,error:'Personel girişi yapılandırılmadı.'}
  const {data,error}=await supabase.auth.signInWithPassword({email:email.trim(),password})
  if(error)return {ok:false,error:'E-posta veya parola hatalı.'}
  const user=await staffUser()
  if(!user){await supabase.auth.signOut();return {ok:false,error:'Bu hesap personel paneline yetkili değil.'}}
  return {ok:true,user:data.user}
}

export async function sendMagicLink(email){
  if(!usingSupabase)return {ok:false,error:'Personel girişi yapılandırılmadı.'}
  const redirectTo=`${window.location.origin}${withBase('/panel')}`
  const {error}=await supabase.auth.signInWithOtp({email:String(email||'').trim(),options:{emailRedirectTo:redirectTo,shouldCreateUser:false}})
  return error?{ok:false,error:'Giriş bağlantısı gönderilemedi.'}:{ok:true}
}

export async function logout(){if(usingSupabase)await supabase.auth.signOut()}

export function onAuthChange(cb){
  if(!usingSupabase)return ()=>{}
  const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
    if(!session?.user){cb(null);return}
    setTimeout(()=>staffUser().then(cb).catch(()=>cb(null)),0)
  })
  return ()=>data.subscription.unsubscribe()
}
