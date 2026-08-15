import { publicRoute } from './routes.js'
import { blogRoute } from '../blog/content.js'
import { legalRoute } from '../legal/routes.js'
import { marketingRoute } from '../marketing/routes.js'
import { marketingOnly } from '../marketing/config.js'

export const resolvePublicRoute=(pathname)=>publicRoute(pathname)||blogRoute(pathname)||legalRoute(pathname)||(marketingOnly?marketingRoute(pathname):null)
