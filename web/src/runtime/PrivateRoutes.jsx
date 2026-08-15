import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'

const SatinAl=lazy(()=>import('../SatinAl.jsx'))
const PanelApp=lazy(()=>import('../panel/PanelApp.jsx'))
const MusteriPortal=lazy(()=>import('../panel/MusteriPortal.jsx'))
const OrtakPortal=lazy(()=>import('../panel/OrtakPortal.jsx'))
const loading=<main aria-busy="true" aria-label="Uygulama yükleniyor" style={{minHeight:'55vh'}}/>

export const privateRoutes=()=> <>
  <Route path="/satin-al" element={<Suspense fallback={loading}><SatinAl/></Suspense>}/>
  <Route path="/panel/*" element={<Suspense fallback={loading}><PanelApp/></Suspense>}/>
  <Route path="/musteri/*" element={<Suspense fallback={loading}><MusteriPortal/></Suspense>}/>
  <Route path="/ortak/*" element={<Suspense fallback={loading}><OrtakPortal/></Suspense>}/>
</>
