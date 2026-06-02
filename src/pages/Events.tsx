import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { usePaseo } from '../data/DataContext'
import { EVENT_STATUSES, type EventLead, type EventStatus } from '../types'
import { formatDate, daysUntil } from '../lib/dates'
import { num, shekel } from '../lib/format'

const columns: Column<EventLead>[] = [
  { key: 'customer', header: 'לקוח', render: (r) => <span className="font-medium">{r.customer}</span> },
  { key: 'phone', header: 'טלפון', render: (r) => <span dir="ltr" className="text-paseo-muted">{r.phone}</span> },
  { key: 'eventType', header: 'סוג אירוע', render: (r) => r.eventType },
  { key: 'guests', header: 'אורחים', render: (r) => num(r.guests) },
  { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  { key: 'value', header: 'שווי', render: (r) => (r.value ? shekel(r.value) : '—') },
  { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
  { key: 'owner', header: 'אחראי', render: (r) => r.owner },
]

type Filter = EventStatus | 'הכל'

export function Events() {
  const d = usePaseo()
  const [filter, setFilter] = useState<Filter>('הכל')

  const rows = d.events
    .filter((e) => filter === 'הכל' || e.status === filter)
    .sort((a, b) => a.date.localeCompare(b.date))

  const upcomingClosed = d.events.filter(
    (e) => e.status === 'נסגר' && daysUntil(e.date) >= 0,
  ).length

  const filters: Filter[] = ['הכל', ...EVENT_STATUSES]

  return (
    <div>
      <PageHeader
        title="אירועים"
        subtitle={`כל ליד נכנס · ${d.events.length} סה״כ · ${upcomingClosed} אירועים סגורים עתידיים`}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {f}
            {f !== 'הכל' && (
              <span className="mr-1 opacity-70">
                ({d.events.filter((e) => e.status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <Widget title="פייפליין אירועים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין לידים בסטטוס זה" />
      </Widget>
    </div>
  )
}
