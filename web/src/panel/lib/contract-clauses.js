// Panel, sunucu PDF'i ve Markdown kaynak eşleşmesi aynı avukat kataloğunu kullanır.
import { LAWYER_TEMPLATES } from '../../../supabase/functions/_shared/contract-template-source.js'
export { CONTRACT_VERSION,TEMPLATE_FINGERPRINT } from '../../../supabase/functions/_shared/contract-template-source.js'
export const CLAUSES=[]
for(const block of LAWYER_TEMPLATES['virtual-office'].blocks){
  if(block.type==='heading')CLAUSES.push({number:CLAUSES.length+2,title:block.text.replace(/^\d+\s*[.–-]?\s*/,''),paras:[]})
  else CLAUSES.at(-1).paras.push(block.text)
}
export const ARTICLE_COUNT=CLAUSES.length+1
