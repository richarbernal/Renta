import { Building2, TrendingUp, TrendingDown, Split, RefreshCw, AlertTriangle } from 'lucide-react'
import type { NormalizedCorporateAction, CorporateActionType } from '@/types/normalized'
import { formatDate, formatCurrency, cn } from '@/lib/utils'

const TYPE_META: Record<CorporateActionType, { label: string; icon: React.ReactNode; color: string }> = {
  forward_split:  { label: 'Split (desdoblamiento)',  icon: <Split className="w-4 h-4" />,      color: 'bg-blue-50 text-blue-700 border-blue-200' },
  reverse_split:  { label: 'Contrasplit (agrupación)', icon: <Split className="w-4 h-4" />,     color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  cash_merger:    { label: 'Fusión/OPA (efectivo)',    icon: <Building2 className="w-4 h-4" />, color: 'bg-orange-50 text-orange-700 border-orange-200' },
  stock_merger:   { label: 'Fusión (acciones)',        icon: <RefreshCw className="w-4 h-4" />, color: 'bg-purple-50 text-purple-700 border-purple-200' },
  spinoff:        { label: 'Escisión (spinoff)',       icon: <TrendingUp className="w-4 h-4" />, color: 'bg-green-50 text-green-700 border-green-200' },
  symbol_change:  { label: 'Cambio de símbolo',        icon: <RefreshCw className="w-4 h-4" />, color: 'bg-gray-50 text-gray-700 border-gray-200' },
  stock_dividend: { label: 'Dividendo en acciones',    icon: <TrendingDown className="w-4 h-4" />, color: 'bg-teal-50 text-teal-700 border-teal-200' },
  other:          { label: 'Otra acción corporativa',  icon: <AlertTriangle className="w-4 h-4" />, color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
}

interface Props {
  actions: NormalizedCorporateAction[]
}

export function CorporateActionsInfo({ actions }: Props) {
  if (actions.length === 0) return null

  const byType = actions.reduce<Partial<Record<CorporateActionType, NormalizedCorporateAction[]>>>(
    (acc, ca) => {
      if (!acc[ca.type]) acc[ca.type] = []
      acc[ca.type]!.push(ca)
      return acc
    },
    {}
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-gray-500" />
        <h3 className="font-semibold text-gray-800">
          Acciones corporativas detectadas ({actions.length})
        </h3>
      </div>

      <p className="text-sm text-gray-500">
        Estas operaciones han sido aplicadas automáticamente al cálculo FIFO.
        Las fusiones en efectivo (OPAs) generan una venta que aparece en la tabla de acciones.
        Verifica que los resultados coinciden con los de tu bróker.
      </p>

      {(Object.entries(byType) as [CorporateActionType, NormalizedCorporateAction[]][]).map(([type, cas]) => {
        const meta = TYPE_META[type]
        return (
          <div key={type} className={cn('border rounded-lg overflow-hidden', meta.color.split(' ')[0], 'border')}>
            <div className={cn('flex items-center gap-2 px-3 py-2 border-b text-sm font-medium', meta.color)}>
              {meta.icon}
              {meta.label} ({cas.length})
            </div>
            <div className="divide-y bg-white">
              {cas.map(ca => (
                <div key={ca.id} className="px-3 py-2.5 text-sm flex flex-wrap gap-x-6 gap-y-1 items-start">
                  <span className="font-semibold text-gray-900 min-w-[60px]">{ca.symbol}</span>
                  <span className="text-gray-500">{formatDate(ca.date)}</span>
                  {ca.splitRatio !== undefined && (
                    <span className="text-gray-700">
                      Ratio: <strong>{ca.splitRatio > 1 ? `${ca.splitRatio}:1` : `1:${Math.round(1 / ca.splitRatio)}`}</strong>
                    </span>
                  )}
                  {ca.cashPerShare !== undefined && ca.cashCurrency && (
                    <span className="text-orange-700">
                      {formatCurrency(ca.cashPerShare * (ca.cashEurRate ?? 1))} / acción
                      {ca.cashCurrency !== 'EUR' && ` (${ca.cashCurrency} a tipo BCE)`}
                    </span>
                  )}
                  {ca.newSymbol && (
                    <span className="text-gray-600">
                      → <strong>{ca.newSymbol}</strong>
                      {ca.stockExchangeRatio && ` (ratio ${ca.stockExchangeRatio})`}
                    </span>
                  )}
                  <span className="text-gray-400 text-xs flex-1 min-w-full sm:min-w-0 truncate" title={ca.description}>
                    {ca.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {actions.some(ca => ca.type === 'spinoff' && !ca.spinoffCostBasisFraction) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
          <div>
            <strong>Escisiones (spinoffs):</strong> La AEAT requiere distribuir la base imponible entre la sociedad
            original y la escindida en proporción a sus valores de mercado en la fecha del evento.
            Los importes mostrados usan el valor publicado por IBKR. Verifica con tu asesor fiscal o con las
            instrucciones de distribución publicadas por la empresa.
          </div>
        </div>
      )}
    </div>
  )
}
