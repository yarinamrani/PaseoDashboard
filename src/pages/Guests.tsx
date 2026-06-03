import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { formatDate } from '../lib/dates'
import { num } from '../lib/format'
import type { Reservation } from '../types'

const CANCELLED = ['deleted', 'canceled', 'cancelled', 'declined', 'no_show']
const CONFIRMED = ['approved', 'seated', 'done', 'arrived']
const isCancelled = (s: string) => CANCELLED.includes(s)
const isConfirmed = (s: string) => CONFIRMED.includes(s)

const statusInfo: Record<string, { label: string; cls: string }> = {
  approved: { label: 'מאושר', cls: 'bg-paseo-green/15 text-paseo-green' },
  seated: { label: 'יושבים', cls: 'bg-paseo-blue/15 text-paseo-blue' },
  arrived: { label: 'הגיע', cls: 'bg-paseo-blue/15 text-paseo-blue' },
  done: { label: 'הסתיים', cls: 'bg-white/5 text-paseo-muted' },
  invited: { label: 'ממתין לאישור', cls: 'bg-paseo-amber/15 text-paseo-amber' },
  callback: { label: 'לחזור', cls: 'bg-paseo-amber/15 text-paseo-amber' },
  deleted: { label: 'בוטל', cls: 'bg-paseo-red/15 text-paseo-red' },
  canceled: { label: 'בוטל', cls: 'bg-paseo-red/15 text-paseo-red' },
  cancelled: { label: 'בוטל', cls: 'bg-paseo-red/15 text-paseo-red' },
}
function StatusBadge({ s }: { s: string }) {
  const i = statusInfo[s] ?? { label: s, cls: 'bg-white/5 text-paseo-muted' }
  return <span className={`text-xs px-2 py-0.5 rounded ${i.cls}`}>{i.label}</span>
}

export function Guests() {
  const d = usePaseo()
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }))
    .toISOString()
    .slice(0, 10)
  const [view, setView] = useState<'today' | 'upcoming'>('today')

  const todays = d.reservations.filter((r) => r.date === today)
  const upcoming = d.reservations.filter((r) => r.date > today)

  const confToday = todays.filter((r) => isConfirmed(r.status))
  const cancToday = todays.filter((r) => isCancelled(r.status))
  const coversToday = confToday.reduce((a, r) => a + r.size, 0)
  const upcomingActive = upcoming.filter((r) => !isCancelled(r.status))
  const upcomingCovers = upcomingActive.reduce((a, r) => a + r.size, 0)
  const pending = [...todays, ...upcoming].filter(
    (r) => r.status === 'invited' || r.status === 'callback',
  ).length

  const rows = (view === 'today' ? todays : upcoming)
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
  const columns = view === 'upcoming' ? [dateCol, ...base] : base

  return (
    <div>
      <PageHeader title="אורחים" subtitle="הזמנות וביטולים מאונטופו · מתעדכן כל שעתיים" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="מאושרים היום">
          <Stat value={num(coversToday)} label={`${confToday.length} הזמנות`} tone="text-paseo-green" />
        </Widget>
        <Widget title="ביטולים היום">
          <Stat value={cancToday.length} label="שולחנות שבוטלו" tone={cancToday.length ? 'text-paseo-red' : 'text-paseo-muted'} />
        </Widget>
        <Widget title="צפויים השבוע">
          <Stat value={num(upcomingCovers)} label={`${upcomingActive.length} הזמנות · 7 ימים`} tone="text-paseo-text" />
        </Widget>
        <Widget title="ממתינים לאישור">
          <Stat value={pending} label="הזמנות" tone={pending ? 'text-paseo-amber' : 'text-paseo-muted'} />
        </Widget>
      </div>

      <div className="flex gap-2 mb-4">
        {(['today', 'upcoming'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setView(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              view === k
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {k === 'today' ? `היום (${todays.length})` : `השבוע הקרוב (${upcoming.length})`}
          </button>
        ))}
      </div>

      <Widget title={view === 'today' ? 'הזמנות היום' : 'הזמנות 7 ימים קדימה'}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין הזמנות" />
      </Widget>
    </div>
  )
}
