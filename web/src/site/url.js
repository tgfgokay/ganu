import { withBase } from '../base.js'

const configured = new URL(__GANU_SITE_URL__)
if (!/^https?:$/.test(configured.protocol) || configured.username || configured.password || configured.search || configured.hash) {
  throw new Error('GANU_SITE_URL mutlak, credentials/query/hash içermeyen http(s) URL olmalı')
}
export const SITE_ORIGIN = configured.origin
export function absolutePublicUrl(path) { return new URL(withBase(path), `${SITE_ORIGIN}/`).href }
