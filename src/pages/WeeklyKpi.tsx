import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { usePaseo } from '../data/DataContext'
import {
  lastWeekRevenue,
  weekAvgPerDiner,
  leadsByStatus,
  googleRating,
  reviewsThisMonth,
  marketingStats,
} from '../lib/metrics'
import { lastWeekRange, inRange } from '../lib/dates'
import { shekel, num } from '../lib/format'

export function WeeklyKpi() {
  const d = usePaseo()
  const lwRev = lastWeekRevenue(d)
  const avgDiner = weekAvgPerDiner(d)
  const statusCounts = leadsByStatus(d)
  const rating = googleRating(d)
  const monthReviews = reviewsThisMonth(d)
  const mkt = marketingStats(d)

  // אירועים שנסגרו / הצעות שנשלחו / לידים חדשים בשבוע שעבר
  const lw = lastWeekRange()
  const lastWeekLeads = d.events.filter((e) => inRange(e.createdAt.slice(0, 10), lw))
  const complaints = monthReviews.filter((r) => r.rating <= 2).length

  return (
    <div>
      <PageHeader
        title="KPI שבועי"
        subtitle="סיכום יום ראשון — המספרים שמדברים על השבוע שעבר"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Widget title="מכירות">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={shekel(lwRev)} label="מחזור שבוע קודם" tone="text-paseo-gold" />
            <Stat value={shekel(avgDiner)} label="ממוצע לסועד" tone="text-paseo-text" />
            <Stat
              value="—"
              label="מול שנה קודמת"
              tone="text-paseo-muted"
            />
          </div>
          <p className="text-[11px] text-paseo-muted mt-3 text-center">
            * השוואה לשנה קודמת תתווסף עם חיבור נתונים היסטוריים
          </p>
        </Widget>

        <Widget title="אירועים">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={lastWeekLeads.length} label="לידים חדשים" tone="text-paseo-blue" />
            <Stat
              value={statusCounts['הצעה נשלחה'] ?? 0}
              label="הצעות שנשלחו"
              tone="text-paseo-amber"
            />
            <Stat
              value={statusCounts['נסגר'] ?? 0}
              label="אירועים שנסגרו"
              tone="text-paseo-green"
            />
          </div>
        </Widget>

        <Widget title="שיווק">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={mkt.postsDone} label="פוסטים" tone="text-paseo-blue" />
            <Stat value={mkt.reelsDone} label="רילסים" tone="text-paseo-blue" />
            <Stat value={num(mkt.adLeads)} label="לידים מפרסום" tone="text-paseo-green" />
          </div>
        </Widget>

        <Widget title="שירות">
          <div className="grid grid-cols-3 gap-3">
            <Stat value={rating.toFixed(2)} label="דירוג גוגל" tone="text-paseo-green" />
            <Stat value={monthReviews.length} label="מספר ביקורות" tone="text-paseo-text" />
            <Stat value={complaints} label="תלונות לקוח" tone="text-paseo-red" />
          </div>
        </Widget>
      </div>
    </div>
  )
}
