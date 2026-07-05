import { useEffect, useState } from 'react'
import { usePaseo, useRefreshPaseo } from '../data/DataContext'
import { runAutomations } from '../lib/automations'
import { shekel } from '../lib/format'
import { dayKey } from '../lib/dates'

// מסך מצב חי למשרד/פס — מיועד לטאבלט/טלוויזיה דולקים. מתרענן לבד כל 5 דקות.
const ACTIVE = ['invited', 'approved', 'seated', 'done']

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function TvBoard() {
  const d = usePaseo()
  const refresh = useRefreshPaseo()
  const now = useClock()

  useEffect(() => {
    const t = setInterval(() => refresh(), 5 * 60 * 1000)
    return () => clearInterval(t)
  }, [refresh])

  const today = dayKey()
  const tomorrow = new Date(Date.now() + 864e5).toLocaleDateString('en-CA')
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA')

  const todayRes = d.reservations.filter((r) => r.date === today && ACTIVE.includes(r.status))
  const covers = todayRes.reduce((a, r) => a + (r.size || 0), 0)
  const tmrwCovers = d.reservations
    .filter((r) => r.date === tomorrow && ACTIVE.includes(r.status))
    .reduce((a, r) => a + (r.size || 0), 0)

  // פילוח לפי שעה להיום
  const byHour = new Map<string, number>()
  for (const r of todayRes) {
    const h = (r.time || '').slice(0, 2)
    if (!h) continue
    byHour.set(h, (byHour.get(h) || 0) + (r.size || 0))
  }
  const hours = [...byHour.entries()].sort(([a], [b]) => a.localeCompare(b))
  const maxHour = Math.max(1, ...hours.map(([, v]) => v))

  const bigTables = todayRes.filter((r) => r.size >= 8).sort((a, b) => a.time.localeCompare(b.time))
  const yRev = d.sales.find((s) => s.date === yesterday)?.revenue ?? 0
  const alerts = runAutomations(d).filter((a) => a.severity === 'high')
  const openReviews = d.reviews.filter((r) => r.rating <= 3 && !r.handled).length

  const hhmm = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  const nowHour = now.getHours()

  return (
    <div className="min-h-screen bg-paseo-bg text-paseo-text p-8 select-none" dir="rtl">
      {/* כותרת: שעון + תאריך */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-2xl text-paseo-muted">{dateStr}</div>
          <div className="text-7xl font-black tabular-nums leading-none mt-1">{hhmm}</div>
        </div>
        <div className="text-left">
          <div className="text-paseo-gold font-black text-3xl">PASEO</div>
          <div className="text-paseo-muted text-sm">מסך מצב חי · מתעדכן כל 5 דק׳</div>
        </div>
      </div>

      {/* מספרים גדולים */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-paseo-card border border-paseo-border rounded-3xl p-6 text-center">
          <div className="text-6xl font-black text-paseo-gold tabular-nums">{covers}</div>
          <div className="text-lg text-paseo-muted mt-1">מוזמנים היום</div>
        </div>
        <div className="bg-paseo-card border border-paseo-border rounded-3xl p-6 text-center">
          <div className="text-6xl font-black text-paseo-blue tabular-nums">{tmrwCovers}</div>
          <div className="text-lg text-paseo-muted mt-1">מוזמנים מחר</div>
        </div>
        <div className="bg-paseo-card border border-paseo-border rounded-3xl p-6 text-center">
          <div className="text-5xl font-black tabular-nums">{yRev ? shekel(yRev) : '—'}</div>
          <div className="text-lg text-paseo-muted mt-1">מחזור אתמול</div>
        </div>
        <div className={`rounded-3xl p-6 text-center border ${alerts.length || openReviews ? 'bg-paseo-red/10 border-paseo-red/40' : 'bg-paseo-card border-paseo-border'}`}>
          <div className={`text-6xl font-black tabular-nums ${alerts.length || openReviews ? 'text-paseo-red' : 'text-paseo-green'}`}>
            {alerts.length + openReviews}
          </div>
          <div className="text-lg text-paseo-muted mt-1">התראות + ביקורות לטיפול</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* עומס לפי שעה */}
        <div className="bg-paseo-card border border-paseo-border rounded-3xl p-6">
          <div className="text-xl font-bold mb-4">עומס היום לפי שעה</div>
          {hours.length === 0 ? (
            <div className="text-paseo-muted text-lg py-10 text-center">אין הזמנות להיום</div>
          ) : (
            <div className="space-y-2">
              {hours.map(([h, v]) => {
                const past = Number(h) < nowHour
                return (
                  <div key={h} className="flex items-center gap-3">
                    <span className={`w-14 text-lg font-bold tabular-nums ${past ? 'text-paseo-muted/50' : ''}`}>{h}:00</span>
                    <div className="flex-1 h-7 bg-white/5 rounded-lg overflow-hidden">
                      <div
                        className={`h-full rounded-lg ${past ? 'bg-paseo-muted/30' : 'bg-paseo-gold'}`}
                        style={{ width: `${(v / maxHour) * 100}%` }}
                      />
                    </div>
                    <span className={`w-10 text-lg font-black tabular-nums ${past ? 'text-paseo-muted/50' : 'text-paseo-gold'}`}>{v}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* שולחנות גדולים */}
        <div className="bg-paseo-card border border-paseo-border rounded-3xl p-6">
          <div className="text-xl font-bold mb-4">שולחנות גדולים היום (8+)</div>
          {bigTables.length === 0 ? (
            <div className="text-paseo-muted text-lg py-10 text-center">אין שולחנות גדולים היום</div>
          ) : (
            <div className="space-y-3">
              {bigTables.map((r, i) => (
                <div key={r.id + i} className="flex items-center justify-between bg-white/5 rounded-2xl px-5 py-3">
                  <span className="text-xl font-bold truncate">{r.name || '—'}</span>
                  <span className="text-lg text-paseo-muted tabular-nums mx-3">{(r.time || '').slice(0, 5)}</span>
                  <span className="text-2xl font-black text-paseo-gold tabular-nums shrink-0">{r.size}</span>
                </div>
              ))}
            </div>
          )}
          {alerts.length > 0 && (
            <div className="mt-5 border-t border-paseo-border pt-4 space-y-1">
              {alerts.slice(0, 3).map((a) => (
                <div key={a.id} className="text-paseo-red text-base truncate">🔴 {a.title}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
