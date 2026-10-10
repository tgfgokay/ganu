// sozlesmeler/01-sanal-ofis-hizmet-sozlesmesi.md'yi panelin kullandığı madde kaynağından (contract-clauses.js) üretir.
//   node scripts/render-contract-template.mjs          → dosyayı yazar
//   node scripts/render-contract-template.mjs --check  → dosya kaynakla aynı değilse hata verir (test:staff-panel-build)
import { readFileSync,writeFileSync } from 'node:fs'
import { ARTICLE_COUNT,CLAUSES,CONTRACT_VERSION } from '../src/panel/lib/contract-clauses.js'

// Maddelerdeki atıflar (5. madde = yenileme bedeli, 7. = süre/yenileme, 10. = yasaklı kullanım) numarayla yazılır;
// madde eklenip sıra kayarsa üretim durur.
const at=(n)=>CLAUSES[n-2]?.title||''
const refs=[[5,'Yenileme döneminin bedeli'],[6,'Damga vergisi'],[7,'Süre ve yenileme'],[10,'Kimlik tespiti ve yasaklı kullanım']]
for(const [n,title] of refs)if(at(n)!==title){console.error(`madde ${n} "${title}" olmalı, "${at(n)}" bulundu: atıfları güncelleyin`);process.exit(1)}
const target=new URL('../../sozlesmeler/01-sanal-ofis-hizmet-sozlesmesi.md',import.meta.url)
const article=(n,{title,paras})=>[`## MADDE ${n} — ${title.toLocaleUpperCase('tr-TR')}`,'',...paras.flatMap((p,i)=>[`**${n}.${i+1}.** ${p.replace('{adres}','[Hizmet Veren adresi]')}`,'']),'---','']
const md=[
  '# SANAL OFİS HİZMET SÖZLEŞMESİ','',
  `> **Metin sürümü ${CONTRACT_VERSION}.** Bu dosya, panelin teklif kabulünde ürettiği sözleşmeyle aynı kaynaktan`,
  '> (`web/src/panel/lib/contract-clauses.js`) `node scripts/render-contract-template.mjs` ile üretilir; elle düzenlemeyin.',
  '> Köşeli parantezli alanları panel müşteri, sözleşme ve teklif kaydından doldurur.',
  '>',
  '> **NOT:** Bu sürüm, [06 numaralı iki dilli şablonun](06-hizmet-sozlesmesi-bilingual.md) süreç denetimi (10.10.2026)',
  '> önerileriyle yenilenmiş Türkçe metnidir. Yürürlüğe koymadan önce avukat ve mali müşavir onayı alın.',
  '','---','',
  '## MADDE 1 — TARAFLAR','',
  '**HİZMET VEREN:** [Ticaret unvanı] · [Adres] · [Vergi dairesi] / [VKN] · Mersis [No] · [Telefon] · [E-posta]','',
  '**MÜŞTERİ:** [Unvan / ad soyad] · [VKN ve vergi dairesi ya da TCKN] · [Adres] · Yetkili: [Ad soyad] · [Telefon] · [E-posta]','',
  'İşbu Sözleşme yukarıda bilgileri yazılı Hizmet Veren ile Müşteri arasında düzenlenmiştir; taraflar birlikte "Taraflar" olarak anılır.','',
  '---','',
  ...CLAUSES.flatMap((c,i)=>article(i+2,c)),
  '| HİZMET VEREN | MÜŞTERİ |','|---|---|','| [Ticaret unvanı] | [Unvan / ad soyad] |','| Yetkili ad soyad: | Yetkili ad soyad: |','| Tarih: | Tarih: |','| İmza / kaşe: | İmza / kaşe: |','',
  '---','',
  '## EK-1 — HİZMET PAKETİ, BEDEL VE ÖDEME BİLGİLERİ','',
  '| Alan | Değer |','|---|---|',
  '| Paket ve kapsamı | [Başlangıç / Pro / Kurumsal] · sitedeki paket listesi |',
  '| Hizmet adresi | [Hizmet Veren adresi] |',
  '| Ödeme periyodu | [Aylık / Yıllık peşin] |',
  '| Liste bedeli ve indirim | [Varsa: liste bedeli, indirim oranı] |',
  '| Dönem bedeli | [KDV hariç] + KDV %20 = [KDV dahil] |',
  '| Sözleşme toplamı | [Süre boyunca KDV dahil toplam] |',
  '| Yenileme esas bedeli (KDV hariç) | [Dönem bedeli, KDV hariç] · Madde 5 uyarınca güncellenir |',
  '| Depozito | Alınmaz |',
  '| Başlangıç / bitiş | [Tarih] – [Tarih] ([Ay] ay) |',
  '| Kendiliğinden yenileme | [Var: Madde 7.2 / Yok] |',
  '| Ödeme vadesi | Fatura tarihinden itibaren 7 gün |',
  '| Banka hesabı | [Banka] · [Hesap sahibi] · [IBAN] |',
  '| Damga vergisi | Matrah: KDV hariç sözleşme toplamı · binde 9,48 · tek nüsha · Müşteri karşılar; imzadan itibaren 15 gün içinde beyan |',
  '| İletişim ve bildirim kanalları | Müşteri: [e-posta, telefon / WhatsApp] · Hizmet Veren: [e-posta, telefon / WhatsApp] |','',
  `Madde sayısı: ${ARTICLE_COUNT}.`,'',
].join('\n')

if(process.argv.includes('--check')){
  let current=''
  try{current=readFileSync(target,'utf8')}catch{}
  if(current!==md){console.error('sözleşme şablonu kaynakla aynı değil: node scripts/render-contract-template.mjs');process.exit(1)}
  console.log(`contract template PASS (sürüm ${CONTRACT_VERSION}, ${ARTICLE_COUNT} madde)`)
}else{
  writeFileSync(target,md)
  console.log(`yazıldı: sozlesmeler/01-sanal-ofis-hizmet-sozlesmesi.md (sürüm ${CONTRACT_VERSION})`)
}
