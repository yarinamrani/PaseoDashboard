import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { paseoData } from '../data/mockData'
import { runAutomations } from '../lib/automations'
import { TODAY } from '../lib/dates'

const longDate = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(TODAY)

export function Layout() {
  const alertCount = runAutomations(paseoData).filter((a) => a.severity === 'high').length

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar alertCount={alertCount} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 shrink-0 border-b border-paseo-border bg-paseo-surface/60 backdrop-blur flex items-center justify-between px-6">
          <div className="text-sm text-paseo-muted">{longDate} · 09:00</div>
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
