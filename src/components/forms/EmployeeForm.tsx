import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import { createEmployee, updateEmployee, deleteEmployee } from '../../data/repository'
import { EMPLOYEE_STATUSES, type Employee, type EmployeeStatus } from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })

export function EmployeeForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: Employee
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [role, setRole] = useState(initial?.role ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate || todayStr)
  const [status, setStatus] = useState<EmployeeStatus>(initial?.status ?? 'פעיל')

  async function submit() {
    const payload = { name: name.trim(), role: role.trim(), startDate, status }
    if (editing) await updateEmployee(initial!.id, payload)
    else await createEmployee(payload)
  }

  return (
    <FormShell
      submitLabel={editing ? 'שמור שינויים' : 'הוסף עובד'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={editing ? () => deleteEmployee(initial!.id) : undefined}
    >
      <Field label="שם">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="תפקיד">
        <TextInput value={role} onChange={(e) => setRole(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך התחלה">
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="סטטוס">
          <Select value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus)}>
            {EMPLOYEE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </FormShell>
  )
}
