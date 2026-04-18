import { AlertTriangle } from 'lucide-react'
import type { StocksResult } from '@/types/calculations'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Props { result: StocksResult }

export function WashSaleWarnings({ result }: Props) {
  const deferred = result.lotMatches.filter(m => m.washSaleStatus === 'deferred')
  if (deferred.length === 0) return null

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
        <h3 className="font-semibold text-amber-800">
          Pérdidas diferidas por la regla de los dos meses ({deferred.length})
        </h3>
      </div>

      <p className="text-sm text-amber-700">
        Las siguientes pérdidas quedan diferidas porque compraste el mismo valor dentro del
        plazo de dos meses antes o después de la venta (art. 33.5 LIRPF).
        El importe diferido se incorpora al precio de coste de las acciones adquiridas de reposición.
      </p>

      <div className="space-y-2">
        {deferred.map(m => (
          <div key={m.id} className="bg-white border border-amber-200 rounded p-3 text-sm flex flex-wrap gap-4">
            <span className="font-semibold text-gray-800">{m.symbol}</span>
            <span className="text-gray-500">Venta: {formatDate(m.sellDate)}</span>
            <span className="text-gray-500">Compra original: {formatDate(m.buyDate)}</span>
            <span className="text-red-600 font-medium">Pérdida bruta: {formatCurrency(m.grossGainLoss)}</span>
            <span className="text-amber-700 font-semibold">→ Diferida: {formatCurrency(Math.abs(m.grossGainLoss))}</span>
          </div>
        ))}
      </div>

      <p className="text-xs text-amber-600">
        Total diferido: <strong>{formatCurrency(result.deferredLosses)}</strong>.
        Estas pérdidas no se pueden compensar en la declaración de {new Date().getFullYear()}.
      </p>
    </div>
  )
}
