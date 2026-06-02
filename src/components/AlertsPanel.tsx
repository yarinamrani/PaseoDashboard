import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, Info } from 'lucide-react'
import type { Alert, AlertSeverity } from '../types'

const sevStyle: Record<AlertSeverity, { border: string; icon: typeof Bell; color: string }> = {
  high: { border: 'border-r-paseo-red', icon: AlertTriangle, color: 'text-paseo-red' },
  medium: { border: 'border-r-paseo-amber', icon: Bell, color: 'text-paseo-amber' },
  info: { border: 'border-r-paseo-blue', icon: Info, color: 'text-paseo-blue' },
}

export function AlertRow({ alert }: { alert: Alert }) {
  const s = sevStyle[alert.severity]
  const Icon = s.icon
  const inner = (
    <div
      className={`bg-paseo-surface border border-paseo-border border-r-4 ${s.border} rounded-xl p-4 hover:bg-white/[0.03] transition-colors`}
    >
      <div className="flex items-start gap-3">
        <Icon size={18} className={`${s.color} mt-0.5 shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-sm">{alert.title}</span>
            <span className="text-[11px] text-paseo-muted shrink-0">{alert.rule}</span>
          </div>
          <p className="text-sm text-paseo-text/80 mt-1">{alert.detail}</p>
          <div className="text-xs text-paseo-muted mt-2">אחראי: {alert.assignedTo}</div>
        </div>
      </div>
    </div>
  )
  return alert.link ? <Link to={alert.link}>{inner}</Link> : inner
}

export function AlertsPanel({ alerts, limit }: { alerts: Alert[]; limit?: number }) {
  const shown = limit ? alerts.slice(0, limit) : alerts
  if (!shown.length) {
    return (
      <div className="text-center text-paseo-muted py-8 text-sm">
        אין התראות פתוחות — הכל תחת שליטה 🎉
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {shown.map((a) => (
        <AlertRow key={a.id} alert={a} />
      ))}
    </div>
  )
}
