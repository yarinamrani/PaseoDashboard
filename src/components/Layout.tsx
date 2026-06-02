import { Outlet } from 'react-router-dom'
import { Database, FlaskConical } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { usePaseo, useDataSource } from '../data/DataContext'
import { runAutomations } from '../lib/automations'
import { TODAY } from '../lib/dates'

const longDate = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(TODAY)

function SourceBadge() {
  const { source } = useDataSource()
  const live = source === 'supabase'
  return (
    <span
      title={live ? 'הנתונים נטענים מ-Supabase בזמן אמת' : 'מוצגים נתוני דמה (אין חיבור פעיל)'}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border ${
        live
          ? 'bg-paseo-green/10 border-paseo-green/30 text-paseo-green'
          : 'bg-paseo-amber/10 border-paseo-amber/30 text-paseo-amber'
      }`}
    >
      {live ? <Database size={12} /> : <FlaskConical size={12} />}
      {live ? 'מחובר ל-Supabase' : 'נתוני דמה'}
    </span>
  )
}

export function Layout() {
  const d = usePaseo()
  const alertCount = runAutomations(d).filter((a) => a.severity === 'high').length

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar alertCount={alertCount} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-paseo-border bg-paseo-surface/60 backdrop-blur flex items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="text-sm text-paseo-muted">{longDate} · 09:00</div>
            <SourceBadge />
          </div>
          <div className="text-sm">
            <span className="text-paseo-muted">בוקר טוב,</span>{' '}
            <span className="font-bold">בעלי פסאו</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
