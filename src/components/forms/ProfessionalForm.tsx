import { useState } from 'react'
import {
  createProfessional,
  updateProfessional,
  deleteProfessional,
} from '../../data/repository'
import { PROFESSIONS, type Professional } from '../../types'
import { Field, TextInput, Select } from './fields'
import { FormShell } from './FormShell'

// טופס אחד להוספה ולעריכה של איש מקצוע
export function ProfessionalForm({
  onClose,
  initial,
}: {
  onClose: () => void
  initial?: Professional
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [profession, setProfession] = useState<string>(initial?.profession ?? PROFESSIONS[0])
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')

  async function submit() {
    const payload = {
      name: name.trim(),
      profession,
      phone: phone.trim(),
      notes: notes.trim() || undefined,
    }
    if (editing) await updateProfessional(initial!.id, payload)
    else await createProfessional(payload)
  }

  return (
    <FormShell
      submitLabel={editing ? 'שמור שינויים' : 'הוסף איש מקצוע'}
      onClose={onClose}
      onSubmit={submit}
      onDelete={editing ? () => deleteProfessional(initial!.id) : undefined}
    >
      <Field label="שם">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תחום">
          <Select value={profession} onChange={(e) => setProfession(e.target.value)}>
            {PROFESSIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="טלפון">
          <TextInput type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>
      <Field label="הערות">
        <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </FormShell>
  )
}
