import { AlertTriangle, Info } from 'lucide-react'
import type { TaxSummary } from '@/types/calculations'
import { formatCurrency, formatPercent, cn } from '@/lib/utils'
import { FISCAL_YEAR } from '@/types/tax'

interface Props { results: TaxSummary }

export function SummaryPanel({ results }: Props) {
  const { baseAhorro, taxBrackets, estimatedTax, casillaSummary } = results

  return (
    <div className="space-y-6">
      {/* Base del ahorro breakdown */}
      <section className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b">
          <h3 className="font-semibold text-gray-800">Base del ahorro {FISCAL_YEAR}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Componentes de la base imponible del ahorro</p>
        </div>
        <div className="divide-y">
          <Row label="Acciones — resultado neto (G/P patrimoniales)" value={baseAhorro.gainLossStocks} />
          <Row label="Opciones — resultado neto (G/P patrimoniales)" value={baseAhorro.gainLossOptions} />
          <Row label="Dividendos íntegros (Rdtos. cap. mobiliario)" value={baseAhorro.dividendsGross} />
          <div className="px-4 py-3 flex items-center justify-between bg-gray-50">
            <span className="font-semibold text-gray-800">Total base del ahorro</span>
            <span className={cn('font-bold text-lg', baseAhorro.total >= 0 ? 'text-gray-900' : 'text-red-600')}>
              {formatCurrency(baseAhorro.total)}
            </span>
          </div>
        </div>
      </section>

      {/* Tax bracket visualization */}
      {taxBrackets.length > 0 && (
        <section className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b">
            <h3 className="font-semibold text-gray-800">Tramos de tributación (estimación)</h3>
          </div>
          <div className="divide-y">
            {taxBrackets.map((b, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                <div className="w-16 text-xs font-medium text-gray-500 flex-shrink-0">
                  {formatPercent(b.rate)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{formatCurrency(b.from)} – {isFinite(b.to) ? formatCurrency(b.to) : '∞'}</span>
                    <span>{formatCurrency(b.taxableAmount)} tributables</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (b.taxableAmount / (taxBrackets[taxBrackets.length - 1].from + taxBrackets[taxBrackets.length - 1].taxableAmount)) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm font-semibold text-right w-24 text-gray-800 flex-shrink-0">
                  {formatCurrency(b.tax)}
                </div>
              </div>
            ))}
            <div className="px-4 py-3 flex justify-between items-center bg-blue-50">
              <span className="font-semibold text-blue-900">Cuota íntegra estimada (base ahorro)</span>
              <span className="text-xl font-bold text-blue-700">{formatCurrency(estimatedTax)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Casilla mapping table */}
      <section className="border rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-2">
          <h3 className="font-semibold text-gray-800">Casillas de la declaración</h3>
          <div className="text-xs text-gray-400 flex items-center gap-1">
            <Info className="w-3.5 h-3.5" />
            Modelo 100 — Renta {FISCAL_YEAR}
          </div>
        </div>
        <div className="divide-y">
          {casillaSummary.map(({ casilla, description, value }) => (
            <div key={casilla} className="px-4 py-2.5 flex items-center gap-3">
              <div className="font-mono text-sm font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded w-16 text-center flex-shrink-0">
                {casilla}
              </div>
              <div className="flex-1 text-sm text-gray-600">{description}</div>
              <div className={cn('font-semibold text-sm w-28 text-right flex-shrink-0', value > 0 ? 'text-gray-900' : 'text-gray-400')}>
                {formatCurrency(value)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 text-sm">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-amber-800 space-y-1">
          <p className="font-medium">Estimación orientativa — verifica con tu asesor fiscal</p>
          <p className="text-xs">
            El cálculo no tiene en cuenta: deducciones autonómicas, mínimo personal y familiar, compensación de
            pérdidas de años anteriores, rentas del trabajo u otras fuentes de renta. El resultado real de tu declaración
            puede ser diferente.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-2.5 flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={cn('font-medium text-sm', value >= 0 ? 'text-gray-900' : 'text-red-600')}>
        {formatCurrency(value)}
      </span>
    </div>
  )
}
