import { useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'

export function FormatGuide() {
  const [open, setOpen] = useState(false)

  return (
    <div className="border rounded-lg bg-blue-50 border-blue-200">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-800"
      >
        <span className="flex items-center gap-2">
          <Info className="w-4 h-4" />
          ¿Cómo exportar el informe desde Interactive Brokers?
        </span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {open && (
        <div className="px-4 pb-4 text-sm text-blue-900 space-y-4">
          <div>
            <p className="font-semibold mb-1">Opción A — Activity Statement (CSV, recomendado)</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li>Entra en el portal web de IBKR (Client Portal)</li>
              <li>Ve a <strong>Informes → Extractos de Actividad</strong></li>
              <li>Selecciona periodo: <strong>Año natural 2024</strong></li>
              <li>Formato: <strong>CSV</strong></li>
              <li>Descarga el archivo y súbelo aquí</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold mb-1">Opción B — Flex Query (XML, más completo)</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li>Ve a <strong>Informes → Flex Queries</strong></li>
              <li>Crea una nueva query con secciones: <em>Trades, Cash Transactions, Open Positions</em></li>
              <li>Selecciona formato <strong>XML</strong>, período <strong>2024</strong></li>
              <li>Ejecuta y descarga el archivo .xml</li>
            </ol>
          </div>

          <p className="text-xs text-blue-700 bg-blue-100 p-2 rounded">
            Puedes subir ambos archivos a la vez para combinar los datos automáticamente.
            El procesamiento es completamente local — ningún dato sale de tu ordenador.
          </p>
        </div>
      )}
    </div>
  )
}
