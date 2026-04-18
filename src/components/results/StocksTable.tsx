import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronUp, ChevronDown, AlertTriangle } from 'lucide-react'
import type { LotMatch, StocksResult } from '@/types/calculations'
import { formatCurrency, formatDate, formatNumber, cn } from '@/lib/utils'

const col = createColumnHelper<LotMatch>()

const columns = [
  col.accessor('symbol', { header: 'Ticker', size: 90 }),
  col.accessor('description', { header: 'Descripción', size: 200, cell: info => (
    <span className="text-xs text-gray-500 truncate max-w-[200px] block" title={info.getValue()}>{info.getValue()}</span>
  )}),
  col.accessor('buyDate', { header: 'F. Compra', cell: info => formatDate(info.getValue()), size: 95 }),
  col.accessor('sellDate', { header: 'F. Venta', cell: info => formatDate(info.getValue()), size: 95 }),
  col.accessor('quantity', { header: 'Acciones', cell: info => formatNumber(info.getValue(), 0), size: 80 }),
  col.accessor('costBasisEur', { header: 'Coste (€)', cell: info => formatCurrency(info.getValue()), size: 110 }),
  col.accessor('proceedsEur', { header: 'Ingreso (€)', cell: info => formatCurrency(info.getValue()), size: 110 }),
  col.accessor('grossGainLoss', {
    header: 'G/P bruta (€)',
    size: 120,
    cell: info => (
      <span className={info.getValue() >= 0 ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
        {formatCurrency(info.getValue())}
      </span>
    ),
  }),
  col.accessor('washSaleStatus', {
    header: 'Regla 2m',
    size: 90,
    cell: info => {
      const v = info.getValue()
      if (v === 'none') return <span className="text-gray-400 text-xs">—</span>
      if (v === 'deferred') return (
        <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
          <AlertTriangle className="w-3 h-3" /> Diferida
        </span>
      )
      return <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Aplicada</span>
    },
  }),
  col.accessor('netGainLoss', {
    header: 'G/P neta (€)',
    size: 120,
    cell: info => (
      <span className={cn('font-bold', info.getValue() >= 0 ? 'text-green-700' : 'text-red-600')}>
        {formatCurrency(info.getValue())}
      </span>
    ),
  }),
]

interface Props { result: StocksResult }

export function StocksTable({ result }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'sellDate', desc: true }])
  const [filter, setFilter] = useState('')

  const table = useReactTable({
    data: result.lotMatches,
    columns,
    state: { sorting, globalFilter: filter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const { totalGains, totalLosses, netGainLoss, deferredLosses } = result

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Ganancias" value={totalGains} positive />
        <Card label="Pérdidas" value={Math.abs(totalLosses)} negative />
        <Card label="Resultado neto" value={netGainLoss} />
        {deferredLosses > 0 && (
          <Card label="Pérdidas diferidas (regla 2m)" value={deferredLosses} warn />
        )}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtrar por ticker o descripción…"
          className="border rounded-md px-3 py-1.5 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-500">{table.getFilteredRowModel().rows.length} operaciones</span>
      </div>

      {/* Table */}
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
                      {h.column.getIsSorted() === 'asc' && <ChevronUp className="w-3 h-3" />}
                      {h.column.getIsSorted() === 'desc' && <ChevronDown className="w-3 h-3" />}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100">
            {table.getRowModel().rows.map(row => (
              <tr
                key={row.id}
                className={cn(
                  'hover:bg-gray-50',
                  row.original.washSaleStatus === 'deferred' && 'bg-amber-50',
                )}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t font-semibold">
            <tr>
              <td colSpan={8} className="px-3 py-2 text-right text-xs text-gray-600">TOTAL</td>
              <td className="px-3 py-2 text-xs"></td>
              <td className={cn('px-3 py-2 text-sm font-bold', netGainLoss >= 0 ? 'text-green-700' : 'text-red-600')}>
                {formatCurrency(netGainLoss)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function Card({ label, value, positive, negative, warn }: {
  label: string; value: number; positive?: boolean; negative?: boolean; warn?: boolean
}) {
  const color = warn ? 'text-amber-600' : positive ? 'text-green-700' : negative ? 'text-red-600' : value >= 0 ? 'text-green-700' : 'text-red-600'
  const bg = warn ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100'
  return (
    <div className={cn('border rounded-lg p-3', bg)}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{formatCurrency(value)}</p>
    </div>
  )
}
