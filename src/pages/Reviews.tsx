import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { Widget, Stat } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import { GOOGLE_TARGET } from '../lib/metrics'
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
  OnTopo: 'bg-paseo-green/15 text-paseo-green',
  OnTop: 'bg-paseo-green/15 text-paseo-green',
  Facebook: 'bg-paseo-gold/15 text-paseo-gold',
}

const columns: Column<Review>[] = [
  { key: 'date', header: 'תאריך', render: (r) => formatDate(r.date) },
  {
    key: 'platform',
    header: 'פלטפורמה',
    render: (r) => (
      <span className={`text-xs px-2 py-0.5 rounded ${platformColor[r.platform] ?? 'bg-white/5'}`}>{r.platform}</span>
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
]

const isOntopo = (r: Review) => r.platform === 'OnTopo' || r.platform === 'OnTop'
const avg = (arr: Review[]) =>
  arr.length ? Math.round((arr.reduce((a, r) => a + r.rating, 0) / arr.length) * 10) / 10 : 0

type Filter = 'הכל' | 'Google' | 'OnTopo'

export function Reviews() {
  const d = usePaseo()
  const [filter, setFilter] = useState<Filter>('הכל')

  // רק ביקורות עדכניות (24 החודשים האחרונים)
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 24)
  const cutoffIso = cutoff.toISOString().slice(0, 10)
  const recent = d.reviews.filter((r) => r.date >= cutoffIso)

  const google = recent.filter((r) => r.platform === 'Google')
  const ontopo = recent.filter(isOntopo)

  const googleRatingVal = d.googleRating ?? avg(google)
  const ontopoRatingVal = avg(ontopo)

  const filtered =
    filter === 'Google' ? google : filter === 'OnTopo' ? ontopo : recent
  const rows = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
  const untreated = filtered.filter((r) => r.rating <= 3 && !r.handled).length

  const filters: { key: Filter; count: number }[] = [
    { key: 'הכל', count: recent.length },
    { key: 'Google', count: google.length },
    { key: 'OnTopo', count: ontopo.length },
  ]

  return (
    <div>
      <PageHeader title="ביקורות" subtitle="מפולג לפי Google ו-OnTopo" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Widget title="דירוג גוגל">
          <Stat
            value={googleRatingVal.toFixed(1)}
            label={d.googleReviewCount ? `${d.googleReviewCount} ביקורות · יעד ${GOOGLE_TARGET}+` : `יעד ${GOOGLE_TARGET}+`}
            tone={googleRatingVal >= GOOGLE_TARGET ? 'text-paseo-green' : 'text-paseo-amber'}
          />
        </Widget>
        <Widget title="דירוג אונטופו">
          <Stat
            value={ontopoRatingVal ? ontopoRatingVal.toFixed(1) : '—'}
            label={`${ontopo.length} סקרי אורחים`}
            tone={ontopoRatingVal >= 4 ? 'text-paseo-green' : 'text-paseo-amber'}
          />
        </Widget>
        <Widget title="ביקורות שליליות">
          <Stat
            value={filtered.filter((r) => r.rating <= 2).length}
            label="1-2 כוכבים"
            tone="text-paseo-red"
          />
        </Widget>
        <Widget title="ממתינות לטיפול">
          <Stat value={untreated} label="1-3★ לא טופלו" tone={untreated ? 'text-paseo-red' : 'text-paseo-green'} />
        </Widget>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-paseo-gold text-paseo-bg'
                : 'bg-paseo-card border border-paseo-border text-paseo-text/80 hover:bg-white/5'
            }`}
          >
            {f.key} <span className="opacity-70">({f.count})</span>
          </button>
        ))}
      </div>

      <Widget title={`ביקורות ${filter === 'הכל' ? '' : filter}`.trim()}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="אין ביקורות בקטגוריה זו" />
      </Widget>
    </div>
  )
}
