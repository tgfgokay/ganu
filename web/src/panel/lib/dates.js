// Takvim günleri tarayıcının yerel saatine göre (İstanbul) hesaplanır. toISOString() UTC'ye
// çevirdiği için yerel gece yarısı bir önceki güne kayar; tarih alanlarında kullanılmaz.
const pad=(n)=>String(n).padStart(2,'0')
export const localISO=(d=new Date())=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const parse=(iso)=>new Date(`${iso}T00:00:00`)
export const addDaysISO=(iso,n)=>{const d=parse(iso);d.setDate(d.getDate()+n);return localISO(d)}
// Bir yıllık dönemin son günü: 29.09.2026 → 28.09.2027
export const oneYearLaterISO=(iso)=>{const d=parse(iso);d.setFullYear(d.getFullYear()+1);d.setDate(d.getDate()-1);return localISO(d)}
// iso tarihine bugünden kaç gün var (geçmişse negatif) — İstanbul yerel takvim günü.
export const daysUntil=(iso)=>Math.round((parse(iso)-parse(localISO()))/86400000)
// n ay sonrası; ay sonu taşmaz (31.01 + 1 ay → 28/29.02).
export const addMonthsISO=(iso,n)=>{const d=parse(iso),day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+n);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()));return localISO(d)}
// n aylık sözleşmenin son günü: 09.10.2026, 12 ay → 08.10.2027
export const termEndISO=(iso,months)=>addDaysISO(addMonthsISO(iso,months),-1)
