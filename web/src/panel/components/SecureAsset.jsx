import { useEffect, useState } from 'react'
import { resolveStoredUrl } from '../lib/store.js'

function useSecureUrl(stored, accessCode = '') {
  const [url, setUrl] = useState(stored?.startsWith?.('secure:') ? '' : (stored || ''))
  useEffect(() => {
    let active = true
    setUrl(stored?.startsWith?.('secure:') ? '' : (stored || ''))
    if (stored?.startsWith?.('secure:')) {
      resolveStoredUrl(stored, { accessCode }).then((next) => { if (active) setUrl(next || '') })
    }
    return () => { active = false }
  }, [stored, accessCode])
  return url
}

export function SecureImage({ stored, accessCode = '', alt = '', ...props }) {
  const url = useSecureUrl(stored, accessCode)
  return url ? <img src={url} alt={alt} {...props} /> : null
}

export function SecureLink({ stored, accessCode = '', children, ...props }) {
  const url = useSecureUrl(stored, accessCode)
  return url ? <a href={url} {...props}>{children}</a> : <span className="t2">Dosya bağlantısı hazırlanamadı</span>
}
