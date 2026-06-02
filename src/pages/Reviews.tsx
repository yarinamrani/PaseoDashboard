import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { paseoData } from '../data/mockData'
import { googleRating, reviewsThisMonth, GOOGLE_TARGET } from '../lib/metrics'
import { formatDate } from '../lib/dates'
import type { Review } from '../types'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-paseo-gold tabular-nums" title={`${rating}/5`}>
      {'★'.repeat(rating)}
      <span className="text-paseo-border">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

const platformColor: Record<string, string> = {
  Google: 'bg-paseo-blue/15 text-paseo-blue',
  OnTop: 'bg-paseo-green/15 text-paseo-green',
  Facebook: 'bg-paseo-gold/15 text-paseo-gold',
}

const columns: Column<Review>[] = [
  { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  {
    key: 'platform',
    header: 'פלטפורמה',
    render: (r) => (
      <span className={`text-xs px-2 py-0.5 rounded ${platformColor[r.platform]}`}>{r.platform}</span>
    ),
  },
  { key: 'rating', header: 'דירוג', render: (r) => <Stars rating={r.rating} /> },
  { key: 'text', header: 'תוכן', render: (r) => <span className="text-paseo-muted">{r.text ?? '—'}</span> },
  {
    key: 'handled',
    header: 'טופל',
    render: (r) =>
      r.handled ? (
        <span className="text-paseo-green">✓ טופל</span>
      ) : (
        <span className="text-paseo-red font-bold">✗ פתוח</span>
      ),
  },
  { key: 'owner', header: 'אחראי', render: (r) => r.owner },
]

export function Reviews() {
  const d = paseoData
  const rating = googleRating(d)
  const monthReviews = reviewsThisMonth(d)
  const rows = [...d.reviews].sort((a, b) => b.date.localeCompare(a.date))
  const untreated = d.reviews.filter((r) => r.rating <= 3 && !r.handled).length

  return (
    <div>
      <PageHeader title="ביקורות" subtitle="Google · OnTop · Facebook" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="דירוג גוגל">
          <Stat
            value={rating.toFixed(2)}
            label={`יעד ${GOOGLE_TARGET}+`}
            tone={rating >= GOOGLE_TARGET ? 'text-paseo-green' : 'text-paseo-amber'}
          />
        </Widget>
        <Widget title="ביקורות החודש">
          <Stat value={monthReviews.length} label="התקבלו" tone="text-paseo-text" />
        </Widget>
        <Widget title="ביקורות שליליות">
          <Stat
            value={monthReviews.filter((r) => r.rating <= 2).length}
            label="1-2 כוכבים"
            tone="text-paseo-red"
          />
        </Widget>
        <Widget title="ממתינות לטיפול">
          <Stat value={untreated} label="1-3★ לא טופלו" tone={untreated ? 'text-paseo-red' : 'text-paseo-green'} />
        </Widget>
      </div>

      <Widget title="כל הביקורות">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
