import { useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import type { TaxSummary } from '@/types/calculations'
import { exportToExcel } from '@/exporters/excel'
import { exportToPdf } from '@/exporters/pdf'
import { useAppContext } from '@/store/AppContext'
import { cn } from '@/lib/utils'

interface Props { results: TaxSummary }

export function ExportBar({ results }: Props) {
  const { state } = useAppContext()
  const accountId = state.statement?.accountId ?? 'CUENTA'
  const [loading, setLoading] = useState<'excel' | 'pdf' | null>(null)

  async function handleExcel() {
    setLoading('excel')
    try { exportToExcel(results, accountId) }
    finally { setLoading(null) }
  }

  async function handlePdf() {
    setLoading('pdf')
    try { exportToPdf(results, accountId) }
    finally { setLoading(null) }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 hidden sm:block flex items-center gap-1">
        <Download className="w-3 h-3" />
        Exportar:
      </span>
      <ExportButton
        icon={<FileSpreadsheet className="w-4 h-4 text-green-600" />}
        label="Excel"
        onClick={handleExcel}
        loading={loading === 'excel'}
        className="hover:bg-green-50 border-green-200"
      />
      <ExportButton
        icon={<FileText className="w-4 h-4 text-red-500" />}
        label="PDF"
        onClick={handlePdf}
        loading={loading === 'pdf'}
        className="hover:bg-red-50 border-red-200"
      />
    </div>
  )
}

function ExportButton({
  icon, label, onClick, loading, className
}: {
  icon: React.ReactNode; label: string; onClick: () => void; loading: boolean; className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 text-sm border rounded-md px-3 py-1.5 font-medium transition-colors disabled:opacity-50',
        className
      )}
    >
      {icon}
      {loading ? '…' : label}
    </button>
  )
}
