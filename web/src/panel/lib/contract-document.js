// Hizmet sözleşmesi belgesi (A4, yazdırılabilir): madde metinleri contract-clauses.js'den, taraflar ve EK-1
// müşteri + sözleşme (+ varsa kabul edilen teklif) kaydından doldurulur. Panel içinde iframe'de gösterilir;
// "Yazdır / PDF" ile PDF alınır, imzalı taraması müşteri sayfasına "Sözleşme" türüyle yüklenip doğrulanır.
import { legalIdentity } from '../../legal/config.js'
import { GANU_INVOICE_ADDRESS as GANU,PAYMENT_ACCOUNT } from './company.js'
import { CLAUSES,CONTRACT_VERSION } from './contract-clauses.js'
import { COMPANY,packageScope } from './quote-document.js'
import { DV_FILING_DAYS,DV_RATE_PER_MILLE,VAT_RATE,contractTotal,netOfVat,quoteNo,stampTaxAmount,stampTaxBase,termMonths } from './stamp-tax.js'

const tl=(n)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
const day=(iso)=>iso?new Date(`${String(iso).slice(0,10)}T00:00:00`).toLocaleDateString('tr-TR'):''
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const rate=String(DV_RATE_PER_MILLE).replace('.',',')
const per=(b)=>b==='aylık'?'ay':'yıl'
export const SERVICE_ADDRESS=COMPANY.address||`${GANU.address}, ${GANU.district} / ${GANU.city}`

// Sözleşme numarası: teklif varsa onun numarası (S-0005), yoksa başlangıç yılı + kayıt kimliğinin başı.
export const contractNo=(contract,quote)=>quote?.number?`S-${quoteNo(quote).slice(2)}`:`S-${String(contract?.start_date||'').slice(0,4)}-${String(contract?.id||'').slice(0,6).toUpperCase()}`

// Belgede gösterilen bedel ve vergi rakamları (testler de kullanır).
export function contractFigures(contract){
  const months=termMonths(contract.start_date,contract.end_date),price=Number(contract.price)||0,net=netOfVat(price)
  const base=stampTaxBase(price,contract.billing_period,months)
  return {months,price,net,vat:Math.round((price-net)*100)/100,total:contractTotal(price,contract.billing_period,months),base,dv:stampTaxAmount(base)}
}

const customerLines=(c)=>[
  c.tax_no?`VKN ${esc(c.tax_no)}${c.tax_office?` · ${esc(c.tax_office)} VD`:''}`:c.tc?`TCKN ${esc(c.tc)}`:'Vergi / TC kimlik no: ……………………',
  esc([c.address,c.district&&c.city?`${c.district} / ${c.city}`:c.city||c.district].filter(Boolean).join(', '))||'Adres: ……………………',
  c.contact?`Yetkili: ${esc(c.contact)}`:'Yetkili: ……………………',
  [c.phone&&esc(c.phone),c.email&&esc(c.email)].filter(Boolean).join(' · ')||'Telefon / e-posta: ……………………',
]
const companyLines=()=>[
  `VKN ${esc(COMPANY.taxNumber||'……………')} · ${esc(COMPANY.taxOffice)} VD`,
  [COMPANY.mersis&&`Mersis ${esc(COMPANY.mersis)}`,legalIdentity.registryNumber&&`Ticaret sicil ${esc(legalIdentity.registryNumber)}`].filter(Boolean).join(' · '),
  esc(COMPANY.address),
  `${esc(COMPANY.phone)} · ${esc(COMPANY.email)}`,
].filter(Boolean)

