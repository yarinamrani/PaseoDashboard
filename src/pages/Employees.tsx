import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { AddButton } from '../components/AddButton'
import { Modal } from '../components/Modal'
import { EmployeeForm } from '../components/forms/EmployeeForm'
import { usePaseo } from '../data/DataContext'
import { formatDate, daysSince } from '../lib/dates'
import type { Employee } from '../types'

function tenure(startDate: string) {
  const months = Math.floor(daysSince(startDate) / 30)
  if (!Number.isFinite(months)) return '—'
  if (months < 12) return `${months} חודשים`
  return `${(months / 12).toFixed(1)} שנים`
}

export function Employees() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'role', header: 'תפקיד', render: (r) => r.role },
    { key: 'startDate', header: 'תאריך התחלה', render: (r) => formatDate(r.startDate) },
    { key: 'tenure', header: 'ותק', render: (r) => <span className="text-paseo-muted">{tenure(r.startDate)}</span> },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'עריכה',
      align: 'center',
      render: (r) => (
        <button
          onClick={() => setEditing(r)}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-paseo-muted hover:text-paseo-gold hover:bg-white/5 transition-colors"
          title="עריכה / מחיקה"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  const active = d.employees.filter((e) => e.status === 'פעיל').length
  const onLeave = d.employees.filter((e) => e.status === 'בחופשה').length
  const rows = [...d.employees].sort((a, b) => a.status.localeCompare(b.status))

  return (
    <div>
      <PageHeader
        title="עובדים"
        subtitle="כוח האדם של פסאו"
        action={<AddButton label="עובד חדש" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="עובד חדש" onClose={() => setAdding(false)}>
        <EmployeeForm onClose={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} title="עריכת עובד" onClose={() => setEditing(null)}>
        {editing && <EmployeeForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

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
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty="אין עובדים עדיין — הוסף את הצוות שלך"
        />
      </Widget>
    </div>
  )
}
