import fs from 'node:fs'
import path from 'node:path'
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist')
const files=[];const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).forEach((e)=>e.isDirectory()?walk(path.join(dir,e.name)):files.push(path.join(dir,e.name)));walk(dist)
const text=files.filter((f)=>/\.(?:html|js)$/.test(f)).map((f)=>fs.readFileSync(f,'utf8')).join('\n')
const source=['src/panel/OperationsPanelApp.jsx','src/panel/lib/operations-auth.js','src/panel/lib/operations-store.js','src/marketing/MarketingStaffRoutes.jsx'].map((f)=>fs.readFileSync(path.join(root,f),'utf8')).join('\n')
const must=['data-staff-auth="supabase-rbac"','Personel Girişi','Kurulum bekliyor','Kargo, Posta & Tebligat','Faturalar & Gelir','İş Ortakları & Komisyon']
for(const marker of must)if(!text.includes(marker)&&!source.includes(marker))throw new Error(`staff marker eksik: ${marker}`)
for(const bad of ['ganu2026','DEFAULT_PASS','localStorage.setItem','demo başarı','signUp('])if(source.includes(bad))throw new Error(`staff source yasaklı marker: ${bad}`)
if(!text.includes('info@ganu.com.tr'))throw new Error('doğrulanmış personel e-postası eksik')
const index=fs.readFileSync(path.join(dist,'index.html'),'utf8')
if(/OperationsPanelApp|supabase-vendor|operations-store/.test(index))throw new Error('personel/Supabase chunk public initial HTML içine preload edildi')
console.log('staff panel static gate: PASS')
