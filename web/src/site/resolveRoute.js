import { publicRoute } from './routes.js'
import { blogRoute } from '../blog/content.js'

export const resolvePublicRoute=(pathname)=>publicRoute(pathname)||blogRoute(pathname)
