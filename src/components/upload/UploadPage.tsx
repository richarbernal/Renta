import { AlertCircle, RefreshCw } from 'lucide-react'
import { useAppContext } from '@/store/AppContext'
import { useFileProcessor } from '@/hooks/useFileProcessor'
import { DropZone } from './DropZone'
import { FormatGuide } from './FormatGuide'
import { FISCAL_YEAR } from '@/types/tax'

export function UploadPage() {
  const { state } = useAppContext()
  const { reset } = useFileProcessor()

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900">
          Declaración de la Renta {FISCAL_YEAR}
        </h2>
        <p className="text-gray-500">
          Sube tu informe de Interactive Brokers para calcular automáticamente<br />
          las operaciones de acciones, opciones y dividendos.
        </p>
      </div>

      <DropZone />

      {state.phase === 'error' && state.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800">Error al procesar el archivo</p>
            {state.errors.map((e, i) => (
              <p key={i} className="text-sm text-red-700 mt-1">{e}</p>
            ))}
            <button
              onClick={reset}
              className="mt-3 flex items-center gap-1.5 text-sm text-red-700 hover:text-red-900 font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Intentar de nuevo
            </button>
          </div>
        </div>
      )}

      <FormatGuide />

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
