import { useState, type FormEvent, type ReactNode } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { useDataSource, useRefreshPaseo } from '../../data/DataContext'

interface FormShellProps {
  children: ReactNode
  submitLabel: string
  onClose: () => void
  /** מבצע את השמירה בפועל (קריאה ל-repository). זורק שגיאה אם נכשל. */
  onSubmit: () => Promise<void>
  /** אם מסופק — מציג כפתור מחיקה (עם אישור דו-שלבי). למצב עריכה בלבד. */
  onDelete?: () => Promise<void>
}

/**
 * עוטף טופס: כפתורי שמירה/מחיקה/ביטול, מצב טעינה, הצגת שגיאות,
 * ורענון הדשבורד אחרי פעולה מוצלחת. במצב דמה חוסם כתיבה ומסביר למה.
 */
export function FormShell({ children, submitLabel, onClose, onSubmit, onDelete }: FormShellProps) {
  const { source } = useDataSource()
  const refresh = useRefreshPaseo()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isMock = source === 'mock'
  const busy = saving || deleting

  async function handle(e: FormEvent) {
    e.preventDefault()
    if (isMock || busy) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit()
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (isMock || busy || !onDelete) return
    // לחיצה ראשונה — מבקשת אישור; לחיצה שנייה — מוחקת בפועל
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
      await refresh()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <form onSubmit={handle} className="space-y-3">
      {isMock && (
        <div className="flex items-start gap-2 rounded-lg border border-paseo-amber/30 bg-paseo-amber/10 px-3 py-2 text-xs text-paseo-amber">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>מצב דמה — אין חיבור פעיל ל-Supabase, ולכן השמירה מושבתת. במכונה עם חיבור, הטופס יישמר.</span>
        </div>
      )}

      {children}

      {error && (
        <div className="rounded-lg border border-paseo-red/30 bg-paseo-red/10 px-3 py-2 text-xs text-paseo-red">
          שמירה נכשלה: {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <div>
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isMock || busy}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
                confirmDelete
                  ? 'bg-paseo-red text-white hover:brightness-110'
                  : 'text-paseo-red hover:bg-paseo-red/10'
              }`}
            >
              <Trash2 size={14} />
              {deleting ? 'מוחק…' : confirmDelete ? 'לאישור — מחק' : 'מחק'}
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-paseo-muted hover:text-paseo-text transition-colors"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={isMock || busy}
            className="rounded-lg bg-paseo-gold px-4 py-2 text-sm font-bold text-paseo-bg disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition"
          >
            {saving ? 'שומר…' : submitLabel}
          </button>
        </div>
      </div>
    </form>
  )
}
