import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboard } from '../lib/store.js'
import { StatusBadge, TypeBadge, DaysBadge, fmtDate, fmtTL } from './_ui.jsx'

export default function Dashboard() {
  const [d, setD] = useState(null)
  useEffect(() => { dashboard().then(setD) }, [])
  if (!d) return <div className="pl-empty">Yükleniyor…</div>

  const critical = d.renewals.filter((r) => r._days <= 7)

  return (
    <div>
      <div className="pl-head">
        <div>
          <h1>Kontrol Paneli</h1>
          <p>{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <Link to="/panel/kargo" className="pl-btn pl-btn-teal">+ Kargo girişi</Link>
      </div>

      {d.tebligat?.length > 0 && (
        <div className="pl-alert crit">
          <span className="ic" aria-hidden="true">🚨</span>
          <span className="msg">
            <b>{d.tebligat.length} resmi tebligat</b> teslim edilmeyi bekliyor — yasal süreler işliyor olabilir.{' '}
            <Link to="/panel/kargo" style={{ color: '#b91c1c', fontWeight: 700 }}>Kargoya git →</Link>
          </span>
        </div>
      )}

      {critical.length > 0 && (
        <div className="pl-alert crit">
          <span className="ic" aria-hidden="true">⚠️</span>
          <span className="msg">
            <b>{critical.length} sözleşme</b> 7 gün içinde bitiyor. Yenileme kaçarsa müşterinin adresi geçersiz olur (vergi dairesi riski).{' '}
            <Link to="/panel/sozlesmeler" style={{ color: '#b91c1c', fontWeight: 700 }}>Sözleşmeleri gör →</Link>
          </span>
        </div>
      )}

      {d.openRequests?.length > 0 && (
        <div className="pl-alert">
          <span className="ic" aria-hidden="true">📥</span>
          <span className="msg">
            <b>{d.openRequests.length} müşteri talebi</b> bekliyor ({d.openRequests.map((r) => r.customer?.title).filter(Boolean).slice(0, 3).join(', ')}
            {d.openRequests.length > 3 ? '…' : ''}).
          </span>
        </div>
      )}

      <div className="pl-stats">
        <div className="pl-stat"><div className="lab">Bugün gelen</div><div className="val teal">{d.todayMail.length}</div></div>
        <div className="pl-stat"><div className="lab">Bekleyen teslimat</div><div className={`val${d.pending.length ? ' warn' : ''}`}>{d.pending.length}</div></div>
        <div className="pl-stat"><div className="lab">Yaklaşan yenileme (30g)</div><div className={`val${d.renewals.length ? ' warn' : ''}`}>{d.renewals.length}</div></div>
        <div className="pl-stat"><div className="lab">Tahsil edilen gelir</div><div className="val teal">{fmtTL(d.finance.revenue)}</div></div>
      </div>

      {d.finance.outstandingCount > 0 && (
        <div className="pl-alert" style={{ marginTop: 2 }}>
          <span className="ic" aria-hidden="true">💰</span>
          <span className="msg">
            <b>{d.finance.outstandingCount} fatura</b> tahsil edilmeyi bekliyor — toplam <b>{fmtTL(d.finance.outstandingTotal)}</b>.{' '}
            <Link to="/panel/faturalar" style={{ color: '#b45309', fontWeight: 700 }}>Faturalara git →</Link>
          </span>
        </div>
      )}

      <div className="pl-grid2">
        {/* Bugün gelen kargo/posta */}
        <div className="pl-card">
          <div className="pl-card-h">
            <h2>Bugün gelen</h2>
            <Link to="/panel/kargo" className="count">Tümü →</Link>
          </div>
          <div className="pl-card-b">
            {d.todayMail.length === 0 && <div className="pl-empty">Bugün henüz gönderi yok.</div>}
            {d.todayMail.map((m) => (
              <div className="pl-row" key={m.id}>
                <TypeBadge t={m.type} />
                <div className="grow">
                  <div className="t1">{m.customer?.title || 'Bilinmeyen müşteri'}</div>
                  <div className="t2">Gönderen: <b>{m.sender || '—'}</b></div>
                </div>
                <StatusBadge s={m.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Yaklaşan yenilemeler */}
        <div className="pl-card">
          <div className="pl-card-h">
            <h2>Yaklaşan yenilemeler</h2>
            <Link to="/panel/sozlesmeler" className="count">Tümü →</Link>
          </div>
          <div className="pl-card-b">
            {d.renewals.length === 0 && <div className="pl-empty">30 gün içinde yenileme yok.</div>}
            {d.renewals.map((c) => (
              <div className="pl-row" key={c.id}>
                <div className="grow">
                  <div className="t1">{c.customer?.title || '—'}</div>
                  <div className="t2">{c.package} · biter: <b>{fmtDate(c.end_date)}</b></div>
                </div>
                <DaysBadge endDate={c.end_date} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bekleyen teslimatlar */}
      <div className="pl-card" style={{ marginTop: 20 }}>
        <div className="pl-card-h">
          <h2>Bekleyen teslimatlar</h2>
          <span className="count">{d.pending.length} adet</span>
        </div>
        <div className="pl-card-b">
          {d.pending.length === 0 && <div className="pl-empty">Bekleyen gönderi yok — hepsi teslim edildi. 🎉</div>}
          {d.pending.map((m) => (
            <div className="pl-row" key={m.id}>
              <TypeBadge t={m.type} />
              <div className="grow">
                <div className="t1">{m.customer?.title || 'Bilinmeyen müşteri'}</div>
                <div className="t2">Gönderen: <b>{m.sender || '—'}</b> · {fmtDate(m.received_date)}</div>
              </div>
              <StatusBadge s={m.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
