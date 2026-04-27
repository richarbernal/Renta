import { AlertCircle, RefreshCw, FileText, X, Play, FileBarChart2, Clock } from 'lucide-react'
import { useAppContext } from '@/store/AppContext'
import { useFileProcessor } from '@/hooks/useFileProcessor'
import { DropZone } from './DropZone'
import { FormatGuide } from './FormatGuide'
import { FISCAL_YEAR } from '@/types/tax'
import { detectFormat } from '@/parsers'

function isHistoricalFilename(name: string): boolean {
  // Heuristic: filename contains a 4-digit year that is before FISCAL_YEAR
  const matches = name.match(/\b(20\d{2})\b/g)
  if (!matches) return false
  return matches.some(y => parseInt(y, 10) < FISCAL_YEAR)
}

function formatBadge(format: string) {
  const map: Record<string, { label: string; color: string }> = {
    'flex-csv':         { label: 'Flex CSV (operaciones)',  color: 'bg-blue-100 text-blue-700' },
    'flex-dividend-csv':{ label: 'Flex CSV (dividendos)',   color: 'bg-green-100 text-green-700' },
    'flex-xml':         { label: 'Flex XML',                color: 'bg-purple-100 text-purple-700' },
    'activity-csv':     { label: 'Activity Statement',      color: 'bg-amber-100 text-amber-700' },
  }
  return map[format] ?? { label: format, color: 'bg-gray-100 text-gray-600' }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function UploadPage() {
  const { state } = useAppContext()
  const { unstageFile, processFiles, reset } = useFileProcessor()
  const isProcessing = state.phase === 'fetching-rates' || state.phase === 'parsing' || state.phase === 'calculating'
  const hasFiles = state.stagedFiles.length > 0

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">
          Declaración de la Renta {FISCAL_YEAR}
        </h2>
        <p className="text-gray-500 text-sm">
          Añade todos los informes de Interactive Brokers que necesites
          (operaciones, dividendos, años anteriores para la regla de los 2 meses)
          y pulsa <strong>Generar resultado</strong>.
        </p>
      </div>

      {/* Drop zone */}
      <DropZone />

      {/* Staged file list */}
      {hasFiles && !isProcessing && (
        <div className="bg-white border rounded-lg divide-y">
          {state.stagedFiles.map((file, i) => {
            const fmt = detectFormat(file.name, '')
            const badge = formatBadge(fmt)
            const isHistorical = isHistoricalFilename(file.name)
            return (
              <div key={`${file.name}:${file.size}`} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                </div>
                {isHistorical && (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500" title="Este archivo aportará histórico de operaciones para FIFO y regla de los 2 meses, pero no genera casillas fiscales.">
                    <Clock className="w-3 h-3" />
                    Histórico
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
                  {badge.label}
                </span>
                <button
                  onClick={() => unstageFile(i)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                  title="Quitar archivo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Generate button */}
      {hasFiles && !isProcessing && (
        <button
          onClick={processFiles}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors shadow-sm"
        >
          <Play className="w-4 h-4" />
          Generar resultado
          <span className="ml-1 text-sm font-normal opacity-80">
            ({state.stagedFiles.length} {state.stagedFiles.length === 1 ? 'archivo' : 'archivos'})
          </span>
        </button>
      )}

      {/* Error display */}
      {state.phase === 'error' && state.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800">Error al procesar los archivos</p>
            {state.errors.map((e, i) => (
              <p key={i} className="text-sm text-red-700 mt-1">{e}</p>
            ))}
            <button
              onClick={reset}
              className="mt-3 flex items-center gap-1.5 text-sm text-red-700 hover:text-red-900 font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Empezar de nuevo
            </button>
          </div>
        </div>
      )}

      {/* Format guide */}
      <FormatGuide />

      {/* Hint about multiple files */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2 text-sm text-blue-800">
        <FileBarChart2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
        <div className="space-y-0.5">
          <p className="font-medium">¿Qué archivos subir?</p>
          <ul className="text-xs list-disc list-inside text-blue-700 space-y-0.5">
            <li>Flex CSV de <strong>operaciones</strong> (Trades) del año {FISCAL_YEAR}</li>
            <li>Flex CSV de <strong>dividendos</strong> del año {FISCAL_YEAR}</li>
            <li>Flex CSV o Activity Statement de <strong>años anteriores</strong> con posiciones aún abiertas (para base de coste FIFO y regla de los 2 meses)</li>
          </ul>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <p className="font-medium mb-1">Aviso importante</p>
        <p>
          Esta herramienta calcula una estimación orientativa. Verifica siempre los resultados
          con un asesor fiscal. Las casillas y cálculos reflejan las normas generales del IRPF {FISCAL_YEAR}
          y pueden variar según tu comunidad autónoma y situación personal.
        </p>
      </div>
    </div>
  )
}
