import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { loadCatalog } from './panel/lib/store.js'
import SiteRoutes from './SiteRoutes.jsx'
import './index.css'

// P0.2/#7: Supabase bağlıysa fiyat kataloğunu tek gerçek kaynaktan yükle.
// Bileşenler onCatalog ile yüklenince güncellenir. (Yerel modda no-op.)
loadCatalog()

const root=document.getElementById('root')
const tree=(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <SiteRoutes/>
    </BrowserRouter>
  </React.StrictMode>
)
if(root.hasChildNodes()){
  ReactDOM.hydrateRoot(root,tree)
  requestAnimationFrame(()=>root.removeAttribute('data-prerendered'))
}
else ReactDOM.createRoot(root).render(tree)
