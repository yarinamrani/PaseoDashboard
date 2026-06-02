import { Zap, ArrowLeft } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { AlertsPanel } from '../components/AlertsPanel'
import { usePaseo } from '../data/DataContext'
import { runAutomations, AUTOMATION_RULES } from '../lib/automations'

export function Automations() {
  const d = usePaseo()
  const alerts = runAutomations(d)
  const counts = {
    high: alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
  }

  return (
    <div>
      <PageHeader
        title="אוטומציות והתראות"
        subtitle="ארבעת כללי החובה רצים על הנתונים בזמן אמת ומפיקים את ההתראות"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* הכללים */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="font-bold text-sm text-paseo-muted">כללי אוטומציה פעילים</h3>
          {AUTOMATION_RULES.map((r) => (
            <div
              key={r.id}
              className="bg-paseo-card border border-paseo-border rounded-xl p-4 shadow-card"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 grid place-items-center rounded-lg bg-paseo-gold/10 text-paseo-gold">
                  <Zap size={15} />
                </span>
                <span className="font-bold text-sm">{r.name}</span>
              </div>
              <div className="text-xs text-paseo-text/80 flex items-center gap-1.5 flex-wrap">
                <span className="bg-paseo-surface px-2 py-0.5 rounded">{r.trigger}</span>
                <ArrowLeft size={12} className="text-paseo-muted" />
                <span className="bg-paseo-surface px-2 py-0.5 rounded">{r.action}</span>
              </div>
              <div className="text-[11px] text-paseo-muted mt-2">נמען: {r.recipient}</div>
            </div>
          ))}
        </div>

        {/* פיד ההתראות */}
        <div className="lg:col-span-2">
          <Widget
            title={`התראות פתוחות (${alerts.length})`}
            action={
              <div className="flex gap-2 text-xs">
                <span className="text-paseo-red font-bold">{counts.high} דחוף</span>
                <span className="text-paseo-amber font-bold">{counts.medium} לתשומת לב</span>
              </div>
            }
          >
            <AlertsPanel alerts={alerts} />
          </Widget>
        </div>
      </div>
    </div>
  )
}
