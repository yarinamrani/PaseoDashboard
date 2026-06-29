import { Users, Crown, Repeat, Clock, MessageCircle } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { KpiCard } from '../components/KpiCard'
import { usePaseo } from '../data/DataContext'

const LAPSED_DAYS = 60 // אורח חוזר שלא ביקר מעל X ימים = "נעלם"

function waLink(phone: string, name: string): string | null {
  let p = (phone || '').replace(/[^\d+]/g, '')
  if (p.startsWith('0')) p = '972' + p.slice(1)
  else if (p.startsWith('+')) p = p.slice(1)
  if (p.length < 11) return null
  const msg = `שלום ${name || ''}, כאן מסעדת פסאו 🌅 מתגעגעים אליך! נשמח לארח אותך שוב — מוזמן לחזור אלינו לשולחן 🍷`
  return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`
}

const fmt = (d: string) => (d ? d.split('-').reverse().join('/') : '—')

export function GuestLoyalty() {
  const d = usePaseo()
  const g = d.guestLoyalty

  const total = g.length
  const repeat = g.filter((x) => x.visits >= 2)
  const vips = g.filter((x) => x.visits >= 3)
  const lapsed = g
    .filter((x) => x.visits >= 2 && x.daysSince > LAPSED_DAYS)
    .sort((a, b) => b.visits - a.visits || b.daysSince - a.daysSince)
  const topLoyal = [...g].sort((a, b) => b.visits - a.visits || b.covers - a.covers).slice(0, 15)
  const repeatPct = total ? Math.round((repeat.length / total) * 100) : 0

  return (
    <div>
      <PageHeader
        title="אורחים חוזרים"
        subtitle="מבוסס על הזמנות אונטופו — מי נאמן, מי VIP, ומי נעלם וכדאי להחזיר"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="סה״כ אורחים" value={String(total)} icon={Users} tone="neutral" sub="עם טלפון באונטופו" />
        <KpiCard label="אורחים חוזרים" value={String(repeat.length)} icon={Repeat} tone="good" sub={`${repeatPct}% מכלל האורחים`} />
        <KpiCard label="VIP (3+ ביקורים)" value={String(vips.length)} icon={Crown} tone="good" sub="הלקוחות הכי נאמנים" />
        <KpiCard label="נעלמו" value={String(lapsed.length)} icon={Clock} tone={lapsed.length ? 'warn' : 'good'} sub={`חוזרים שלא ביקרו ${LAPSED_DAYS}+ יום`} />
      </div>

      {total === 0 ? (
        <Widget title="אין עדיין נתונים">
          <div className="text-sm text-paseo-muted py-8 text-center">
            נתוני אורחים מסתנכרנים מאונטופו. אם זה ריק — בדוק שהסנכרון פעיל.
          </div>
        </Widget>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* האורחים הכי נאמנים */}
          <Widget title="האורחים הכי נאמנים">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-paseo-muted text-xs border-b border-paseo-border">
                    <th className="text-right font-medium py-2">אורח</th>
                    <th className="text-right font-medium py-2">ביקורים</th>
                    <th className="text-right font-medium py-2">סועדים</th>
                    <th className="text-right font-medium py-2">ביקור אחרון</th>
                  </tr>
                </thead>
                <tbody>
                  {topLoyal.map((x, i) => (
                    <tr key={x.phone + i} className="border-b border-paseo-border/40">
                      <td className="py-2 font-medium flex items-center gap-1.5">
                        {x.visits >= 3 && <Crown size={13} className="text-paseo-gold shrink-0" />}
                        {x.name}
                      </td>
                      <td className="py-2 font-bold text-paseo-blue tabular-nums">{x.visits}</td>
                      <td className="py-2 text-paseo-muted tabular-nums">{x.covers}</td>
                      <td className="py-2 text-paseo-muted text-xs">{fmt(x.lastVisit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>

          {/* Win-Back */}
          <Widget title={`שווה להחזיר — נעלמו (${lapsed.length})`}>
            {lapsed.length === 0 ? (
              <div className="text-sm text-paseo-muted py-8 text-center">אין כרגע אורחים חוזרים שנעלמו 🎉</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {lapsed.slice(0, 40).map((x, i) => {
                  const link = waLink(x.phone, x.name)
                  return (
                    <div key={x.phone + i} className="flex items-center justify-between gap-2 border-b border-paseo-border/40 pb-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{x.name}</div>
                        <div className="text-[11px] text-paseo-muted">
                          {x.visits} ביקורים · נעלם לפני {x.daysSince} יום
                        </div>
                      </div>
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-paseo-green/15 text-paseo-green border border-paseo-green/30 px-2.5 py-1 text-xs font-bold hover:bg-paseo-green/25"
                        >
                          <MessageCircle size={13} /> וואטסאפ
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] text-paseo-muted">אין טלפון</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-3 text-[11px] text-paseo-muted leading-relaxed">
              לחיצה פותחת וואטסאפ עם הודעת חזרה מוכנה — אתה שולח ידנית (בלי דיוור אוטומטי).
            </div>
          </Widget>
        </div>
      )}
    </div>
  )
}
