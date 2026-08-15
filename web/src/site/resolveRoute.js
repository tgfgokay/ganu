import { publicRoute } from './routes.js'
import { blogRoute } from '../blog/content.js'
import { legalRoute } from '../legal/routes.js'

export const resolvePublicRoute=(pathname)=>publicRoute(pathname)||blogRoute(pathname)||legalRoute(pathname)
