import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { usePaseo, useRefreshPaseo, useDataSource } from '../data/DataContext'
import {
  createIngredient,
  deleteIngredient,
  addRecipeLine,
  deleteRecipeLine,
} from '../data/repository'

const UNITS = ['ק״ג', 'גרם', 'יח׳', 'ליטר', 'מ״ל', 'מארז', 'שקית', 'קרטון']

const inputCls =
  'rounded-lg border border-paseo-border bg-paseo-bg px-3 py-1.5 text-sm text-paseo-text outline-none focus:border-paseo-gold'

export function Recipes() {
  const d = usePaseo()
  const refresh = useRefreshPaseo()
  const { source } = useDataSource()
  const isMock = source === 'mock'

  const [busy, setBusy] = useState(false)
  // מצרך חדש
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('ק״ג')
  const [supplier, setSupplier] = useState('')
  // מתכון
  const [dish, setDish] = useState('')
  const [lineIng, setLineIng] = useState('')
  const [lineQty, setLineQty] = useState('')

  const dishNames = [...new Set(d.dishes.map((x) => x.dishName))].sort((a, b) => a.localeCompare(b, 'he'))
  const ingById = new Map(d.ingredients.map((i) => [i.id, i]))
  const recipeLines = dish ? d.recipes.filter((r) => r.dishName === dish) : []

  async function run(fn: () => Promise<void>) {
    if (isMock || busy) return
    setBusy(true)
    try {
      await fn()
      await refresh()
    } catch {
      /* ignore */
    }
    setBusy(false)
  }

  const addIng = () =>
    name.trim() &&
    run(async () => {
      await createIngredient({ name: name.trim(), unit, supplier: supplier.trim() || undefined })
      setName('')
      setSupplier('')
    })

  const addLine = () =>
    dish &&
    lineIng &&
    Number(lineQty) > 0 &&
    run(async () => {
      await addRecipeLine(dish, lineIng, Number(lineQty))
      setLineIng('')
      setLineQty('')
    })

  return (
    <div>
      <PageHeader
        title="מתכונים ומצרכים"
        subtitle="מיפוי חד-פעמי: כמה מכל מצרך נכנס לכל מנה — הבסיס לסחורת ברזל לפי ספק"
      />

      {isMock && (
        <p className="text-xs text-paseo-amber mb-4">מצב דמה — העריכה מושבתת. התחבר כדי למפות מצרכים ומתכונים.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* מצרכים */}
        <Widget title={`מצרכים (${d.ingredients.length})`}>
          <div className="flex flex-wrap gap-2 mb-3">
            <input className={`${inputCls} flex-1 min-w-[120px]`} placeholder="שם מצרך (בשר טחון…)" value={name} onChange={(e) => setName(e.target.value)} />
            <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <input className={`${inputCls} flex-1 min-w-[100px]`} placeholder="ספק" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <button onClick={addIng} disabled={isMock || busy || !name.trim()} className="inline-flex items-center gap-1 rounded-lg bg-paseo-gold px-3 py-1.5 text-sm font-bold text-paseo-bg disabled:opacity-40">
              <Plus size={15} />
            </button>
          </div>
          <div className="divide-y divide-paseo-border">
            {d.ingredients.map((i) => (
              <div key={i.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 font-medium">{i.name}</span>
                <span className="text-xs text-paseo-muted">{i.unit}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-white/5">{i.supplier || 'ללא ספק'}</span>
                <button onClick={() => run(() => deleteIngredient(i.id))} disabled={isMock || busy} className="p-1 text-paseo-muted hover:text-paseo-red disabled:opacity-40">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!d.ingredients.length && <div className="text-center text-paseo-muted py-6 text-sm">עדיין אין מצרכים — הוסף למעלה</div>}
          </div>
        </Widget>

        {/* מתכונים */}
        <Widget title="מתכון למנה">
          <input
            list="dishlist"
            className={`${inputCls} w-full mb-3`}
            placeholder="בחר/הקלד מנה…"
            value={dish}
            onChange={(e) => setDish(e.target.value)}
          />
          <datalist id="dishlist">
            {dishNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {dish && (
            <>
              <div className="divide-y divide-paseo-border mb-3">
                {recipeLines.map((l) => {
                  const ing = ingById.get(l.ingredientId)
                  return (
                    <div key={l.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="flex-1">{ing?.name ?? '—'}</span>
                      <span className="tabular-nums">{l.qty} {ing?.unit}</span>
                      {ing?.supplier && <span className="text-xs px-2 py-0.5 rounded bg-white/5">{ing.supplier}</span>}
                      <button onClick={() => run(() => deleteRecipeLine(l.id))} disabled={isMock || busy} className="p-1 text-paseo-muted hover:text-paseo-red disabled:opacity-40">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )
                })}
                {!recipeLines.length && <div className="text-center text-paseo-muted py-4 text-sm">אין מצרכים למנה זו עדיין</div>}
              </div>

              <div className="flex flex-wrap gap-2">
                <select className={`${inputCls} flex-1 min-w-[120px]`} value={lineIng} onChange={(e) => setLineIng(e.target.value)}>
                  <option value="">בחר מצרך…</option>
                  {d.ingredients.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                  ))}
                </select>
                <input className={`${inputCls} w-24`} type="number" min="0" step="any" placeholder="כמות" value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                <button onClick={addLine} disabled={isMock || busy || !lineIng || !(Number(lineQty) > 0)} className="inline-flex items-center gap-1 rounded-lg bg-paseo-gold px-3 py-1.5 text-sm font-bold text-paseo-bg disabled:opacity-40">
                  <Plus size={15} />
                </button>
              </div>
              {!d.ingredients.length && <p className="text-[11px] text-paseo-muted mt-2">קודם הוסף מצרכים בצד ימין.</p>}
            </>
          )}
        </Widget>
      </div>

      <p className="text-[11px] text-paseo-muted mt-4">
        טיפ: מספיק למפות את ~20 המנות המובילות (הן רוב הנפח). אחרי המיפוי, עמוד "תכנון רכש" יחשב אוטומטית כמה
        מכל מצרך להזמין מכל ספק — סחורת ברזל אמיתית.
      </p>
    </div>
  )
}
