import { useState } from 'react'
import { formatISO } from 'date-fns'
import { TODAY } from '../../lib/dates'
import {
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
} from '../../data/repository'
import {
  MAINTENANCE_AREAS,
  type MaintenanceArea,
  type MaintenanceIssue,
  type MaintenanceStatus,
} from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

const todayStr = formatISO(TODAY, { representation: 'date' })
const STATUSES: MaintenanceStatus[] = ['פתוח', 'בטיפול', 'סגור']

// טופס אחד שמשמש גם להוספה וגם לעריכה: אם מועבר `initial` — מצב עריכה.
export function MaintenanceForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: MaintenanceIssue
}) {
  const editing = !!initial
  const [issue, setIssue] = useState(initial?.issue ?? '')
  const [area, setArea] = useState<MaintenanceArea>(initial?.area ?? 'מטבח')
  const [openedDate, setOpenedDate] = useState(initial?.openedDate ?? todayStr)
  const [owner, setOwner] = useState(initial?.owner ?? '')
  const [cost, setCost] = useState(initial?.cost != null ? String(initial.cost) : '')
  const [status, setStatus] = useState<MaintenanceStatus>(initial?.status ?? 'פתוח')

  async function submit() {
    const payload = {
      issue: issue.trim(),
      area,
      openedDate,
      owner: owner.trim(),
      cost: Number(cost) || 0,
      status,
    }
    if (editing) {
      await updateMaintenance(initial!.id, payload)
    } else {
      await createMaintenance(payload)
    }
  }

  return (
    <FormShell
      submitLabel={editing ? 'שמור שינויים' : 'הוסף תקלה'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={editing ? () => deleteMaintenance(initial!.id) : undefined}
    >
      <Field label="תקלה">
        <TextInput value={issue} onChange={(e) => setIssue(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אזור">
          <Select value={area} onChange={(e) => setArea(e.target.value as MaintenanceArea)}>
            {MAINTENANCE_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="נפתח">
          <TextInput
            type="date"
            value={openedDate}
            onChange={(e) => setOpenedDate(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="אחראי">
          <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
        <Field label="עלות (₪)">
          <TextInput type="number" min="0" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
      <Field label="סטטוס">
        <Select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
    </FormShell>
  )
}
