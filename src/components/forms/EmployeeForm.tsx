import { useState } from 'react'
import { createEmployee, updateEmployee, deleteEmployee } from '../../data/repository'
import {
  EMPLOYEE_STATUSES,
  DEPARTMENTS,
  type Employee,
  type EmployeeStatus,
} from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

export function EmployeeForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: Employee
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [department, setDepartment] = useState<string>(initial?.department ?? DEPARTMENTS[0])
  const [role, setRole] = useState(initial?.role ?? '')
  const [startDate, setStartDate] = useState(initial?.startDate ?? '')
  const [status, setStatus] = useState<EmployeeStatus>(initial?.status ?? 'פעיל')
  const [salary, setSalary] = useState(initial?.salary != null ? String(initial.salary) : '')

  async function submit() {
    const payload = {
      name: name.trim(),
      department,
      role: role.trim(),
      startDate,
      status,
      salary: salary === '' ? undefined : Number(salary),
    }
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="מחלקה">
          <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
            {DEPARTMENTS.map((dp) => (
              <option key={dp} value={dp}>
                {dp}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="תפקיד">
          <TextInput value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="שכר (₪)">
          <TextInput type="number" min="0" value={salary} onChange={(e) => setSalary(e.target.value)} />
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
      <Field label="תאריך התחלה">
        <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
    </FormShell>
  )
}
