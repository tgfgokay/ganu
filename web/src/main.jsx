import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import SiteRoutes from './SiteRoutes.jsx'
import './index.css'

const root=document.getElementById('root')
const tree=(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <SiteRoutes/>
    </BrowserRouter>
  </React.StrictMode>
)
// GitHub Pages derin bağlantısı (404.html → /?/yol) kökteki ana sayfa HTML'iyle açılır; başka bir sayfanın
// HTML'ini hidrasyonla sahiplenmek React #418/#423 uyuşmazlığı verir, bu durumda kök temizlenip yeniden çizilir.
const redirected=window.__ganuSpaRedirect===true
if(root.hasChildNodes()&&!redirected){
  ReactDOM.hydrateRoot(root,tree)
  requestAnimationFrame(()=>root.removeAttribute('data-prerendered'))
}
else{
  if(redirected){root.textContent='';root.removeAttribute('data-prerendered')}
  ReactDOM.createRoot(root).render(tree)
}
