import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { usePaseo } from '../data/DataContext'
import {
  monthRevenue,
  weekRevenue,
  lastWeekToDateRevenue,
  dailyRevenueSeries,
  leadsByStatus,
  openLeads,
  upcomingEvents,
  googleRating,
  reviewsThisMonth,
  marketingStats,
  openIssues,
  GOOGLE_TARGET,
} from '../lib/metrics'
import { redTasks } from '../lib/automations'
import { shekel, shekelShort, num, pct } from '../lib/format'
import { daysUntil, formatDate } from '../lib/dates'

const chartTheme = {
  grid: '#2c313c',
  axis: '#8b93a7',
  gold: '#d4af37',
  blue: '#60a5fa',
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-paseo-bg border border-paseo-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="text-paseo-muted mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="font-bold" style={{ color: p.color }}>
          {p.dataKey}: {p.dataKey === 'מחזור' ? shekel(p.value) : num(p.value)}
        </div>
      ))}
    </div>
  )
}

export function CeoDashboard() {
  const d = usePaseo()
  const mRev = monthRevenue(d)
  const wRev = weekRevenue(d)
  const lwRev = lastWeekToDateRevenue(d)
  const wow = lwRev ? ((wRev - lwRev) / lwRev) * 100 : 0
  const series = dailyRevenueSeries(d, 30)
  const statusCounts = leadsByStatus(d)
  const leads = openLeads(d)
  const upcoming = upcomingEvents(d, 30)
  const rating = googleRating(d)
  const monthReviews = reviewsThisMonth(d)
  const mkt = marketingStats(d)
  const issues = openIssues(d)
  const reds = redTasks(d)

  const leadStages = [
    { stage: 'ליד חדש', count: statusCounts['ליד חדש'] ?? 0 },
    { stage: 'שיחה', count: statusCounts['שיחה בוצעה'] ?? 0 },
    { stage: 'פגישה', count: statusCounts['פגישה'] ?? 0 },
    { stage: 'הצעה', count: statusCounts['הצעה נשלחה'] ?? 0 },
    { stage: 'משא ומתן', count: statusCounts['משא ומתן'] ?? 0 },
  ]

  return (
    <div>
      <PageHeader title="דשבורד מנכ״ל" subtitle="תמונת ניהול מלאה — 10 ווידג׳טים" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1 + 2: מחזור חודשי / שבועי + גרף */}
        <Widget title="מחזור חודשי" to="/sales" className="lg:col-span-2">
          <div className="text-3xl font-black text-paseo-gold">{shekel(mRev)}</div>
          <div className="text-xs text-paseo-muted mt-1">החודש הנוכחי</div>
          <div className="h-32 mt-3 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.gold} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={chartTheme.gold} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: chartTheme.axis, fontSize: 10 }} reversed />
                <YAxis
                  tick={{ fill: chartTheme.axis, fontSize: 10 }}
                  tickFormatter={(v) => shekelShort(v)}
                  width={48}
                  orientation="right"
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="מחזור"
                  stroke={chartTheme.gold}
                  strokeWidth={2}
                  fill="url(#rev)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Widget>

        <Widget title="מחזור שבועי">
          <div className="text-3xl font-black text-paseo-text">{shekel(wRev)}</div>
          <div className="text-[11px] text-paseo-muted">שבוע עד היום</div>
          <div className="mt-2 text-sm">
            <span className={wow >= 0 ? 'text-paseo-green font-bold' : 'text-paseo-red font-bold'}>
              {pct(wow)}
            </span>{' '}
            <span className="text-paseo-muted">מול תקופה מקבילה</span>
          </div>
          <div className="text-xs text-paseo-muted mt-1">
            תקופה מקבילה שבוע שעבר: {shekel(lwRev)}
          </div>
        </Widget>

        {/* 3: לידים פתוחים */}
        <Widget title="לידים פתוחים" to="/events">
          <div className="text-3xl font-black text-paseo-blue mb-3">{leads.length}</div>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-paseo-muted">חדשים</span>
              <span className="font-bold">{statusCounts['ליד חדש'] ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-paseo-muted">בפגישה</span>
              <span className="font-bold">{statusCounts['פגישה'] ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-paseo-muted">בהצעה</span>
              <span className="font-bold">{statusCounts['הצעה נשלחה'] ?? 0}</span>
            </div>
          </div>
        </Widget>

        {/* 4: אירועים עתידיים */}
        <Widget title="אירועים עתידיים" to="/events" className="lg:col-span-2">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-3xl font-black text-paseo-green">{upcoming.length}</span>
            <span className="text-xs text-paseo-muted">ב-30 הימים הקרובים</span>
          </div>
          <div className="space-y-2">
            {upcoming.slice(0, 4).map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{e.customer}</span>
                <span className="text-paseo-muted text-xs">
                  {e.eventType} · בעוד {daysUntil(e.date)} ימים · {formatDate(e.date)}
                </span>
              </div>
            ))}
            {!upcoming.length && <div className="text-paseo-muted text-sm">אין אירועים סגורים</div>}
          </div>
        </Widget>

        {/* 5: משימות באיחור */}
        <Widget title="משימות באיחור" to="/automations">
          <div className={`text-3xl font-black ${reds.length ? 'text-paseo-red' : 'text-paseo-green'}`}>
            {reds.length}
          </div>
          <div className="text-xs text-paseo-muted mt-1">משימות אדומות פתוחות</div>
          <div className="mt-3 space-y-1">
            {reds.slice(0, 3).map((a) => (
              <div key={a.id} className="text-xs text-paseo-text/80 truncate">
                • {a.title}
              </div>
            ))}
          </div>
        </Widget>

        {/* 6 + 10: תקלות פתוחות / תחזוקה */}
        <Widget title="תקלות פתוחות" to="/maintenance">
          <div className={`text-3xl font-black ${issues.length ? 'text-paseo-amber' : 'text-paseo-green'}`}>
            {issues.length}
          </div>
          <div className="text-xs text-paseo-muted mt-1">תחזוקה פעילה כרגע</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <Stat
              value={issues.filter((i) => i.status === 'פתוח').length}
              label="פתוח"
              tone="text-paseo-red"
            />
            <Stat
              value={issues.filter((i) => i.status === 'בטיפול').length}
              label="בטיפול"
              tone="text-paseo-amber"
            />
          </div>
        </Widget>

        {/* 7: דירוג Google */}
        <Widget title="דירוג Google" to="/reviews">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-3xl font-black ${
                rating >= GOOGLE_TARGET ? 'text-paseo-green' : 'text-paseo-amber'
              }`}
            >
              {rating.toFixed(2)}
            </span>
            <span className="text-paseo-gold">★</span>
          </div>
          <div className="text-xs text-paseo-muted mt-1">יעד: {GOOGLE_TARGET}+</div>
          <div className="mt-3 h-2 rounded-full bg-paseo-border overflow-hidden">
            <div
              className={`h-full ${rating >= GOOGLE_TARGET ? 'bg-paseo-green' : 'bg-paseo-amber'}`}
              style={{ width: `${Math.min(100, (rating / 5) * 100)}%` }}
            />
          </div>
        </Widget>

        {/* 8: ביקורות חדשות החודש */}
        <Widget title="ביקורות חדשות החודש" to="/reviews">
          <div className="text-3xl font-black text-paseo-text">{monthReviews.length}</div>
          <div className="text-xs text-paseo-muted mt-1">ביקורות שהתקבלו החודש</div>
          <div className="mt-3 grid grid-cols-3 gap-1 text-center">
            <Stat
              value={monthReviews.filter((r) => r.rating >= 4).length}
              label="חיוביות"
              tone="text-paseo-green"
            />
            <Stat
              value={monthReviews.filter((r) => r.rating === 3).length}
              label="ניטרלי"
              tone="text-paseo-amber"
            />
            <Stat
              value={monthReviews.filter((r) => r.rating <= 2).length}
              label="שליליות"
              tone="text-paseo-red"
            />
          </div>
        </Widget>

        {/* 9: תוכן שיווקי */}
        <Widget title="תוכן שיווקי" to="/marketing" className="lg:col-span-2">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Stat value={mkt.postsDone} label="פוסטים שבוצעו" tone="text-paseo-blue" />
            <Stat value={mkt.reelsDone} label="רילסים שבוצעו" tone="text-paseo-blue" />
            <Stat value={mkt.activeCampaigns} label="קמפיינים פעילים" tone="text-paseo-green" />
          </div>
          <div className="text-xs text-paseo-muted text-center border-t border-paseo-border pt-2">
            {num(mkt.adLeads)} לידים הגיעו מפרסום ממומן
          </div>
        </Widget>

        {/* פייפליין לידים — גרף עמודות */}
        <Widget title="פייפליין לידים" to="/events" className="lg:col-span-2">
          <div className="h-40 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leadStages} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="stage" tick={{ fill: chartTheme.axis, fontSize: 10 }} />
                <YAxis tick={{ fill: chartTheme.axis, fontSize: 10 }} allowDecimals={false} orientation="right" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="count" name="לידים" fill={chartTheme.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Widget>
      </div>
    </div>
  )
}
