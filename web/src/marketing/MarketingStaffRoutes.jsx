import { lazy,Suspense } from 'react'
import { Route } from 'react-router-dom'
import { MarketingSales,PrivateClosed } from './MarketingPages.jsx'
const OperationsPanelApp=lazy(()=>import('../panel/OperationsPanelApp.jsx'))
const loading=<main aria-busy="true" aria-label="Personel paneli yükleniyor" style={{minHeight:'55vh',padding:'8rem 1.5rem'}}><h1>Personel Girişi</h1><p>Yetkili oturum denetleniyor. Giriş yapılmadan şirket verisi gösterilmez.</p></main>
export const privateRoutes=()=> <>
  <Route path="/satin-al" element={<MarketingSales/>}/>
  <Route path="/panel/*" element={<Suspense fallback={loading}><OperationsPanelApp/></Suspense>}/>
  <Route path="/musteri/*" element={<PrivateClosed name="Müşteri portalı"/>}/>
  <Route path="/ortak/*" element={<PrivateClosed name="İş ortağı portalı"/>}/>
</>
