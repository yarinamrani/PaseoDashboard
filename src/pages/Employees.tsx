import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { paseoData } from '../data/mockData'
import { formatDate, daysSince } from '../lib/dates'
import type { Employee } from '../types'

function tenure(startDate: string) {
  const months = Math.floor(daysSince(startDate) / 30)
  if (months < 12) return `${months} חודשים`
  const years = (months / 12).toFixed(1)
  return `${years} שנים`
}

const columns: Column<Employee>[] = [
  { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
  { key: 'role', header: 'תפקיד', render: (r) => r.role },
  { key: 'startDate', header: 'תאריך התחלה', render: (r) => formatDate(r.startDate) },
  { key: 'tenure', header: 'ותק', render: (r) => <span className="text-paseo-muted">{tenure(r.startDate)}</span> },
  { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
]

export function Employees() {
  const d = paseoData
  const active = d.employees.filter((e) => e.status === 'פעיל').length
  const onLeave = d.employees.filter((e) => e.status === 'בחופשה').length
  const rows = [...d.employees].sort((a, b) => a.status.localeCompare(b.status))

  return (
    <div>
      <PageHeader title="עובדים" subtitle="כוח האדם של פסאו" />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Widget title="פעילים">
          <Stat value={active} label="עובדים" tone="text-paseo-green" />
        </Widget>
        <Widget title="בחופשה">
          <Stat value={onLeave} label="כרגע" tone="text-paseo-amber" />
        </Widget>
        <Widget title="סה״כ במערכת">
          <Stat value={d.employees.length} label="עובדים" tone="text-paseo-text" />
        </Widget>
      </div>

      <Widget title="רשימת עובדים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
