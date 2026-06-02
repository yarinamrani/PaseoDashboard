import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { paseoData } from '../data/mockData'
import { openIssues, staleIssues } from '../lib/metrics'
import { formatDate, daysSince } from '../lib/dates'
import { shekel } from '../lib/format'
import type { MaintenanceIssue } from '../types'

const columns: Column<MaintenanceIssue>[] = [
  { key: 'issue', header: 'תקלה', render: (r) => <span className="font-medium">{r.issue}</span> },
  { key: 'area', header: 'אזור', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.area}</span> },
  { key: 'opened', header: 'נפתח', render: (r) => formatDate(r.openedDate) },
  {
    key: 'age',
    header: 'ימים פתוח',
    render: (r) => {
      if (r.status === 'סגור') return <span className="text-paseo-muted">—</span>
      const age = daysSince(r.openedDate)
      return <span className={age > 3 ? 'text-paseo-red font-bold' : 'text-paseo-text'}>{age}</span>
    },
  },
  { key: 'owner', header: 'אחראי', render: (r) => r.owner },
  { key: 'cost', header: 'עלות', render: (r) => (r.cost ? shekel(r.cost) : '—') },
  { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
]

export function Maintenance() {
  const d = paseoData
  const open = openIssues(d)
  const stale = staleIssues(d)
  const totalCost = d.maintenance.reduce((a, m) => a + m.cost, 0)
  // פתוחות קודם, ובתוכן הוותיקות קודם
  const rows = [...d.maintenance].sort((a, b) => {
    if ((a.status === 'סגור') !== (b.status === 'סגור')) return a.status === 'סגור' ? 1 : -1
    return a.openedDate.localeCompare(b.openedDate)
  })

  return (
    <div>
      <PageHeader title="תחזוקה" subtitle="כל תקלה — מטבח, בר, שירותים, גג, חשמל, תאורה, ריהוט" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="תקלות פתוחות">
          <Stat value={open.length} label="כרגע" tone={open.length ? 'text-paseo-amber' : 'text-paseo-green'} />
        </Widget>
        <Widget title="תקועות מעל 3 ימים">
          <Stat value={stale.length} label="דורשות טיפול" tone={stale.length ? 'text-paseo-red' : 'text-paseo-green'} />
        </Widget>
        <Widget title="הושלמו">
          <Stat value={d.maintenance.filter((m) => m.status === 'סגור').length} label="סה״כ" tone="text-paseo-green" />
        </Widget>
        <Widget title="עלות מצטברת">
          <Stat value={shekel(totalCost)} label="כל התקלות" tone="text-paseo-text" />
        </Widget>
      </div>

      <Widget title="כל התקלות">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
