import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { StatusBadge } from '../components/StatusBadge'
import { paseoData } from '../data/mockData'
import { marketingStats } from '../lib/metrics'
import { formatDate } from '../lib/dates'
import { shekel, num } from '../lib/format'
import type { MarketingTask } from '../types'

const columns: Column<MarketingTask>[] = [
  { key: 'task', header: 'משימה', render: (r) => <span className="font-medium">{r.task}</span> },
  {
    key: 'kind',
    header: 'קטגוריה',
    render: (r) => (
      <span
        className={`text-xs px-2 py-0.5 rounded ${
          r.kind === 'ממומן' ? 'bg-paseo-gold/15 text-paseo-gold' : 'bg-paseo-blue/15 text-paseo-blue'
        }`}
      >
        {r.kind}
      </span>
    ),
  },
  { key: 'type', header: 'סוג', render: (r) => r.type },
  { key: 'publishDate', header: 'תאריך פרסום', render: (r) => formatDate(r.publishDate) },
  { key: 'budget', header: 'תקציב', render: (r) => (r.budget ? shekel(r.budget) : '—') },
  { key: 'leads', header: 'לידים', render: (r) => (r.leadsFromAd != null ? num(r.leadsFromAd) : '—') },
  { key: 'status', header: 'סטטוס', render: (r) => <StatusBadge status={r.status} /> },
]

export function Marketing() {
  const d = paseoData
  const mkt = marketingStats(d)
  const rows = [...d.marketing].sort((a, b) => b.publishDate.localeCompare(a.publishDate))

  return (
    <div>
      <PageHeader title="שיווק" subtitle="כל פעילות שיווקית — תוכן וממומן" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="פוסטים שבוצעו">
          <Stat value={mkt.postsDone} label="החודש" tone="text-paseo-blue" />
        </Widget>
        <Widget title="רילסים שבוצעו">
          <Stat value={mkt.reelsDone} label="החודש" tone="text-paseo-blue" />
        </Widget>
        <Widget title="קמפיינים פעילים">
          <Stat value={mkt.activeCampaigns} label="כרגע" tone="text-paseo-green" />
        </Widget>
        <Widget title="לידים מפרסום">
          <Stat value={num(mkt.adLeads)} label="סה״כ" tone="text-paseo-gold" />
        </Widget>
      </div>

      <Widget title="כל הפעילות השיווקית">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
