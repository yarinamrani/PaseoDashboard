import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-6">
      <div>
        <h1 className="text-2xl font-black">{title}</h1>
        {subtitle && <p className="text-sm text-paseo-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}
