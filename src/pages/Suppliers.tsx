import { PageHeader } from '../components/PageHeader'
import { Widget } from '../components/Widget'
import { DataTable, type Column } from '../components/DataTable'
import { usePaseo } from '../data/DataContext'
import type { Supplier } from '../types'

const columns: Column<Supplier>[] = [
  { key: 'supplier', header: 'ספק', render: (r) => <span className="font-medium">{r.supplier}</span> },
  { key: 'domain', header: 'תחום', render: (r) => <span className="text-xs px-2 py-0.5 rounded bg-white/5">{r.domain}</span> },
  { key: 'contact', header: 'איש קשר', render: (r) => r.contact },
  { key: 'phone', header: 'טלפון', render: (r) => <span dir="ltr" className="text-paseo-muted">{r.phone}</span> },
  { key: 'deliveryDays', header: 'ימי אספקה', render: (r) => r.deliveryDays },
]

export function Suppliers() {
  const d = usePaseo()
  const rows = [...d.suppliers].sort((a, b) => a.supplier.localeCompare(b.supplier, 'he'))

  return (
    <div>
      <PageHeader title="ספקים" subtitle={`${d.suppliers.length} ספקים פעילים`} />
      <Widget title="רשימת ספקים">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />
      </Widget>
    </div>
  )
}
