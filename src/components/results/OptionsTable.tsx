import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { OptionsTrade, OptionsResult } from '@/types/calculations'
import { formatCurrency, formatDate, formatNumber, cn } from '@/lib/utils'

const col = createColumnHelper<OptionsTrade>()

const CLOSE_TYPE_LABELS: Record<string, string> = {
  expired: 'Vencida',
  closed:   'Cerrada',
  exercised:'Ejercida',
  assigned: 'Asignada',
  open:     'Abierta',
}

const columns = [
  col.accessor('symbol',     { header: 'Subyac.', size: 80 }),
  col.accessor('optionSymbol', { header: 'Símbolo opción', size: 180, cell: info => (
    <span className="font-mono text-xs">{info.getValue()}</span>
  )}),
  col.accessor('optionType', { header: 'Tipo', size: 65, cell: info => (
    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', info.getValue() === 'call' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
      {info.getValue()?.toUpperCase()}
    </span>
  )}),
  col.accessor('strike',     { header: 'Strike', size: 75, cell: info => formatNumber(info.getValue()) }),
  col.accessor('expiry',     { header: 'Vencimiento', size: 100, cell: info => formatDate(info.getValue()) }),
  col.accessor('quantity',   { header: 'Contratos', size: 80, cell: info => formatNumber(info.getValue(), 0) }),
  col.accessor('openDate',   { header: 'Apertura', size: 95, cell: info => formatDate(info.getValue()) }),
  col.accessor('closeDate',  { header: 'Cierre', size: 95, cell: info => info.getValue() ? formatDate(info.getValue()!) : '—' }),
  col.accessor('closeType',  { header: 'Motivo cierre', size: 100, cell: info => (
    <span className="text-xs">{CLOSE_TYPE_LABELS[info.getValue()] ?? info.getValue()}</span>
  )}),
  col.accessor('premiumReceivedEur', { header: 'Prima cobrada (€)', size: 130, cell: info => formatCurrency(info.getValue()) }),
  col.accessor('premiumPaidEur',     { header: 'Prima pagada (€)',  size: 130, cell: info => formatCurrency(info.getValue()) }),
  col.accessor('gainLossEur', {
    header: 'G/P neta (€)',
    size: 120,
    cell: info => (
      <span className={cn('font-bold', info.getValue() >= 0 ? 'text-green-700' : 'text-red-600')}>
        {formatCurrency(info.getValue())}
      </span>
    ),
  }),
]

interface Props { result: OptionsResult }

export function OptionsTable({ result }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'openDate', desc: true }])

  const table = useReactTable({
    data: result.trades,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const { totalGains, totalLosses, netGainLoss } = result

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card label="Ganancias (opciones)" value={totalGains} positive />
        <Card label="Pérdidas (opciones)" value={Math.abs(totalLosses)} negative />
        <Card label="Resultado neto" value={netGainLoss} />
      </div>

      {result.openPositions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
          <strong>{result.openPositions.length}</strong> posición(es) en opciones siguen abiertas a fin de año y no generan resultado fiscal en {new Date().getFullYear() - 1}.
        </div>
      )}

      <div className="overflow-x-auto table-container border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="px-3 py-2 text-left text-xs font-semibold text-gray-600 whitespace-nowrap cursor-pointer select-none"
                  >
                    <span className="flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === 'asc'  && <ChevronUp className="w-3 h-3" />}
                      {h.column.getIsSorted() === 'desc' && <ChevronDown className="w-3 h-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {result.trades.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No se encontraron operaciones con opciones</div>
        )}
      </div>
    </div>
  )
}

function Card({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-green-700' : negative ? 'text-red-600' : value >= 0 ? 'text-green-700' : 'text-red-600'
  return (
    <div className="border rounded-lg p-3 bg-white">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{formatCurrency(value)}</p>
    </div>
  )
}
