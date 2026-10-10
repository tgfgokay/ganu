// Teklif belgesi (A4, yazdırılabilir) ve teklif e-postası. Saf fonksiyonlar: panel önizlemesi ve testler ortak kullanır.
// Belge panel içinde iframe'de gösterilir; tarayıcının yazdırma penceresinden "PDF olarak kaydet" ile PDF alınır.
import { legalIdentity } from '../../legal/config.js'
import { tr } from '../../site/locales/tr.js'
import { GANU_INVOICE_ADDRESS as GANU,PAYMENT_ACCOUNT } from './company.js'
import { DV_RATE_PER_MILLE,VAT_RATE,contractTotal,netOfVat,quoteNo,stampTaxAmount,stampTaxBase } from './stamp-tax.js'

const tl=(n)=>new Intl.NumberFormat('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0)
const day=(iso)=>iso?new Date(`${String(iso).slice(0,10)}T00:00:00`).toLocaleDateString('tr-TR'):''
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const per=(b)=>b==='aylık'?'ay':'yıl'
const rate=String(DV_RATE_PER_MILLE).replace('.',',')

export const COMPANY=Object.freeze({
  name:legalIdentity.tradeName||'GANU OFİS HİZMETLERİ LİMİTED ŞİRKETİ',
  address:legalIdentity.address||`${GANU.address}, ${GANU.district} / ${GANU.city}`,
  taxOffice:legalIdentity.taxOffice||GANU.taxOffice,
  taxNumber:legalIdentity.taxNumber||'',
  mersis:legalIdentity.mersisNumber||'',
  phone:legalIdentity.phone||'0537 974 62 90',
  email:legalIdentity.email||'info@ganu.com.tr',
  web:'ganu.com.tr',
})

// Paket kapsamı sitedeki paket listesinden gelir; üst paket alt paketin maddelerini açık yazar.
export function packageScope(pkg){
  const it=tr.home?.pricing?.items||{},base=it['Başlangıç']||[],pro=(it.Pro||[]).slice(1),corp=(it.Kurumsal||[]).slice(1)
  const list=pkg==='Pro'?[...base,...pro]:pkg==='Kurumsal'?[...base,...pro,...corp]:(it[pkg]||base)
  // Üst paketteki toplantı odası hakkı alt paketinkinin yerine geçer (tek satır kalır).
  const room=list.filter((s)=>/toplantı odası/i.test(s)).pop()
  return list.filter((s)=>!/toplantı odası/i.test(s)||s===room)
}

// Site logosu (GanuMark ile aynı çizim): lacivert yazı, turkuaz adres noktası.
const LOGO=`<svg viewBox="25 92 1196 452" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="ganu"><g fill="none" stroke="#0A2540" stroke-width="54" stroke-linecap="round" stroke-linejoin="round"><path d="M60 250A123 123 0 1 0 306 250A123 123 0 1 0 60 250Z"/><path d="M306 127L306 434A116 116 0 0 1 98 452"/><path d="M352 250A123 123 0 1 0 598 250A123 123 0 1 0 352 250Z"/><path d="M598 127L598 373"/><path d="M698 373L698 224A97 97 0 0 1 892 224L892 373"/><path d="M992 127L992 276A97 97 0 0 0 1186 276L1186 127"/></g><circle cx="475" cy="250" r="44" fill="#00D4B2"/></svg>`

export function quoteHtml(q){
  const months=Number(q.term_months)||12,priceNet=netOfVat(q.price),vat=Math.round((Number(q.price)-priceNet)*100)/100
  const disc=Number(q.discount_pct)>0&&Number(q.list_price)>0,discAmount=disc?Math.round((Number(q.list_price)-Number(q.price))*100)/100:0
  const total=contractTotal(q.price,q.billing_period,months),dv=stampTaxAmount(stampTaxBase(q.price,q.billing_period,months))
  const issued=day(q.created_at||new Date().toISOString()),valid=day(q.valid_until)
  const who=[q.contact&&`Yetkili: ${esc(q.contact)}`,q.phone&&`Tel: ${esc(q.phone)}`,q.email&&esc(q.email),(q.tax_no||q.tc)&&`${q.tax_no?'VKN':'TCKN'}: ${esc(q.tax_no||q.tc)}${q.tax_office?` · ${esc(q.tax_office)} VD`:''}`].filter(Boolean)
  const scope=packageScope(q.package).map((s)=>`<li>${esc(s)}</li>`).join('')
  const sum=(k,v,cls='')=>`<tr class="${cls}"><td>${k}</td><td>${v}</td></tr>`
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(quoteNo(q))} · ${esc(q.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--navy:#0A2540;--teal:#00D4B2;--teal-ink:#007a66;--paper:#F4EFE7;--line:#e3e7ee;--muted:#5b6b80}
*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#eef1f5;font:13px/1.55 'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:var(--navy)}
.page{width:210mm;min-height:297mm;display:flex;flex-direction:column;margin:16px auto;background:#fff;padding:11mm 15mm 8mm;position:relative;box-shadow:0 4px 24px rgba(10,37,64,.12)}
.page:before{content:"";position:absolute;left:0;top:0;right:0;height:6px;background:linear-gradient(90deg,var(--navy) 0 78%,var(--teal) 78% 100%)}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:24px}
.logo svg{width:100px;height:auto;display:block}.logo small{display:block;margin-top:6px;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.doc{text-align:right}.eyebrow{font-size:10.5px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--teal-ink)}
.doc h1{font-family:Fraunces,Georgia,serif;font-weight:600;font-size:26px;line-height:1.05;margin:3px 0 7px}
.meta{display:grid;grid-template-columns:auto auto;gap:1px 14px;justify-content:end;font-size:11.5px;margin:0}.meta dt{color:var(--muted)}.meta dd{margin:0;font-weight:600;text-align:right}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0 10px}
.card{border:1px solid var(--line);border-radius:10px;padding:10px 13px}.card.to{background:var(--paper);border-color:#e7dfd2}
.card h3{margin:0 0 6px;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:700}
.card b{display:block;font-size:14px;margin-bottom:3px}.card p{margin:0;font-size:11.5px;line-height:1.5;color:#33465c}
.intro{margin:0 0 10px;font-size:12.5px}
table.items{width:100%;border-collapse:collapse;font-size:12.5px}
.items th{background:var(--navy);color:#fff;text-align:left;font-weight:600;padding:7px 10px;font-size:11px}.items th:first-child{border-radius:8px 0 0 0}.items th:last-child{border-radius:0 8px 0 0}
.items td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}.items .num,.items th.num{text-align:right;white-space:nowrap}
.items .svc b{font-size:13.5px}.items .svc small{display:block;color:var(--muted);margin-top:2px}
.split{display:grid;grid-template-columns:1.1fr 1fr;gap:18px;margin-top:10px}
.scope h4,.terms h4,.pay h4{margin:0 0 8px;font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.scope ul{list-style:none;margin:0;padding:0}.scope li{position:relative;padding:1px 0 1px 20px;font-size:12px}
.scope li:before{content:"";position:absolute;left:2px;top:7px;width:9px;height:5px;border-left:2px solid var(--teal-ink);border-bottom:2px solid var(--teal-ink);transform:rotate(-45deg)}
table.sum{width:100%;border-collapse:collapse;font-size:12px}.sum td{padding:3.5px 0}.sum td:last-child{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.sum .disc td{color:var(--teal-ink)}.sum .sep td{border-top:1px solid var(--line);padding-top:8px}
.sum .grand td{background:var(--navy);color:#fff;font-weight:700;font-size:13.5px;padding:8px 12px}.sum .grand td:first-child{border-radius:8px 0 0 8px}.sum .grand td:last-child{border-radius:0 8px 8px 0}
.sum .soft td{color:var(--muted);font-size:11.5px}
.terms{margin-top:10px}.terms ol{margin:0;padding-left:18px;font-size:11.5px;color:#33465c}.terms li{margin:1px 0}
.pay{margin-top:10px;border:1px dashed #c9d3df;border-radius:10px;padding:9px 14px;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:2px 12px;font-size:11.5px}
.pay h4{grid-column:1/-1}.pay span{color:var(--muted)}.pay code{font:600 12.5px/1.4 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.03em}
.sign{margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:16px}.sign div{border-top:1px solid var(--navy);padding-top:6px;font-size:11px;color:var(--muted)}
.sign b{display:block;color:var(--navy);font-size:12px;margin-bottom:2px}
.ft{margin-top:auto;padding-top:7px;border-top:1px solid var(--line);font-size:10px;color:var(--muted);display:flex;justify-content:space-between;gap:12px}
.ft span:last-child{white-space:nowrap}@page{size:A4;margin:0}@media print{body{background:#fff}.page{margin:0;box-shadow:none}}
</style></head><body><div class="page">
<div class="hd"><div class="logo">${LOGO}<small>Sanal ofis · İstanbul</small></div>
<div class="doc"><div class="eyebrow">Fiyat teklifi</div><h1>${esc(quoteNo(q))}</h1>
<dl class="meta"><dt>Teklif tarihi</dt><dd>${esc(issued)}</dd>${valid?`<dt>Geçerlilik</dt><dd>${esc(valid)}</dd>`:''}<dt>Sözleşme süresi</dt><dd>${months} ay</dd></dl></div></div>
<div class="parties"><div class="card to"><h3>Sayın</h3><b>${esc(q.title)}</b><p>${who.join('<br>')||'&nbsp;'}</p></div>
<div class="card"><h3>Teklif veren</h3><b>${esc(COMPANY.name)}</b><p>${esc(COMPANY.address)}<br>${esc(COMPANY.taxOffice)} VD${COMPANY.taxNumber?` · VKN ${esc(COMPANY.taxNumber)}`:''}${COMPANY.mersis?`<br>Mersis ${esc(COMPANY.mersis)}`:''}<br>${esc(COMPANY.phone)} · ${esc(COMPANY.email)}</p></div></div>
<p class="intro">Talebiniz doğrultusunda hazırladığımız sanal ofis hizmet teklifimizi bilgilerinize sunarız.</p>
<table class="items"><thead><tr><th>Hizmet</th><th>Faturalama</th><th class="num">Birim fiyat (KDV hariç)</th><th class="num">KDV %${VAT_RATE}</th><th class="num">Tutar (KDV dahil)</th></tr></thead>
<tbody><tr><td class="svc"><b>Sanal Ofis — ${esc(q.package)} paketi</b><small>${months} ay sözleşme · yasal iş adresi ve posta yönetimi</small></td><td>${q.billing_period==='aylık'?'Aylık':'Yıllık peşin'}</td><td class="num">${tl(priceNet)} TL</td><td class="num">${tl(vat)} TL</td><td class="num"><b>${tl(q.price)} TL</b> / ${per(q.billing_period)}</td></tr></tbody></table>
<div class="split"><div class="scope"><h4>Paket kapsamı</h4><ul>${scope}</ul></div>
<table class="sum">${disc?sum('Liste fiyatı (KDV dahil)',`${tl(q.list_price)} TL`)+sum(`${q.bni?'BNI Nişantaşı indirimi':'İndirim'} (%${Number(q.discount_pct)})`,`−${tl(discAmount)} TL`,'disc'):''}
${sum('Ara toplam (KDV hariç)',`${tl(priceNet)} TL`,disc?'sep':'')}${sum(`KDV (%${VAT_RATE})`,`${tl(vat)} TL`)}
${sum(`Toplam / ${per(q.billing_period)}`,`${tl(q.price)} TL`,'grand')}
${sum(`Sözleşme toplamı (${months} ay, KDV dahil)`,`${tl(total)} TL`,'soft')}${sum(`Damga vergisi (binde ${rate}, müşteri öder)`,`${tl(dv)} TL`,'soft')}</table></div>
<div class="terms"><h4>Koşullar</h4><ol>
${valid?`<li>Bu teklif ${esc(valid)} tarihine kadar geçerlidir.</li>`:''}
<li>Hizmet süresi ${months} aydır; bedel ${q.billing_period==='aylık'?'her ay':'yıllık peşin'} faturalandırılır. Fiyatlara %${VAT_RATE} KDV dahildir.</li>
<li>Sözleşmeden doğan damga vergisi (binde ${rate}) müşteri tarafından ödenir.</li>
<li>Fatura Paraşüt üzerinden e-Arşiv/e-Fatura olarak düzenlenir ve e-posta adresinize gönderilir.</li>
<li>Hizmet kapsamı, kullanım koşulları ve yenileme hükümleri hizmet sözleşmesinde yer alır.</li>
${q.notes?`<li>${esc(q.notes).replace(/\n/g,'<br>')}</li>`:''}</ol></div>
<div class="pay"><h4>Ödeme bilgileri</h4><span>Banka</span><div>${esc(PAYMENT_ACCOUNT.bank)}</div><span>Alıcı</span><div>${esc(PAYMENT_ACCOUNT.holder)}</div><span>IBAN</span><code>${esc(PAYMENT_ACCOUNT.iban)}</code><span>Açıklama</span><div>${esc(q.title)} · ${esc(quoteNo(q))}</div><span>Kartla</span><div>ödeme bağlantısı gönderilir</div></div>
<div class="sign"><div><b>Teklifi kabul ediyoruz</b>Ad soyad / unvan · tarih · imza / kaşe</div><div><b>${esc(COMPANY.name)}</b>Yetkili imza</div></div>
<div class="ft"><span>${esc(COMPANY.name)} · ${esc(COMPANY.address)}</span><span>${esc(COMPANY.web)} · ${esc(COMPANY.email)} · ${esc(COMPANY.phone)}</span></div>
</div></body></html>`
}

// Resmî teklif e-postası (metin). Belge PDF olarak kaydedilip eklenir.
export function quoteEmail(q){
  const months=Number(q.term_months)||12,dv=stampTaxAmount(stampTaxBase(q.price,q.billing_period,months))
  const disc=Number(q.discount_pct)>0&&Number(q.list_price)>0?` (liste fiyatı ${tl(q.list_price)} TL, %${Number(q.discount_pct)} indirimli)`:''
  const subject=`GANU sanal ofis teklifi · ${quoteNo(q)} · ${q.title}`
  const body=[
    `Sayın ${q.contact||q.title},`,'',
    'Talebiniz doğrultusunda hazırladığımız sanal ofis hizmet teklifimizi bilgilerinize sunarız.','',
    `Teklif no: ${quoteNo(q)}`,
    `Paket: ${q.package} · ${q.billing_period==='aylık'?'aylık':'yıllık peşin'} faturalama · ${months} ay sözleşme`,
    `Ücret: ${tl(q.price)} TL / ${per(q.billing_period)} (KDV dahil)${disc}`,
    `Damga vergisi: yaklaşık ${tl(dv)} TL (binde ${rate}, sözleşme imzasında müşteri tarafından ödenir)`,
    ...(q.valid_until?[`Geçerlilik: ${day(q.valid_until)}`]:[]),'',
    'Teklif belgemiz ektedir. Onaylamanız halinde hizmet sözleşmesini hazırlayıp tarafınıza ileteceğiz.','',
    'Saygılarımızla,','GANU Ofis Hizmetleri',`${COMPANY.phone} · ${COMPANY.email} · ${COMPANY.web}`,
  ].join('\n')
  return {to:q.email||'',subject,body}
}

// info@ganu.com.tr Gmail'inde hazır yeni ileti açar (gönderimi personel yapar).
export function gmailComposeUrl(q,from=COMPANY.email){
  const {to,subject,body}=quoteEmail(q)
  const qs=Object.entries({authuser:from,view:'cm',fs:'1',to,su:subject,body}).map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&')
  return `https://mail.google.com/mail/?${qs}`
}
