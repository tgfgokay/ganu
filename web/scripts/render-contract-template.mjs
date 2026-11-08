// Avukatın 32 maddelik kaynağı ile panel/sunucu/Markdown eşleşme kapısı.
import { readFileSync,writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { ARTICLE_COUNT,CLAUSES,CONTRACT_VERSION,TEMPLATE_FINGERPRINT } from '../src/panel/lib/contract-clauses.js'
import { LAWYER_TEMPLATES } from '../supabase/functions/_shared/contract-template-source.js'
const hash='sha256:'+createHash('sha256').update(JSON.stringify(LAWYER_TEMPLATES,null,2)).digest('hex')
if(hash!==TEMPLATE_FINGERPRINT)throw new Error('Avukat şablon kaynağı fingerprint ile eşleşmiyor; kaynak/sürüm değişikliğini doğrulayın.')
if(ARTICLE_COUNT!==32)throw new Error(`Avukat kaynağı 32 madde olmalı; ${ARTICLE_COUNT} bulundu.`)
for(const [n,title] of [[7,'RESMİ KAYITLAR VE ADRES DEĞİŞİKLİĞİ'],[9,'ADLİ VE İDARİ TEBLİGATLAR'],[12,'HİZMET BEDELİ, FATURALANDIRMA VE ÖDEME ŞARTLARI'],[18,'CEZAİ ŞART'],[21,'KİŞİSEL VERİLERİN KORUNMASI'],[32,'YÜRÜRLÜK']])if(CLAUSES[n-2]?.title!==title)throw new Error(`Avukat kaynağı madde ${n} atıf başlığı değişmiş.`)
const main=LAWYER_TEMPLATES['virtual-office']
for(const text of ['en geç 7 (yedi) gün','Hizmet bedeli peşin','iki nüsha','EK-1 Adli ve İdari','EK-2 KVKK','EK-3 Hizmet Bilgi','EK-4 Kimlik','EK-5 Genel'])if(!main.blocks.some(b=>b.text.includes(text)))throw new Error(`Avukat kaynağı zorunlu eşleşmesi eksik: ${text}`)
const md=[`# ${main.title}`,'',`> Metin sürümü: **${CONTRACT_VERSION}**.`,
  `> Kaynak fingerprint: ${TEMPLATE_FINGERPRINT}.`,
  '> Kullanıcının esas alınmasını istediği avukat şablonundan üretilir. Son avukat onayı / sürüm tarihi için ayrıca kanıt bulunmuyor.',
  '> Kaynak: web/supabase/functions/_shared/contract-template-source.js. Elle düzenlemeyin.',
  '> Yer tutucular kayıttan doldurulur. Eksik alanlar ile müşteri kapsamı doğrulanmamış KVKK eki otomatik gönderimi engeller.','',
  '## 1. TARAFLAR','',
  '**HİZMET SAĞLAYICI:** [Unvan] · [MERSİS] · [Vergi dairesi / no] · [Adres] · [Telefon] · [E-posta] · [KEP]','',
  '**ÜYE:** [Ad soyad / unvan] · [TCKN / VKN] · [MERSİS] · [Vergi dairesi] · [Adres] · [Telefon] · [E-posta] · [KEP]','',
  'Hizmet Sağlayıcı ve Üye buradan itibaren ayrı ayrı “Taraf”, birlikte “Taraflar” olarak anılacaktır.','',
  ...main.blocks.flatMap(b=>[b.type==='heading'?`## ${b.text}`:b.text,'']),
  '| HİZMET SAĞLAYICI | ÜYE |','|---|---|','| Yetkili ad soyad: | Yetkili ad soyad: |','| İmza tarihi: | İmza tarihi: |','| İmza / kaşe: | İmza / kaşe: |','',
  '## Belge paketi kaynak kontrolü','',
  '- EK-1 tebligat yetkilendirmesi: avukat kaynağı mevcut.',
  '- EK-2 müşteri KVKK aydınlatması: arşivde ayrı metin yok; kaynağı, müşteri kapsamı ve sürümü doğrulanmadan gönderim engellenir.',
  '- EK-3 hizmet bilgi formu / ücret tarifesi: arşivde ayrı şablon yok; kayıt verisinden operasyonel form oluşturulur.',
  '- EK-4 kimlik / müşteri bilgi formu: arşivde ayrı şablon yok; kayıt verisinden operasyonel form oluşturulur; kimlik doğrulaması yerine geçmez.',
  '- EK-5 kullanım kuralları ve adres taahhütnamesi: avukat kaynağı mevcut.',
  '- Hazır ofis, toplantı ve demirbaş şablonları sanal ofis paketine kendiliğinden eklenmez. Hazır ofis hizmeti bu akışta etkin değildir.','',
  `Madde sayısı: ${ARTICLE_COUNT}.`,'',
].join('\n')
const target=new URL('../../sozlesmeler/01-sanal-ofis-hizmet-sozlesmesi.md',import.meta.url)
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==md)throw new Error('Sözleşme şablonu kaynakla aynı değil: node scripts/render-contract-template.mjs')
  console.log(`contract template PASS (${CONTRACT_VERSION}; ${ARTICLE_COUNT} madde; fingerprint eşleşti)`)
}else{writeFileSync(target,md);console.log(`Avukat kaynak şablonu yazıldı (${CONTRACT_VERSION}; ${ARTICLE_COUNT} madde).`)}
