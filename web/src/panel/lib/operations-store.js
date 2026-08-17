import { supabase, usingSupabase } from './supabase.js'

function requireCloud(){if(!usingSupabase)throw new Error('Personel paneli Supabase bağlantısı olmadan çalışmaz.')}
function collection(table){return {
  async list(){requireCloud();const {data,error}=await supabase.from(table).select('*').order('created_at',{ascending:false});if(error)throw error;return data||[]},
  async get(id){requireCloud();const {data,error}=await supabase.from(table).select('*').eq('id',id).single();if(error)return null;return data},
  async create(row){requireCloud();const {data,error}=await supabase.from(table).insert(row).select().single();if(error)throw error;return data},
  async update(id,patch){requireCloud();const {data,error}=await supabase.from(table).update(patch).eq('id',id).select().single();if(error)throw error;return data},
  async remove(id){requireCloud();const {error}=await supabase.from(table).delete().eq('id',id);if(error)throw error;return true},
}}

export const customers=collection('customers'),contracts=collection('contracts'),mail=collection('mail_items'),documents=collection('documents'),requests=collection('requests'),inspections=collection('inspections'),bookings=collection('bookings'),notifications=collection('notifications'),invoices=collection('invoices'),expenses=collection('expenses'),partners=collection('partners'),commissionPayments=collection('commission_payments')
export async function withCustomerNames(rows){const list=await customers.list(),byId=Object.fromEntries(list.map((x)=>[x.id,x]));return rows.map((row)=>({...row,customer:byId[row.customer_id]||null}))}
export function daysLeft(endDate){const end=new Date(`${endDate}T00:00:00`),today=new Date();today.setHours(0,0,0,0);return Math.round((end-today)/86400000)}

export const MAIL_TYPES=['mektup','kargo','tebligat']
export const MAIL_STATUS=['geldi','bildirildi','teslim','yönlendirildi','imha']
export const PACKAGES=['Başlangıç','Pro','Kurumsal']
export const CUSTOMER_STATUS=['aday','aktif','askıda','ayrıldı']
export const DOC_TYPES=[{v:'imza_sirkuleri',l:'İmza Sirküleri'},{v:'vergi_levhasi',l:'Vergi Levhası'},{v:'kimlik',l:'Kimlik'},{v:'sozlesme',l:'Sözleşme'},{v:'isyeri_kullanim',l:'İşyeri/Adres Kullanım Belgesi'},{v:'diger',l:'Diğer'}]
export const REQUEST_STATUS=['yeni','işlemde','tamamlandı','reddedildi']
export const BOOKING_STATUS=['talep','onaylandı','reddedildi','iptal']
export const INSPECTION_RESULT=['bekleniyor','olumlu','olumsuz']
export const CARRIERS=[
  {v:'aras',l:'Aras Kargo',url:(t)=>`https://kargotakip.araskargo.com.tr/?code=${encodeURIComponent(t)}`},
  {v:'yurtici',l:'Yurtiçi Kargo',url:(t)=>`https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(t)}`},
  {v:'mng',l:'MNG Kargo',url:(t)=>`https://www.mngkargo.com.tr/gonderitakip?takipNo=${encodeURIComponent(t)}`},
  {v:'ptt',l:'PTT Kargo',url:(t)=>`https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(t)}`},
]
export function trackingUrl(carrier,code){const item=CARRIERS.find((x)=>x.v===carrier);return item&&code?item.url(code):''}
export function timeSlots(open='09:00',close='18:00',step=30){const min=(t)=>Number(t.slice(0,2))*60+Number(t.slice(3,5)),pad=(n)=>String(n).padStart(2,'0'),out=[];for(let m=min(open);m<=min(close);m+=step)out.push(`${pad(Math.floor(m/60))}:${pad(m%60)}`);return out}
export function bookingConflict(list,{date,start,end,exceptId}={}){return list.find((b)=>b.id!==exceptId&&b.date===date&&['talep','onaylandı'].includes(b.status)&&start<b.end&&b.start<end)||null}
export async function notifyEvent(eventKey,customer,vars={}){return notifications.create({customer_id:customer.id,channel:'panel',event:eventKey,message:JSON.stringify(vars),status:'kayıt',sent_at:new Date().toISOString()})}
export const INVOICE_STATUS=['bekliyor','ödendi','gecikti']
export const EXPENSE_CATEGORIES=['kira','personel','kargo','ofis','vergi','diğer']
export const PARTNER_STATUS=['başvuru','aktif','pasif']
export const PARTNER_PROFESSIONS=['Avukat','Mali Müşavir','Danışman','Diğer']
export function invStatus(row){if(row?.status==='ödendi')return 'ödendi';if(row?.due_date&&row.due_date<new Date().toISOString().slice(0,10))return 'gecikti';return row?.status||'bekliyor'}
export async function revenueByMonth(months=6){const rows=await invoices.list(),out=[];for(let i=months-1;i>=0;i--){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-i);const key=d.toISOString().slice(0,7);out.push({key,label:d.toLocaleDateString('tr-TR',{month:'short'}),total:rows.filter((r)=>r.status==='ödendi'&&String(r.paid_date||r.issue_date||'').startsWith(key)).reduce((n,r)=>n+(Number(r.amount)||0),0)})}return out}
export async function partnerSummary(){const list=await partners.list(),payments=await commissionPayments.list();return list.map((partner)=>({...partner,paid_commission:payments.filter((p)=>p.partner_id===partner.id).reduce((n,p)=>n+(Number(p.amount)||0),0)}))}
export async function recordCommissionPayment(row){return commissionPayments.create(row)}
export const PROVIDER_STATUS=Object.freeze({paytr:'Kurulum bekliyor',efatura:'Kurulum bekliyor',email:'Kurulum bekliyor',sms:'Kurulum bekliyor',whatsapp:'Kurulum bekliyor'})
export async function issueEInvoice(){return {ok:false,reason:'e-Belge entegrasyonu kurulmadı; işlem yapılmadı.'}}
export function getConfig(){return {real_send:false,efatura_enabled:false,pos_enabled:false,providers:PROVIDER_STATUS}}
export function setConfig(){throw new Error('Dış servis ayarları bu panelden açılamaz.')}
export const EFATURA_PROVIDERS=[]

const BUCKET='secure-docs'
export async function fileToStoredUrl(file,{prefix='customers',customerId=''}={}){
  requireCloud()
  if(!file||!customerId||!/^[0-9a-f-]{36}$/i.test(customerId))throw new Error('Geçerli müşteri ve dosya gerekli.')
  if(!['mail','customers'].includes(prefix)||file.size>8*1024*1024||!(/^image\//.test(file.type)||file.type==='application/pdf'))throw new Error('Yalnız görsel/PDF ve en fazla 8 MB.')
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8)||'bin'
  const path=`${prefix}/${customerId}/${crypto.randomUUID()}.${ext}`
  const {error}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false});if(error)throw error
  return `secure:${path}`
}
export async function resolveStoredUrl(stored){
  if(!stored||!String(stored).startsWith('secure:'))return ''
  requireCloud();const path=String(stored).slice(7)
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrl(path,300)
  return error?'':data?.signedUrl||''
}
