import { useEffect } from 'react'
import { daysLeft } from '../lib/store.js'

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="pl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pl-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="pl-modal-h">
          <h2>{title}</h2>
          <button className="pl-x" aria-label="Kapat" onClick={onClose}>×</button>
        </div>
        {children}
        {footer && <div className="pl-form-foot">{footer}</div>}
      </div>
    </div>
  )
}

const STATUS_CLS = { geldi: 'b-geld', bildirildi: 'b-bild', teslim: 'b-tesl', 'yönlendirildi': 'b-yon', imha: 'b-imha' }
const TYPE_CLS = { mektup: 'b-mektup', kargo: 'b-kargo', tebligat: 'b-tebligat' }

export const StatusBadge = ({ s }) => <span className={`pl-badge ${STATUS_CLS[s] || 'b-imha'}`}>{s}</span>
export const TypeBadge = ({ t }) => <span className={`pl-badge ${TYPE_CLS[t] || 'b-mektup'}`}>{t}</span>

export function DaysBadge({ endDate }) {
  const d = daysLeft(endDate)
  const cls = d < 0 ? 'd-red' : d <= 7 ? 'd-red' : d <= 30 ? 'd-amber' : 'd-green'
  const txt = d < 0 ? `${Math.abs(d)} gün geçti` : d === 0 ? 'Bugün' : `${d} gün`
  return <span className={`pl-days ${cls}`}>{txt}</span>
}

export const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso.length > 10 ? iso : iso + 'T00:00:00')
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
}
export const fmtTL = (n) => (n || n === 0) ? '₺' + Number(n).toLocaleString('tr-TR') : '—'
