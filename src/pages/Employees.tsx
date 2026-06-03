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
import { shekel, num } from '../lib/format'
import { VENUES, type Employee } from '../types'

const MONTH_NAMES = ['', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
function monthLabel(m: string) {
  const [y, mm] = m.split('-')
  return `${MONTH_NAMES[Number(mm)] || mm} ${y}`
}

function Pills({ value, set, options }: { value: string; set: (v: string) => void; options: { k: string; n?: number }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => set(o.k)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            value === o.k ? 'bg-paseo-gold text-paseo-bg' : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
          }`}
        >
          {o.k}
          {o.n != null && <span className="mr-1 opacity-70">({o.n})</span>}
        </button>
      ))}
    </div>
  )
}

export function Employees() {
  const d = usePaseo()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)

  const months = [...new Set(d.payroll.map((p) => p.month))].sort().reverse()
  const [month, setMonth] = useState(months[0] ?? '')
  const [venue, setVenue] = useState('הכל')
  const [dept, setDept] = useState('הכל')

  const hoursByEmp = new Map(d.payroll.filter((p) => p.month === month).map((p) => [p.employeeId, p.hours]))
  const hoursOf = (e: Employee) => hoursByEmp.get(e.id) ?? 0
  const payOf = (e: Employee) => Math.round(hoursOf(e) * (e.hourlyRate ?? 0))

  const filtered = d.employees.filter(
    (e) => (venue === 'הכל' || (e.venue || '') === venue) && (dept === 'הכל' || (e.department || 'כללי') === dept),
  )
  const rows = [...filtered].sort((a, b) => payOf(b) - payOf(a) || hoursOf(b) - hoursOf(a) || a.name.localeCompare(b.name, 'he'))

  const totalHours = filtered.reduce((a, e) => a + hoursOf(e), 0)
  const totalPay = filtered.reduce((a, e) => a + payOf(e), 0)

  const columns: Column<Employee>[] = [
    { key: 'name', header: 'שם', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'venue', header: 'מסעדה', render: (r) => <span className={`text-xs px-2 py-0.5 rounded ${r.venue === 'אומינו' ? 'bg-paseo-blue/15 text-paseo-blue' : 'bg-paseo-green/15 text-paseo-green'}`}>{r.venue || '—'}</span> },
    { key: 'department', header: 'מחלקה', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.department || '—'}</span> },
    { key: 'hours', header: 'שעות', render: (r) => <span className="tabular-nums">{hoursOf(r) ? num(Math.round(hoursOf(r))) : '—'}</span> },
    { key: 'rate', header: 'תעריף', render: (r) => (r.hourlyRate ? shekel(r.hourlyRate) : <span className="text-paseo-amber">להזין</span>) },
    { key: 'pay', header: 'שכר', render: (r) => (payOf(r) ? <span className="font-bold text-paseo-gold">{shekel(payOf(r))}</span> : '—') },
    { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
    {
      key: 'actions',
      header: 'עריכה',
      align: 'center',
      render: (r) => (
        <button onClick={() => setEditing(r)} className="inline-flex items-center justify-center rounded-lg p-1.5 text-paseo-muted hover:text-paseo-gold hover:bg-white/5 transition-colors" title="עריכה / מחיקה">
          <Pencil size={15} />
        </button>
      ),
    },
  ]

  const venueOpts = [{ k: 'הכל' }, ...VENUES.map((v) => ({ k: v, n: d.employees.filter((e) => e.venue === v).length }))]
  const deptList = [...new Set(d.employees.map((e) => e.department || 'כללי'))]
  const deptOpts = [{ k: 'הכל' }, ...deptList.map((dp) => ({ k: dp, n: d.employees.filter((e) => (e.department || 'כללי') === dp).length }))]

  return (
    <div>
      <PageHeader
        title="עובדים"
        subtitle={`${d.employees.length} עובדים · שכר לפי שעות × תעריף`}
        action={<AddButton label="עובד חדש" onClick={() => setAdding(true)} />}
      />

      <Modal open={adding} title="עובד חדש" onClose={() => setAdding(false)}>
        <EmployeeForm onClose={() => setAdding(false)} />
      </Modal>
      <Modal open={!!editing} title="עריכת עובד" onClose={() => setEditing(null)}>
        {editing && <EmployeeForm key={editing.id} initial={editing} onClose={() => setEditing(null)} />}
      </Modal>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="עובדים">
          <Stat value={filtered.length} label={venue === 'הכל' ? 'במסעדות' : venue} tone="text-paseo-text" />
        </Widget>
        <Widget title="סה״כ שעות">
          <Stat value={num(Math.round(totalHours))} label={month ? monthLabel(month) : '—'} tone="text-paseo-blue" />
        </Widget>
        <Widget title="סה״כ שכר">
          <Stat value={totalPay ? shekel(totalPay) : '—'} label="שעות × תעריף" tone="text-paseo-gold" />
        </Widget>
        <Widget title="חודש">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full bg-paseo-bg border border-paseo-border rounded-lg px-3 py-2 text-sm text-paseo-text mt-1"
          >
            {months.length === 0 && <option value="">—</option>}
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </Widget>
      </div>

      <div className="space-y-2 mb-4">
        <Pills value={venue} set={setVenue} options={venueOpts} />
        <Pills value={dept} set={setDept} options={deptOpts} />
      </div>

      <Widget title="רשימת עובדים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין עובדים בסינון זה" />
      </Widget>
    </div>
  )
}
