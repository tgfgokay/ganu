import { useEffect, useState } from 'react'
import { resolveStoredUrl } from '../lib/store.js'

function useSecureUrl(stored, portal = false) {
  const [url, setUrl] = useState(stored?.startsWith?.('secure:') ? '' : (stored || ''))
  useEffect(() => {
    let active = true
    setUrl(stored?.startsWith?.('secure:') ? '' : (stored || ''))
    if (stored?.startsWith?.('secure:')) {
      resolveStoredUrl(stored, { portal }).then((next) => { if (active) setUrl(next || '') })
    }
    return () => { active = false }
  }, [stored, portal])
  return url
}

export function SecureImage({ stored, portal = false, alt = '', ...props }) {
  const url = useSecureUrl(stored, portal)
  return url ? <img src={url} alt={alt} {...props} /> : null
}

export function SecureLink({ stored, portal = false, children, ...props }) {
  const url = useSecureUrl(stored, portal)
  return url ? <a href={url} {...props}>{children}</a> : <span className="t2">Dosya bağlantısı hazırlanamadı</span>
}
