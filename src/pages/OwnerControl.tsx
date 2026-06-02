import { Banknote, CalendarHeart, Inbox, Star, Wrench, Flame } from 'lucide-react'
import { KpiCard, type Tone } from '../components/KpiCard'
import { PageHeader } from '../components/PageHeader'
import { AlertsPanel } from '../components/AlertsPanel'
import { Widget } from '../components/Widget'
import { paseoData } from '../data/mockData'
import {
  weekRevenue,
  lastWeekRevenue,
  upcomingEvents,
  openLeads,
  googleRating,
  openIssues,
  GOOGLE_TARGET,
} from '../lib/metrics'
import { runAutomations } from '../lib/automations'
import { shekel, pct } from '../lib/format'

export function OwnerControl() {
  const d = paseoData
  const wRev = weekRevenue(d)
  const lwRev = lastWeekRevenue(d)
  const wowDelta = lwRev ? ((wRev - lwRev) / lwRev) * 100 : 0
  const upcoming = upcomingEvents(d, 30)
  const leads = openLeads(d)
  const rating = googleRating(d)
  const issues = openIssues(d)
  const alerts = runAutomations(d)
  const reds = alerts.filter((a) => a.severity === 'high')

  const ratingTone: Tone = rating >= GOOGLE_TARGET ? 'good' : 'warn'
  const issuesTone: Tone = issues.length === 0 ? 'good' : issues.length > 3 ? 'bad' : 'warn'
  const redTone: Tone = reds.length === 0 ? 'good' : 'bad'

  return (
    <div>
      <PageHeader
        title="בקרת בעלים"
        subtitle="המסך היחיד שצריך לפתוח כל בוקר — כל פסאו במבט אחד"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label="מחזור השבוע"
          value={shekel(wRev)}
          icon={Banknote}
          tone="neutral"
          to="/sales"
          sub="מול שבוע שעבר"
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
          label="לידים פתוחים"
          value={String(leads.length)}
          icon={Inbox}
          tone={leads.length > 0 ? 'warn' : 'neutral'}
          to="/events"
          sub="ממתינים לטיפול בפייפליין"
        />
        <KpiCard
          label="דירוג גוגל"
          value={rating.toFixed(2)}
          icon={Star}
          tone={ratingTone}
          to="/reviews"
          sub={`יעד ${GOOGLE_TARGET}+`}
          trend={rating >= GOOGLE_TARGET ? 'מעל היעד' : 'מתחת ליעד'}
          trendTone={ratingTone}
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

      <div className="mt-6">
        <Widget title={`התראות פעילות (${alerts.length})`} to="/automations">
          <AlertsPanel alerts={alerts} limit={5} />
        </Widget>
      </div>
    </div>
  )
}
