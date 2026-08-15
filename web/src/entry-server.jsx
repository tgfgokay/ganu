import React from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import SiteRoutes from './SiteRoutes.jsx'
import { PUBLIC_ROUTES } from './site/routes.js'
import { blogRoutes } from './blog/content.js'
import { LEGAL_ROUTES } from './legal/routes.js'

export function render(pathname){
  return renderToString(<React.StrictMode><StaticRouter location={pathname}><SiteRoutes/></StaticRouter></React.StrictMode>)
}
export function prerenderRoutes(){return [...PUBLIC_ROUTES,...blogRoutes(),...LEGAL_ROUTES]}
