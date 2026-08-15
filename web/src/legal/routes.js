import { legalIdentity } from './config.js'

export const LEGAL_ROUTES=[
  {id:'distance-tr',locale:'tr',path:'/mesafeli-satis',counterpart:null,title:'Mesafeli Satış Ön Bilgilendirmesi ve Sözleşme',description:'GANU sanal ofis hizmetleri için tüketici ön bilgilendirmesi ve mesafeli hizmet sözleşmesi.'},
  {id:'returns-tr',locale:'tr',path:'/iptal-iade',counterpart:null,title:'İptal, Cayma ve İade',description:'GANU sanal ofis hizmetleri için tüketici cayma, iptal ve iade süreci.'},
  {id:'privacy-tr',locale:'tr',path:'/kvkk',counterpart:'/en/privacy',title:'KVKK Aydınlatma Metni',description:'GANU web sitesi, başvuru ve hizmet süreçleri için KVKK aydınlatma metni.'},
  {id:'cookies-tr',locale:'tr',path:'/cerezler',counterpart:'/en/cookies',title:'Çerez ve Tarayıcı Depolama Bildirimi',description:'GANU sitesinde fiilen kullanılan çerez ve tarayıcı depolama teknolojileri.'},
  {id:'privacy-en',locale:'en',path:'/en/privacy',counterpart:'/kvkk',title:'Privacy Notice',description:'Privacy notice for GANU website visitors, enquiries and service onboarding.'},
  {id:'cookies-en',locale:'en',path:'/en/cookies',counterpart:'/cerezler',title:'Cookies and Browser Storage Notice',description:'Cookies and browser-storage technologies actually used by the GANU website.'},
].map((route)=>{const draft=legalIdentity.complete?'':route.locale==='tr'?' Taslağı':' Draft';return Object.freeze({...route,kind:'legal',indexable:legalIdentity.complete,seo:{title:`GANU · ${route.title}${draft}`,description:route.description}})})

const normalized=(value)=>value!=='/'?String(value||'/').replace(/\/+$/,''):'/'
export const legalRoute=(pathname)=>LEGAL_ROUTES.find((route)=>route.path===normalized(pathname))||null
