import type { ReactNode } from 'react'

const baseField =
  'w-full rounded-lg border border-paseo-border bg-paseo-bg px-3 py-2 text-sm text-paseo-text outline-none focus:border-paseo-gold transition-colors'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-paseo-muted">{label}</span>
      {children}
    </label>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={baseField} />
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={baseField} />
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseField} resize-none`} rows={2} />
}
