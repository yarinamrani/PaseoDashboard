import { Banknote, CalendarHeart, Inbox, Star, Wrench, Flame, MessageSquare, Users, AlertTriangle, ListTodo } from 'lucide-react'
import { KpiCard, type Tone } from '../components/KpiCard'
import { PageHeader } from '../components/PageHeader'
import { AlertsPanel } from '../components/AlertsPanel'
import { Widget } from '../components/Widget'
import { Sparkline } from '../components/Sparkline'
import { usePaseo } from '../data/DataContext'
import {
  weekRevenue,
  lastWeekToDateRevenue,
  upcomingEvents,
  openLeads,
  newLeads,
  googleRating,
  openIssues,
  GOOGLE_TARGET,
} from '../lib/metrics'
import { runAutomations } from '../lib/automations'
import { shekel, pct } from '../lib/format'
import { dayKey, daysSince } from '../lib/dates'

const isOntopo = (p: string) => p === 'OnTopo' || p === 'OnTop'

export function OwnerControl() {
  const d = usePaseo()
  const wRev = weekRevenue(d)
  const lwRev = lastWeekToDateRevenue(d)
  const wowDelta = lwRev ? ((wRev - lwRev) / lwRev) * 100 : 0
  const upcoming = upcomingEvents(d, 30)
  const leads = openLeads(d)
  const waiting = newLeads(d)
  const rating = googleRating(d)
  const issues = openIssues(d)
  const alerts = runAutomations(d)
  const reds = alerts.filter((a) => a.severity === 'high')

  // דירוג אונטופו — ממוצע סקרי האורחים (24 חודשים אחרונים)
  const otReviews = d.reviews.filter((r) => isOntopo(r.platform) && daysSince(r.date) <= 730)
  const otRating = otReviews.length
    ? Math.round((otReviews.reduce((a, r) => a + r.rating, 0) / otReviews.length) * 10) / 10
    : 0

  // --- "היום בפסאו" ---
  const today = dayKey()
  const yesterday = new Date(Date.now() - 864e5).toLocaleDateString('en-CA')
  const approvedToday = d.reservations
    .filter((r) => r.date === today && r.status === 'approved')
    .reduce((a, r) => a + (r.size || 0), 0)
  const approvedCount = d.reservations.filter((r) => r.date === today && r.status === 'approved').length
  const yRev = d.sales.find((s) => s.date === yesterday)?.revenue ?? 0
  const openReviews = d.reviews.filter((r) => r.rating <= 3 && !r.handled).length
  const dailyPending = d.tasks
    .filter((t) => t.frequency === 'daily')
    .filter((t) => !d.taskDone.includes(`${t.id}__${today}`)).length

  // --- מגמת מחזור 30 יום ---
  const trendRows = [...d.sales]
    .filter((s) => daysSince(s.date) <= 30 && daysSince(s.date) >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const trend = trendRows.map((s) => s.revenue)

  const ratingTone: Tone = rating >= GOOGLE_TARGET ? 'good' : 'warn'
  const otTone: Tone = otRating >= 4 ? 'good' : otRating ? 'warn' : 'neutral'
  const issuesTone: Tone = issues.length === 0 ? 'good' : issues.length > 3 ? 'bad' : 'warn'
  const redTone: Tone = reds.length === 0 ? 'good' : 'bad'

  const todayItems = [
    { icon: Users, label: 'סועדים מאושרים להיום', value: approvedToday ? `${approvedToday}` : '—', sub: approvedCount ? `ב-${approvedCount} הזמנות` : 'אין הזמנות מאושרות', tone: 'text-paseo-blue' },
    { icon: Banknote, label: 'מחזור אתמול', value: yRev ? shekel(yRev) : '—', sub: 'נסגר אתמול', tone: 'text-paseo-gold' },
    { icon: AlertTriangle, label: 'ביקורות לטיפול', value: `${openReviews}`, sub: '1-3★ שלא טופלו', tone: openReviews ? 'text-paseo-red' : 'text-paseo-green' },
    { icon: ListTodo, label: 'משימות יומיות פתוחות', value: `${dailyPending}`, sub: 'טבח ושטיפה', tone: dailyPending ? 'text-paseo-amber' : 'text-paseo-green' },
  ]

  return (
    <div>
      <PageHeader
        title="בקרת בעלים"
        subtitle="המסך היחיד שצריך לפתוח כל בוקר — כל פסאו במבט אחד"
      />

      {/* היום בפסאו — תמונת מצב של עכשיו */}
      <Widget title="היום בפסאו" className="mb-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {todayItems.map((it) => {
            const Icon = it.icon
            return (
              <div key={it.label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/5 grid place-items-center shrink-0">
                  <Icon size={18} className={it.tone} />
                </div>
                <div className="min-w-0">
                  <div className={`text-xl font-black tabular-nums leading-tight ${it.tone}`}>{it.value}</div>
                  <div className="text-xs text-paseo-text/80 mt-0.5">{it.label}</div>
                  <div className="text-[11px] text-paseo-muted">{it.sub}</div>
                </div>
              </div>
            )
          })}
        </div>
      </Widget>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="מחזור השבוע"
          value={shekel(wRev)}
          icon={Banknote}
          tone="neutral"
          to="/sales"
          sub="עד היום, מול תקופה מקבילה"
          trend={pct(wowDelta)}
          trendTone={wowDelta >= 0 ? 'good' : 'bad'}
        />
        <KpiCard
          label="אירועים עתידיים"
          value={String(upcoming.length)}
          icon={CalendarHeart}
          tone="neutral"
          to="/events"
          sub={`30 יום קדימה · ${upcoming[0] ? `הקרוב: ${upcoming[0].customer}` : 'אין'}`}
        />
        <KpiCard
          label="לידים חדשים"
          value={String(waiting.length)}
          icon={Inbox}
          tone={waiting.length > 0 ? 'warn' : 'good'}
          to="/events"
          sub={`ממתינים למענה ראשון · ${leads.length} בפייפליין בטיפול`}
        />
        <KpiCard
          label="דירוג גוגל"
          value={rating.toFixed(2)}
          icon={Star}
          tone={ratingTone}
          to="/reviews"
          sub={d.googleReviewCount ? `${d.googleReviewCount} ביקורות · יעד ${GOOGLE_TARGET}+` : `יעד ${GOOGLE_TARGET}+`}
          trend={rating >= GOOGLE_TARGET ? 'מעל היעד' : 'מתחת ליעד'}
          trendTone={ratingTone}
        />
        <KpiCard
          label="דירוג אונטופו"
          value={otRating ? otRating.toFixed(1) : '—'}
          icon={MessageSquare}
          tone={otTone}
          to="/reviews"
          sub={`${otReviews.length} סקרי אורחים`}
        />
        <KpiCard
          label="תקלות פתוחות"
          value={String(issues.length)}
          icon={Wrench}
          tone={issuesTone}
          to="/maintenance"
          sub="כרגע במערכת"
        />
        <KpiCard
          label="משימות אדומות"
          value={String(reds.length)}
          icon={Flame}
          tone={redTone}
          to="/automations"
          sub="דורשות טיפול מיידי"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <Widget title="מגמת מחזור — 30 יום" to="/sales">
          {trend.length >= 2 ? (
            <>
              <Sparkline values={trend} height={64} />
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-paseo-muted">אחרון: <span className="text-paseo-gold font-bold">{shekel(trend[trend.length - 1])}</span></span>
                <span className="text-paseo-muted">שיא: {shekel(Math.max(...trend))}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-paseo-muted py-8 text-center">אין מספיק נתונים לגרף</div>
          )}
        </Widget>
        <Widget title={`התראות פעילות (${alerts.length})`} to="/automations">
          <AlertsPanel alerts={alerts} limit={5} />
        </Widget>
      </div>
    </div>
  )
}
