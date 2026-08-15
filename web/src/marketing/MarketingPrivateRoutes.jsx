import { Route } from 'react-router-dom'
import { MarketingSales, PrivateClosed } from './MarketingPages.jsx'

export const privateRoutes=()=> <>
  <Route path="/satin-al" element={<MarketingSales/>}/>
  <Route path="/panel/*" element={<PrivateClosed name="Yönetim paneli"/>}/>
  <Route path="/musteri/*" element={<PrivateClosed name="Müşteri portalı"/>}/>
  <Route path="/ortak/*" element={<PrivateClosed name="İş ortağı portalı"/>}/>
</>
