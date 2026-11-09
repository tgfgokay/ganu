import { buildContractPackage } from './contract-documents.js'
import { FONT_REGULAR, FONT_BOLD } from './contract-pdf-font.js'

export class ContractPackageIncompleteError extends Error {
  constructor(missing) { super('Belge paketi gönderime hazır değil. Eksik bilgileri tamamlayın.');this.name='ContractPackageIncompleteError';this.code='contract_package_incomplete';this.missing=missing }
}
export const documentSourceError=(code,message)=>Object.assign(new Error(message),{code,missing:[{code,label:message,scope:'belge'}]})
export const decodeBase64=(text)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0))
export function encodeBase64(bytes) {
  let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384))
  return btoa(text)
}
export async function sha256(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('') }

// PDF-LIB bağımlılıkları adapter'dan gelir; aynı sayfa yerleşimi browser/Node/Deno'da çalışır.
export async function createContractPdfWithLibraries(input,{allowIncomplete=false}={}, {PDFDocument,rgb,fontkit}) {
  const pkg=buildContractPackage(input)
  if(!pkg.ready&&!allowIncomplete)throw new ContractPackageIncompleteError(pkg.missing)
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit)
  const regular=await pdf.embedFont(decodeBase64(FONT_REGULAR),{subset:true})
  const bold=await pdf.embedFont(decodeBase64(FONT_BOLD),{subset:true})
  const form=pdf.getForm()
  const color=rgb(10/255,37/255,64/255)
  const accent=rgb(0,212/255,178/255)
  const muted=rgb(76/255,99/255,123/255)
  const line=rgb(237/255,230/255,218/255)
  const soft=rgb(244/255,239/255,231/255)
  pdf.setTitle(`${pkg.number} - Sanal Ofis Belge Paketi`);pdf.setSubject(`${pkg.version}; ${pkg.fingerprint}; ${pkg.ready?'Gönderime hazır':'Eksik bilgilerle inceleme'}`)
  pdf.setCreator('GANU belge üretimi');pdf.setProducer('GANU / pdf-lib')
  const pageSize=[595.28,841.89],margin=45,width=pageSize[0]-margin*2,top=786,bottom=58
  let page,y,docTitle='',pageInDocument=0
  const printable=(text)=>String(text??'').replace(/[\u2010-\u2015]/g,'-')
  const fit=(text,font,size,maxWidth)=>{
    const out=[]
    for(const raw of printable(text).replace(/\t/g,' ').split('\n')){
      let current=''
      for(const word of raw.split(/\s+/).filter(Boolean)){
        if(font.widthOfTextAtSize(word,size)>maxWidth){
          if(current){out.push(current);current=''}
          let segment=''
          for(const char of word){if(segment&&font.widthOfTextAtSize(segment+char,size)>maxWidth){out.push(segment);segment=''}segment+=char}
          current=segment
        }else if(!current||font.widthOfTextAtSize(`${current} ${word}`,size)<=maxWidth)current=current?`${current} ${word}`:word
        else{out.push(current);current=word}
      }
      out.push(current)
    }
    return out
  }
  const draw=(text,x,at,size=9.5,font=regular,ink=color)=>{
    text=printable(text)
    // Gömülü fontun desteklemediği karakteri sessizce kaybetme.
    const supported=new Set(font.getCharacterSet())
    const bad=[...text].find(ch=>!supported.has(ch.codePointAt(0)))
    if(bad)throw Object.assign(documentSourceError('contract_unsupported_character','Belgede PDF fontunun desteklemediği bir karakter var; alanı kontrol edin.'),{codePoint:bad.codePointAt(0)})
    page.drawText(text,{x,y:at,size,font,color:ink})
  }
  const newPage=()=>{
    page=pdf.addPage(pageSize);pageInDocument++;y=top
    page.drawLine({start:{x:margin,y:808},end:{x:pageSize[0]-margin,y:808},thickness:1.3,color})
    page.drawLine({start:{x:margin,y:808},end:{x:margin+32,y:808},thickness:1.3,color:accent})
    draw('GANU',margin,817,11,bold);draw(`${pkg.number} | ${pkg.version}`,pageSize[0]-margin-220,817,7.2,regular,muted)
    if(!pkg.ready)draw(pkg.reviewLabel,margin,794,7.5,bold,rgb(.65,.22,.11))
  }
  const ensure=(height)=>{if(y-height<bottom)newPage()}
  const paragraph=(text,{font=regular,size=9.5,gap=5,keepNext=false}={})=>{
    const lines=fit(text,font,size,width),lineHeight=size*1.44
    // Başlıkla en az iki gövde satırı aynı sayfada kalır; uzun paragraflar sayfaya bölünebilir.
    ensure(Math.min(lines.length,keepNext?lines.length:2)*lineHeight+(keepNext?32:0))
    for(let i=0;i<lines.length;i++){
      if(y-lineHeight<bottom || (i===lines.length-2&&y-2*lineHeight<bottom))newPage()
      draw(lines[i],margin,y,size,font);y-=lineHeight
    }
    y-=gap
  }
  const tableRow=(label,text)=>{
    const labelWidth=145,pad=7,size=9.2,lh=13.4
    const left=fit(label,bold,size,labelWidth-pad*2),right=fit(text,regular,size,width-labelWidth-pad*2)
    let offset=0
    while(offset<Math.max(left.length,right.length)){
      ensure(lh*2+pad*2)
      const capacity=Math.max(1,Math.floor((y-bottom-pad*2)/lh)),count=Math.min(capacity,Math.max(left.length,right.length)-offset),height=count*lh+pad*2
      page.drawRectangle({x:margin,y:y-height,width:labelWidth,height,color:soft})
      page.drawLine({start:{x:margin,y:y-height},end:{x:margin+width,y:y-height},thickness:.4,color:line})
      for(let i=0;i<count;i++){
        if(left[offset+i])draw(left[offset+i],margin+pad,y-pad-size-i*lh,size,bold)
        if(right[offset+i])draw(right[offset+i],margin+labelWidth+pad,y-pad-size-i*lh,size)
      }
      y-=height;offset+=count
      if(offset<Math.max(left.length,right.length))newPage()
    }
    y-=2
  }
  const signatures=(block,id)=>{
    const column=(width-24)/2,size=9.2,lh=13.2
    const names=[fit(block.company,bold,size,column),fit(block.customer,bold,size,column)]
    const nameHeight=Math.max(...names.map(x=>x.length))*lh
    const height=115+nameHeight
    ensure(height);y-=8
    for(let side=0;side<2;side++){
      const x=margin+side*(column+24)
      page.drawLine({start:{x,y},end:{x:x+column,y},thickness:.7,color})
      draw(side?'ÜYE':'HİZMET SAĞLAYICI',x,y-15,8,bold,muted)
      names[side].forEach((text,i)=>draw(text,x,y-31-i*lh,size,bold))
      const at=y-32-nameHeight
      draw('Yetkili ad soyad:',x,at,8,regular,muted)
      const signer=form.createTextField(`${id}.signer.${side}`)
      signer.setText(side&&block.representative!=='[Veri eksik]'?block.representative:'')
      signer.addToPage(page,{x,y:at-22,width:column,height:18,font:regular,textColor:color,borderColor:line,borderWidth:.5})
      signer.setFontSize(8)
      draw('İmza tarihi:',x,at-36,8,regular,muted)
      const date=form.createTextField(`${id}.date.${side}`)
      date.addToPage(page,{x:x+65,y:at-40,width:column-65,height:17,font:regular,textColor:color,borderColor:line,borderWidth:.5});date.setFontSize(8)
      draw('İmza / kaşe:',x,at-57,8,regular,muted)
      page.drawRectangle({x,y:at-92,width:column,height:29,borderColor:line,borderWidth:.5})
    }
    y-=height+8
  }
  const documentRanges=[],externalPages=new Set()
  for(const doc of pkg.documents){
    if(doc.externalPdf){
      const source=input.privacyNotice?.pdfBytes
      if(!(source instanceof Uint8Array))throw documentSourceError('privacy_pdf_source_unavailable','Müşteri KVKK PDF kaynağı okunamadı.')
      if(await sha256(source)!==doc.sourceSha256.toLowerCase())throw documentSourceError('privacy_pdf_hash_mismatch','Müşteri KVKK PDF kaynak karması eşleşmiyor.')
      let original
      try{original=await PDFDocument.load(source)}catch{throw documentSourceError('privacy_pdf_invalid_document','Müşteri KVKK kaynağı okunabilir, şifresiz bir PDF olmalı.')}
      if(original.getForm().getFields().length)throw documentSourceError('privacy_pdf_must_be_static','Müşteri KVKK kaynağı imzasız ve statik bir aydınlatma PDF’i olmalı.')
      if(!original.getPageCount()||original.getPageCount()>30)throw documentSourceError('privacy_pdf_invalid_pages','Müşteri KVKK PDF sayfa sayısı geçersiz.')
      const startPage=pdf.getPageCount()+1
      const copies=await pdf.copyPages(original,original.getPageIndices())
      for(const copied of copies){externalPages.add(pdf.getPageCount());pdf.addPage(copied)}
      documentRanges.push({id:doc.id,startPage,endPage:pdf.getPageCount()});continue
    }
    docTitle=doc.title;pageInDocument=0
    const startPage=pdf.getPageCount()+1;newPage()
    paragraph(docTitle,{font:bold,size:14,gap:9,keepNext:true})
    paragraph(`Belge: ${pkg.number} | Metin: ${pkg.version}${doc.sourceVersion?' | Ek sürümü: '+doc.sourceVersion:''}`,{size:7.4,gap:10})
    const lastHeading=doc.blocks.findLastIndex(b=>b.type==='heading')
    const estimate=(block)=>block.type==='signatures'?123+Math.max(fit(block.company,bold,9.2,(width-24)/2).length,fit(block.customer,bold,9.2,(width-24)/2).length)*13.2:block.type==='heading'?fit(block.text,bold,10.5,width).length*15.12+10:block.type==='row'?Math.max(fit(block.label,bold,9.2,131).length,fit(block.text,regular,9.2,width-159).length)*13.4+16:fit(block.text,regular,9.5,width).length*13.68+(block.text.length<140?2:4)
    for(const [index,block] of doc.blocks.entries()){
      // Son hükümle imza alanını birlikte tut; imzalar tek başına boş sayfaya düşmesin.
      if(index===lastHeading){const finalHeight=doc.blocks.slice(index).reduce((sum,b)=>sum+estimate(b),0);if(finalHeight<top-bottom)ensure(finalHeight)}
      if(block.type==='heading'){y-=5;paragraph(block.text,{font:bold,size:10.5,gap:5,keepNext:true})}
      else if(block.type==='row')tableRow(block.label,block.text)
      else if(block.type==='signatures')signatures(block,doc.id)
      else paragraph(block.text,{gap:block.text.length<140?2:4,keepNext:block.text.length<100&&block.text.endsWith(':')})
    }
    documentRanges.push({id:doc.id,startPage,endPage:pdf.getPageCount()})
  }
  // Ortak font görünümünü hem alan ağacına hem Widget görünümüne yazar; form interaktif kalır.
  form.updateFieldAppearances(regular)
  const pages=pdf.getPages()
  pages.forEach((p,i)=>{
    if(externalPages.has(i))return // Yetkili KVKK kaynağının sayfa düzenine hiçbir ek çizilmez.
    page=p
    page.drawLine({start:{x:margin,y:43},end:{x:pageSize[0]-margin,y:43},thickness:.4,color:line})
    draw(`${pkg.number} | ${pkg.version} | ${pkg.fingerprint.slice(0,23)}`,margin,30,7,regular,muted)
    draw(`${i+1} / ${pages.length}`,pageSize[0]-margin-42,30,7,regular,muted)
    draw('Paraf: __________',pageSize[0]-margin-88,48,7,regular,muted)
  })
  const bytes=await pdf.save(),contentSha256=await sha256(bytes)
  return {bytes,attachment:{filename:`${pkg.number}-${pkg.historical?'yeni-metin-inceleme':pkg.ready?'belge-paketi':'inceleme'}.pdf`,contentType:'application/pdf',content:encodeBase64(bytes)},metadata:{number:pkg.number,version:pkg.version,templateFingerprint:pkg.fingerprint,contentSha256,documentIds:pkg.documents.map(x=>x.id),pages:pages.length,documentRanges,ready:pkg.ready,historical:pkg.historical,copies:pkg.copies},package:pkg}
}
