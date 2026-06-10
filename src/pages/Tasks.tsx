import { useState } from 'react'
import { CheckCircle2, Circle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { usePaseo, useRefreshPaseo, useDataSource } from '../data/DataContext'
import { setTaskDone } from '../data/repository'
import { dayKey, weekKey } from '../lib/dates'
import type { Task, TaskFrequency } from '../types'

const ROLES = ['הכל', 'טבח', 'שטיפה']

function pill(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
    active ? 'bg-paseo-gold text-paseo-bg' : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
  }`
}
const roleCls = (r: string) =>
  r === 'טבח' ? 'bg-paseo-blue/15 text-paseo-blue' : r === 'שטיפה' ? 'bg-paseo-green/15 text-paseo-green' : 'bg-white/5 text-paseo-muted'

export function Tasks() {
  const d = usePaseo()
  const refresh = useRefreshPaseo()
  const { source } = useDataSource()
  const [freq, setFreq] = useState<TaskFrequency>('daily')
  const [role, setRole] = useState('הכל')
  const [busy, setBusy] = useState<string | null>(null)
  const isMock = source === 'mock'

  const keyOf = (t: Task) => (t.frequency === 'daily' ? dayKey() : weekKey())
  const isDone = (t: Task) => d.taskDone.includes(`${t.id}__${keyOf(t)}`)

  const list = d.tasks.filter((t) => t.frequency === freq).filter((t) => role === 'הכל' || t.role === role)
  const doneCount = list.filter(isDone).length
  const pct = list.length ? Math.round((doneCount / list.length) * 100) : 0
  const cats = [...new Set(list.map((t) => t.category))]

  async function toggle(t: Task) {
    if (isMock || busy) return
    setBusy(t.id)
    try {
      await setTaskDone(t.id, keyOf(t), !isDone(t))
      await refresh()
    } catch {
      /* ignore */
    }
    setBusy(null)
  }

  return (
    <div>
      <PageHeader title="משימות" subtitle="משימות קבועות לטבחים ולשוטפים — יומי ושבועי" />

      <div className="flex flex-wrap gap-2 mb-3">
        {(['daily', 'weekly'] as const).map((f) => (
          <button key={f} onClick={() => setFreq(f)} className={pill(freq === f)}>
            {f === 'daily' ? 'יומי' : 'שבועי'}
          </button>
        ))}
        <span className="mx-1 w-px bg-paseo-border" />
        {ROLES.map((r) => (
          <button key={r} onClick={() => setRole(r)} className={pill(role === r)}>
            {r}
          </button>
        ))}
      </div>

      <Widget title={`התקדמות ${freq === 'daily' ? 'היום' : 'השבוע'}${role === 'הכל' ? '' : ' · ' + role}`}>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-paseo-muted">{doneCount}/{list.length} בוצעו</span>
          <span className="font-bold text-paseo-gold">{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className="h-full bg-paseo-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
      </Widget>

      {isMock && (
        <p className="text-xs text-paseo-amber mt-3">מצב דמה — הסימון מושבת. התחבר עם המשתמש כדי לסמן ביצוע.</p>
      )}

      <div className="mt-4 space-y-4">
        {cats.map((cat) => (
          <Widget key={cat} title={cat}>
            <div className="divide-y divide-paseo-border">
              {list
                .filter((t) => t.category === cat)
                .map((t) => {
                  const done = isDone(t)
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggle(t)}
                      disabled={isMock || busy === t.id}
                      className="w-full flex items-center gap-3 py-2.5 text-right hover:bg-white/[0.03] disabled:cursor-not-allowed transition-colors"
                    >
                      {done ? (
                        <CheckCircle2 size={20} className="text-paseo-green shrink-0" />
                      ) : (
                        <Circle size={20} className="text-paseo-muted shrink-0" />
                      )}
                      <span className={`flex-1 text-sm ${done ? 'line-through text-paseo-muted' : 'text-paseo-text'}`}>
                        {t.title}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${roleCls(t.role)}`}>{t.role}</span>
                    </button>
                  )
                })}
            </div>
          </Widget>
        ))}
        {list.length === 0 && <div className="text-center text-paseo-muted py-12 text-sm">אין משימות בקטגוריה זו</div>}
      </div>
    </div>
  )
}
