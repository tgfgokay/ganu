// Damga vergisi ve teklif hesapları (saf fonksiyonlar; panel ve testler ortak kullanır).
// Oran binde 9,48 (belli parayı içeren sözleşme); matrah sözleşme süresince ödenecek KDV hariç toplam bedeldir.
// KDV sözleşmede ayrıca gösterilmiyorsa matrah alanına KDV dahil tutar elle yazılır.
export const DV_RATE_PER_MILLE=9.48
export const VAT_RATE=20
export const DV_PAYERS=['müşteri','GANU','yarı yarıya']
const r2=(n)=>Math.round((Number(n)||0)*100)/100

// Teklif/sözleşme süresinde kaç fatura dönemi var: yıllıkta 12 ay = 1 dönem, aylıkta her ay 1 dönem.
export const periodsInTerm=(billing,months)=>billing==='aylık'?Number(months)||0:(Number(months)||0)/12
export const contractTotal=(price,billing,months)=>r2((Number(price)||0)*periodsInTerm(billing,months))
export const netOfVat=(gross,vat=VAT_RATE)=>r2((Number(gross)||0)/(1+vat/100))
export const stampTaxBase=(price,billing,months)=>netOfVat(contractTotal(price,billing,months))
export const stampTaxAmount=(base,rate=DV_RATE_PER_MILLE,copies=1)=>r2((Number(base)||0)*(Number(rate)||0)*(Number(copies)||1)/1000)
// Müşterinin payı: 'yarı yarıya'da yarısı, 'GANU'da sıfır.
export const customerShare=(amount,payer)=>payer==='GANU'?0:payer==='yarı yarıya'?r2(amount/2):r2(amount)
export const discounted=(list,pct)=>r2((Number(list)||0)*(1-(Number(pct)||0)/100))

// Beyan: belge tarihinin ayı (YYYY-MM); vergi izleyen ayın 26'sına kadar beyan edilip ödenir.
export const monthKey=(iso)=>String(iso||'').slice(0,7)
export const declarationDeadline=(month)=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m,26);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-26`}
export const quoteNo=(q)=>q?.number?`T-${String(q.number).padStart(4,'0')}`:'T-—'
// Sözleşme dönemi kaç ay: başlangıç → bitiş (bitiş günü dahil). 09.10.2026–08.10.2027 → 12
export const termMonths=(start,end)=>{if(!start||!end)return 12;const a=new Date(`${start}T00:00:00`),b=new Date(`${end}T00:00:00`);b.setDate(b.getDate()+1);return Math.max(1,Math.round((b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())+(b.getDate()-a.getDate())/30))}
