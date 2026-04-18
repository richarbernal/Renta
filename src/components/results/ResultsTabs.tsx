import { useState } from 'react'
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, BarChart3, AlertTriangle, Building2 } from 'lucide-react'
import type { TaxSummary } from '@/types/calculations'
import { formatCurrency, cn } from '@/lib/utils'
import { useFileProcessor } from '@/hooks/useFileProcessor'
import { StocksTable } from './StocksTable'
import { OptionsTable } from './OptionsTable'
import { DividendsTable } from './DividendsTable'
import { SummaryPanel } from './SummaryPanel'
import { WashSaleWarnings } from './WashSaleWarnings'
import { CorporateActionsInfo } from './CorporateActionsInfo'
import { ExportBar } from '@/components/export/ExportBar'
import { useAppContext } from '@/store/AppContext'

type TabId = 'acciones' | 'opciones' | 'dividendos' | 'acciones-corp' | 'resumen'

interface Props { results: TaxSummary }

export function ResultsTabs({ results }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('resumen')
  const { reset } = useFileProcessor()
  const { state } = useAppContext()

  const corporateActionsCount = state.statement?.corporateActions.length ?? 0

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'resumen',
      label: 'Resumen IRPF',
      icon: <BarChart3 className="w-4 h-4" />,
      badge: formatCurrency(results.baseAhorro.total),
    },
    {
      id: 'acciones',
      label: 'Acciones',
      icon: <TrendingUp className="w-4 h-4" />,
      badge: `${results.stocks.lotMatches.length} ops.`,
    },
    {
      id: 'opciones',
      label: 'Opciones',
      icon: <TrendingDown className="w-4 h-4" />,
      badge: `${results.options.trades.length} ops.`,
    },
    {
      id: 'dividendos',
      label: 'Dividendos',
      icon: <DollarSign className="w-4 h-4" />,
      badge: `${results.dividends.lines.length} pagos`,
    },
    ...(corporateActionsCount > 0 ? [{
      id: 'acciones-corp' as TabId,
      label: 'Acc. corporativas',
      icon: <Building2 className="w-4 h-4" />,
      badge: `${corporateActionsCount}`,
    }] : []),
  ]

  return (
    <div className="space-y-4">
      {/* Account info bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border rounded-lg px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-500">Cuenta:</span>
          <span className="font-mono font-semibold text-gray-800">{state.statement?.accountId ?? '—'}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">Año fiscal:</span>
          <span className="font-semibold">{state.statement?.fiscalYear ?? '—'}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-500">{state.files.map(f => f.name).join(', ')}</span>
          <span className="text-gray-400">|</span>
          {state.ecbRatesAvailable
            ? <span className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">Tipos BCE aplicados</span>
            : <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">Tipos IBKR (BCE no disponible)</span>
          }
        </div>
        <div className="flex items-center gap-2">
          <ExportBar results={results} />
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 border rounded-md px-3 py-1.5 hover:bg-gray-50"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Nuevo archivo
          </button>
        </div>
      </div>

      {/* Warnings */}
      {state.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-yellow-800 space-y-0.5">
            {state.warnings.slice(0, 5).map((w, i) => <p key={i}>{w}</p>)}
            {state.warnings.length > 5 && (
              <p className="text-yellow-600">+{state.warnings.length - 5} avisos más…</p>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b flex gap-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.badge && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === 'resumen' && <SummaryPanel results={results} />}
        {activeTab === 'acciones' && (
          <div className="space-y-4">
            <WashSaleWarnings result={results.stocks} />
            <StocksTable result={results.stocks} />
          </div>
        )}
        {activeTab === 'opciones' && <OptionsTable result={results.options} />}
        {activeTab === 'dividendos' && <DividendsTable result={results.dividends} />}
        {activeTab === 'acciones-corp' && (
          <CorporateActionsInfo actions={state.statement?.corporateActions ?? []} />
        )}
      </div>
    </div>
  )
}
