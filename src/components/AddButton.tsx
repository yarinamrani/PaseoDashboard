import { Plus } from 'lucide-react'

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-paseo-gold px-3.5 py-2 text-sm font-bold text-paseo-bg hover:brightness-110 transition shadow-sm"
    >
      <Plus size={16} />
      {label}
    </button>
  )
}