export function contractHtml({contract,customer,quote=null}){
  const f=contractFigures(contract),no=contractNo(contract,quote)
  const disc=quote&&Number(quote.discount_pct)>0&&Number(quote.list_price)>0
  const scope=packageScope(contract.package).map(esc).join(' · ')
  const art=(n,title,paras)=>`<section class="art"><h3>Madde ${n} — ${esc(title)}</h3>${paras.map((p,i)=>`<p><b>${n}.${i+1}.</b> ${esc(p).replace('{adres}',`<b>${esc(SERVICE_ADDRESS)}</b>`)}</p>`).join('')}</section>`
  const row=(k,v)=>`<tr><th>${k}</th><td>${v}</td></tr>`
  const sign=(who,name)=>`<div><span>${who}</span><b>${esc(name)}</b><i>Yetkili ad soyad: ……………………………</i><i>Tarih: …… / …… / ………</i><i>İmza / kaşe:</i></div>`
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(no)} · ${esc(customer.title)} · Hizmet sözleşmesi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>
:root{--navy:#0A2540;--teal-ink:#007a66;--paper:#F4EFE7;--line:#e3e7ee;--muted:#5b6b80}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#eef1f5;font:11px/1.5 'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:var(--navy)}
.sheet{width:210mm;margin:16px auto;background:#fff;padding:14mm 16mm;box-shadow:0 4px 24px rgba(10,37,64,.12)}
.hd{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;border-bottom:2px solid var(--navy);padding-bottom:8px}
.hd h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:20px;margin:0;line-height:1.1}.hd small{display:block;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--teal-ink);font-weight:700;margin-bottom:3px}
.hd dl{margin:0;display:grid;grid-template-columns:auto auto;gap:0 10px;font-size:10px;text-align:right}.hd dt{color:var(--muted)}.hd dd{margin:0;font-weight:600}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 6px}
.card{border:1px solid var(--line);border-radius:8px;padding:8px 11px}.card.c{background:var(--paper);border-color:#e7dfd2}
.card h4{margin:0 0 4px;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.card b{display:block;font-size:12px;margin-bottom:2px}.card p{margin:0;color:#33465c;font-size:10.5px}
.art{break-inside:avoid-page}.art h3{font-size:11.5px;margin:9px 0 3px}.art p{margin:0 0 3px;text-align:justify;color:#1d3047}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px;break-inside:avoid}.sign div{border-top:1px solid var(--navy);padding-top:6px}
.sign span{display:block;font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.sign b{display:block;font-size:11.5px;margin:2px 0 6px}.sign i{display:block;font-style:normal;color:var(--muted);margin-top:6px}
.ek{break-before:page;margin-top:18px}.ek .sign{margin-top:12px}.ek h2{font-family:Fraunces,Georgia,serif;font-size:17px;margin:0 0 2px}.ek .sub{color:var(--muted);margin:0 0 8px}
table.k{width:100%;border-collapse:collapse;margin:6px 0 4px}.k th,.k td{border:1px solid var(--line);padding:4px 8px;text-align:left;vertical-align:top}.k th{width:38%;background:#f7f9fb;font-weight:600}
.k td.n{font-variant-numeric:tabular-nums}.k caption{text-align:left;font-weight:700;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:6px 0 3px}
ul.s{margin:2px 0;padding-left:16px}ul.s li{margin:0}
.ft{margin-top:12px;padding-top:6px;border-top:1px solid var(--line);font-size:9px;color:var(--muted);display:flex;justify-content:space-between}
@page{size:A4;margin:12mm 0}@media print{body{background:#fff}.sheet{margin:0 auto;box-shadow:none;padding:0 16mm}}
</style></head><body><div class="sheet">
<div class="hd"><div><small>Belge no ${esc(no)}</small><h1>Sanal Ofis Hizmet Sözleşmesi</h1></div>
<dl><dt>Paket</dt><dd>${esc(contract.package)}</dd><dt>Süre</dt><dd>${f.months} ay · ${esc(day(contract.start_date))} – ${esc(day(contract.end_date))}</dd><dt>Metin sürümü</dt><dd>${esc(CONTRACT_VERSION)}</dd></dl></div>
<section class="art"><h3>Madde 1 — Taraflar</h3>
<div class="parties"><div class="card"><h4>Hizmet Veren</h4><b>${esc(COMPANY.name)}</b><p>${companyLines().join('<br>')}</p></div>
<div class="card c"><h4>Müşteri</h4><b>${esc(customer.title)}</b><p>${customerLines(customer).join('<br>')}</p></div></div>
<p>İşbu Sözleşme yukarıda bilgileri yazılı Hizmet Veren ile Müşteri arasında düzenlenmiştir; taraflar birlikte "Taraflar" olarak anılır.</p></section>
${CLAUSES.map((c,i)=>art(i+2,c.title,c.paras)).join('')}
<div class="sign">${sign('Hizmet Veren',COMPANY.name)}${sign('Müşteri',customer.title)}</div>

<div class="ek"><h2>EK-1 · Hizmet paketi, bedel ve ödeme bilgileri</h2><p class="sub">${esc(no)} numaralı sözleşmenin ekidir · ${esc(customer.title)}</p>
<table class="k"><caption>Hizmet</caption>
${row('Paket ve kapsamı',`<b>${esc(contract.package)}</b> · ${scope}`)}
${row('Hizmet adresi',esc(SERVICE_ADDRESS))}</table>
<table class="k"><caption>Bedel</caption>
${row('Ödeme periyodu',contract.billing_period==='aylık'?'Aylık':'Yıllık peşin')}
${disc?row('Liste bedeli ve indirim',`${tl(quote.list_price)} TL / ${per(contract.billing_period)} (KDV dahil) · ${quote.bni?'BNI Nişantaşı indirimi':'müşteriye özel indirim'} %${Number(quote.discount_pct)}, dönem bedeline uygulanmıştır`):''}
${row('Dönem bedeli',`${tl(f.net)} TL + KDV %${VAT_RATE} ${tl(f.vat)} TL = <b>${tl(f.price)} TL / ${per(contract.billing_period)}</b> (KDV dahil)`)}
${row(`Sözleşme toplamı (${f.months} ay, KDV dahil)`,`${tl(f.total)} TL`)}
${row('Yenileme esas bedeli (KDV hariç)',`${tl(f.net)} TL / ${per(contract.billing_period)} · Madde 5 uyarınca güncellenir`)}
${row('Depozito','Alınmaz')}</table>
<table class="k"><caption>Süre ve ödeme</caption>
${row('Başlangıç / bitiş',`${esc(day(contract.start_date))} – ${esc(day(contract.end_date))} (${f.months} ay)`)}
${row('Kendiliğinden yenileme',contract.auto_renew?'Var · Madde 7.2 (12 ay; yenilememe bildirimi bitişten en az 30 gün önce)':'Yok · süre sonunda yenileme yazılı mutabakatla')}
${row('Ödeme vadesi','Fatura tarihinden itibaren 7 gün')}
${row('Banka hesabı',`${esc(PAYMENT_ACCOUNT.bank)} · ${esc(PAYMENT_ACCOUNT.holder)}<br><b>${esc(PAYMENT_ACCOUNT.iban)}</b> · açıklama: ${esc(customer.title)}`)}
${row('Kartla ödeme','Hizmet Veren\'in ilettiği ödeme bağlantısıyla')}</table>
<table class="k"><caption>Damga vergisi (Madde 6)</caption>
${row('Tahmini damga vergisi',`Matrah ${tl(f.base)} TL (KDV hariç sözleşme toplamı) × binde ${rate}, tek nüsha = <b>${tl(f.dv)} TL</b> · Müşteri tarafından karşılanır`)}
${row('Beyan ve ödeme',`Hizmet Veren, imza tarihinden itibaren ${DV_FILING_DAYS} gün içinde beyan edip öder; tutar belgesiyle Müşteri'ye yansıtılır.`)}</table>
<table class="k"><caption>İletişim ve bildirim kanalları</caption>
${row('Müşteri',[customer.contact&&esc(customer.contact),customer.email&&esc(customer.email),customer.phone&&`${esc(customer.phone)} (telefon / WhatsApp)`].filter(Boolean).join(' · ')||'……………………')}
${row('Hizmet Veren',`${esc(COMPANY.email)} · ${esc(COMPANY.phone)} (telefon / WhatsApp)`)}</table>
<div class="sign">${sign('Hizmet Veren',COMPANY.name)}${sign('Müşteri',customer.title)}</div>
<div class="ft"><span>${esc(COMPANY.name)} · ${esc(no)} · metin ${esc(CONTRACT_VERSION)}</span><span>${esc(COMPANY.web)} · ${esc(COMPANY.email)}</span></div>
</div></div></body></html>`
}

// Sözleşmeyi gönderme e-postası (metin); PDF personel tarafından eklenir.
export function contractEmail({contract,customer,quote=null}){
  const f=contractFigures(contract),no=contractNo(contract,quote)
  const subject=`GANU sanal ofis hizmet sözleşmesi · ${no} · ${customer.title}`
  const body=[
    `Sayın ${customer.contact||customer.title},`,'',
    `${quote?`Kabul ettiğiniz ${quoteNo(quote)} numaralı teklifimize göre hazırlanan`:'Görüştüğümüz koşullarla hazırlanan'} sanal ofis hizmet sözleşmeniz ektedir.`,'',
    `Paket: ${contract.package} · ${contract.billing_period==='aylık'?'aylık':'yıllık peşin'} · ${f.months} ay (${day(contract.start_date)} – ${day(contract.end_date)})`,
    `Bedel: ${tl(f.price)} TL / ${per(contract.billing_period)} (KDV dahil)`,
    `Damga vergisi: yaklaşık ${tl(f.dv)} TL (binde ${rate}, tek nüsha; sizin tarafınızdan karşılanır)`,'',
    'Sözleşme tek nüsha düzenlenir: lütfen her sayfayı paraflayıp imza bölümlerini imzalayın ve kaşeleyin. Taranmış kopyasını bu e-postaya yanıt olarak gönderip aslını ofisimize iletmenizi rica ederiz.',
    'Şirketler için imza sirküleri, vergi levhası ve gerçek faydalanıcı beyanını da eklemenizi rica ederiz.','',
    'Saygılarımızla,','GANU Ofis Hizmetleri',`${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}`,
  ].join('\n')
  return {to:customer.email||'',subject,body}
}

export function contractGmailUrl(doc,from=COMPANY.email){
  const {to,subject,body}=contractEmail(doc)
  const qs=Object.entries({authuser:from,view:'cm',fs:'1',to,su:subject,body}).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&')
  return `https://mail.google.com/mail/?${qs}`
}
