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
import { shekel } from '../lib/format'
import type { Employee } from '../types'

export function Employees() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [dept, setDept] = useState<string>('הכל')

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: 'department',
      header: 'מחלקה',
      render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-paseo-gold/15 text-paseo-gold">{r.department || '—'}</span>,
    },
    { key: 'role', header: 'תפקיד', render: (r) => <span className="text-paseo-muted">{r.role || '—'}</span> },
    { key: 'salary', header: 'שכר', render: (r) => (r.salary ? <span className="font-bold text-paseo-text">{shekel(r.salary)}</span> : <span className="text-paseo-muted">—</span>) },
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

  const depts = ['הכל', ...Array.from(new Set(d.employees.map((e) => e.department || 'כללי')))]
  const filtered = d.employees.filter((e) => dept === 'הכל' || (e.department || 'כללי') === dept)
  const rows = [...filtered].sort((a, b) => (a.department || '').localeCompare(b.department || '', 'he') || a.name.localeCompare(b.name, 'he'))

  const active = filtered.filter((e) => e.status === 'פעיל').length
  const totalSalary = filtered.reduce((a, e) => a + (e.salary ?? 0), 0)

  return (
    <div>
      <PageHeader
        title="עובדים"
        subtitle={`${d.employees.length} עובדים · ${depts.length - 1} מחלקות`}
        action={<AddButton label="עובד חדש" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="עובד חדש" onClose={() => setAdding(false)}>
        <EmployeeForm onClose={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} title="עריכת עובד" onClose={() => setEditing(null)}>
        {editing && <EmployeeForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Widget title="עובדים">
          <Stat value={filtered.length} label={dept === 'הכל' ? 'סה״כ' : dept} tone="text-paseo-text" />
        </Widget>
        <Widget title="פעילים">
          <Stat value={active} label="כרגע" tone="text-paseo-green" />
        </Widget>
        <Widget title="סה״כ שכר">
          <Stat value={totalSalary ? shekel(totalSalary) : '—'} label="לפי המוזן" tone="text-paseo-gold" />
        </Widget>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {depts.map((dp) => (
          <button
            key={dp}
            onClick={() => setDept(dp)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              dept === dp
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {dp}
            {dp !== 'הכל' && (
              <span className="mr-1 opacity-70">
                ({d.employees.filter((e) => (e.department || 'כללי') === dp).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <Widget title="רשימת עובדים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין עובדים — הוסף את הצוות שלך" />
      </Widget>
    </div>
  )
}
