import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { formatDate } from '../lib/dates'
import { num } from '../lib/format'
import type { Reservation } from '../types'

const CANCELLED = ['deleted', 'canceled', 'cancelled', 'declined']
const NOSHOW = ['noShow', 'no_show', 'noshow']
const CONFIRMED = ['approved', 'seated', 'done', 'arrived']
const isCancelled = (s: string) => CANCELLED.includes(s)
const isNoShow = (s: string) => NOSHOW.includes(s)
const isConfirmed = (s: string) => CONFIRMED.includes(s)

const statusInfo: Record<string, { label: string; cls: string }> = {
  approved: { label: 'מאושר', cls: 'bg-paseo-green/15 text-paseo-green' },
  seated: { label: 'יושבים', cls: 'bg-paseo-blue/15 text-paseo-blue' },
  arrived: { label: 'הגיע', cls: 'bg-paseo-blue/15 text-paseo-blue' },
  done: { label: 'הסתיים', cls: 'bg-white/5 text-paseo-muted' },
  invited: { label: 'ממתין לאישור', cls: 'bg-paseo-amber/15 text-paseo-amber' },
  callback: { label: 'לחזור', cls: 'bg-paseo-amber/15 text-paseo-amber' },
  deleted: { label: 'הוסר', cls: 'bg-paseo-red/15 text-paseo-red' },
  canceled: { label: 'בוטל', cls: 'bg-paseo-red/15 text-paseo-red' },
  cancelled: { label: 'בוטל', cls: 'bg-paseo-red/15 text-paseo-red' },
  noShow: { label: 'לא הגיע', cls: 'bg-paseo-amber/15 text-paseo-amber' },
}
function StatusBadge({ s }: { s: string }) {
  const i = statusInfo[s] ?? { label: s, cls: 'bg-white/5 text-paseo-muted' }
  return <span className={`text-xs px-2 py-0.5 rounded ${i.cls}`}>{i.label}</span>
}

// מחרוזת תאריך (YYYY-MM-DD) של היום בישראל, ושל לפני N ימים
const dayStr = (offset = 0) => {
  const il = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
  il.setDate(il.getDate() + offset)
  return il.toISOString().slice(0, 10)
}

type Period = 'today' | 'week' | 'month' | 'upcoming'
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: '7 ימים' },
  { key: 'month', label: '30 יום' },
  { key: 'upcoming', label: 'הקרוב' },
]

export function Guests() {
  const d = usePaseo()
  const today = dayStr(0)
  const [period, setPeriod] = useState<Period>('today')

  // טווח התאריכים לפי הבחירה
  const inPeriod = (r: Reservation) => {
    if (period === 'today') return r.date === today
    if (period === 'week') return r.date >= dayStr(-6) && r.date <= today
    if (period === 'month') return r.date >= dayStr(-29) && r.date <= today
    return r.date > today // upcoming
  }
  const list = d.reservations.filter(inPeriod)

  const confirmed = list.filter((r) => isConfirmed(r.status))
  const cancelled = list.filter((r) => isCancelled(r.status))
  const noShows = list.filter((r) => isNoShow(r.status))
  const covers = confirmed.reduce((a, r) => a + r.size, 0)
  const days = period === 'today' ? 1 : period === 'week' ? 7 : period === 'month' ? 30 : 7
  const avgCoversPerDay = Math.round(covers / days)
  const totalBooked = list.length
  const cancelRate = totalBooked ? Math.round(((cancelled.length + noShows.length) / totalBooked) * 100) : 0

  const rows = list
    .slice()
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))

  const dateCol: Column<Reservation> = { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) }
  const base: Column<Reservation>[] = [
    { key: 'time', header: 'שעה', render: (r) => <span className="tabular-nums">{r.time || '—'}</span> },
    { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'size', header: 'סועדים', render: (r) => num(r.size) },
    { key: 'phone', header: 'טלפון', render: (r) => <span dir="ltr" className="text-paseo-muted">{r.phone || '—'}</span> },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge s={r.status} /> },
  ]
  // בטווחים מרובי-ימים נוסיף עמודת תאריך
  const columns = period === 'today' ? base : [dateCol, ...base]

  const periodLabel = PERIODS.find((p) => p.key === period)!.label

  return (
    <div>
      <PageHeader title="אורחים" subtitle="הזמנות וביטולים מאונטופו · פילוח לפי יום / שבוע / חודש" />

      <div className="flex flex-wrap gap-2 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              period === p.key
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title={`סועדים · ${periodLabel}`}>
          <Stat value={num(covers)} label={`${confirmed.length} הזמנות`} tone="text-paseo-green" />
        </Widget>
        <Widget title="ממוצע סועדים ליום">
          <Stat value={num(avgCoversPerDay)} label={period === 'today' ? 'היום' : `על פני ${days} ימים`} tone="text-paseo-blue" />
        </Widget>
        <Widget title="ביטולים">
          <Stat
            value={cancelled.length + noShows.length}
            label={`${cancelled.length} בוטלו · ${noShows.length} לא הגיעו`}
            tone={cancelled.length + noShows.length ? 'text-paseo-red' : 'text-paseo-muted'}
          />
        </Widget>
        <Widget title="אחוז ביטול">
          <Stat value={`${cancelRate}%`} label={`מתוך ${totalBooked} הזמנות`} tone={cancelRate >= 25 ? 'text-paseo-red' : cancelRate >= 12 ? 'text-paseo-amber' : 'text-paseo-green'} />
        </Widget>
      </div>

      <Widget title={`הזמנות · ${periodLabel}`}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין הזמנות בטווח" />
      </Widget>

      <p className="text-[11px] text-paseo-muted mt-3">
        הערה: אונטופו לא שומר סיבת ביטול — הלקוח מבטל ללא הזנת סיבה. לכן הפילוח הוא לפי סוג (בוטל / לא הגיע) ולא לפי סיבה.
      </p>
    </div>
  )
}
