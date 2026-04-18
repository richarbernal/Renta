import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { DividendLine, DividendsResult } from '@/types/calculations'
import { formatCurrency, formatDate, formatPercent, cn } from '@/lib/utils'

const col = createColumnHelper<DividendLine>()

const columns = [
  col.accessor('symbol',   { header: 'Ticker', size: 90 }),
  col.accessor('country',  { header: 'País', size: 140 }),
  col.accessor('payDate',  { header: 'Fecha pago', size: 100, cell: info => formatDate(info.getValue()) }),
  col.accessor('currency', { header: 'Divisa orig.', size: 90 }),
  col.accessor('grossAmountOrig', { header: 'Bruto orig.', size: 110, cell: info => formatCurrency(info.getValue(), info.row.original.currency) }),
  col.accessor('grossAmountEur', { header: 'Bruto (€)', size: 110, cell: info => (
    <span className="font-medium">{formatCurrency(info.getValue())}</span>
  )}),
  col.accessor('withholdingTaxEur', { header: 'Retención (€)', size: 115, cell: info => (
    <span className="text-red-600">{formatCurrency(info.getValue())}</span>
  )}),
  col.accessor('percentWithheld', { header: '% ret.', size: 70, cell: info => formatPercent(info.getValue()) }),
  col.accessor('netAmountEur', { header: 'Neto (€)', size: 110, cell: info => (
    <span className="font-bold text-green-700">{formatCurrency(info.getValue())}</span>
  )}),
]

interface Props { result: DividendsResult }

export function DividendsTable({ result }: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'payDate', desc: true }])

  const table = useReactTable({
    data: result.lines,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
  })

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Dividendos íntegros (cas. 0029)" value={result.totalGrossEur} />
        <SummaryCard label="Retenciones en origen (cas. 0031)" value={result.totalWithholdingEur} negative />
        <SummaryCard label="Neto cobrado" value={result.totalNetEur} />
        <SummaryCard label="Deducción doble imposición (cas. 0588)" value={result.dobleImposicion} positive />
      </div>

      {/* By country */}
      {Object.keys(result.byCountry).length > 1 && (
        <div className="border rounded-lg overflow-hidden">
          <p className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b">Por país</p>
          <div className="divide-y">
            {Object.entries(result.byCountry).sort(([,a],[,b]) => b.gross - a.gross).map(([country, data]) => (
              <div key={country} className="px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-gray-700">{country} <span className="text-gray-400 text-xs">({data.count})</span></span>
                <div className="flex gap-4 text-right">
                  <span className="text-gray-600">{formatCurrency(data.gross)}</span>
                  <span className="text-red-500 w-24">{formatCurrency(data.withholding)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <tfoot className="bg-gray-50 border-t font-semibold text-sm">
            <tr>
              <td colSpan={5} className="px-3 py-2 text-right text-xs text-gray-600">TOTAL</td>
              <td className="px-3 py-2">{formatCurrency(result.totalGrossEur)}</td>
              <td className="px-3 py-2 text-red-600">{formatCurrency(result.totalWithholdingEur)}</td>
              <td></td>
              <td className="px-3 py-2 text-green-700">{formatCurrency(result.totalNetEur)}</td>
            </tr>
          </tfoot>
        </table>
        {result.lines.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">No se encontraron dividendos</div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, positive, negative }: { label: string; value: number; positive?: boolean; negative?: boolean }) {
  const color = positive ? 'text-green-700' : negative ? 'text-red-600' : 'text-gray-900'
  return (
    <div className="border rounded-lg p-3 bg-white">
      <p className="text-xs text-gray-500 mb-1 leading-tight">{label}</p>
      <p className={cn('text-lg font-bold', color)}>{formatCurrency(value)}</p>
    </div>
  )
}
