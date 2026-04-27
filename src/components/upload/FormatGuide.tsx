import { useState } from 'react'
import { ChevronDown, ChevronUp, Info, CheckCircle2 } from 'lucide-react'

const FLEX_FIELDS: { section: string; fields: string[] }[] = [
  {
    section: 'Trades',
    fields: [
      'Asset Category', 'Sub Category', 'Currency', 'Symbol', 'Description', 'ISIN',
      'Trade Date', 'Trade Time', 'Quantity', 'Trade Price', 'Trade Money',
      'Proceeds', 'IB Commission', 'Open/Close Indicator', 'Buy/Sell',
      'FX Rate To Base', 'Multiplier', 'Put/Call', 'Strike', 'Expiry',
      'Underlying Symbol', 'Transaction Type', 'Order ID',
    ],
  },
  {
    section: 'Cash Transactions',
    fields: [
      'Type', 'Currency', 'Description', 'Date/Time', 'Amount',
    ],
  },
  {
    section: 'Open Positions',
    fields: [
      'Asset Category', 'Currency', 'Symbol', 'Description', 'ISIN',
      'Position', 'Mark Price', 'Position Value',
      'Cost Basis Price', 'Cost Basis Money', 'Multiplier',
      'Put/Call', 'Strike', 'Expiry', 'Underlying Symbol',
    ],
  },
  {
    section: 'Corporate Actions',
    fields: [
      'Type', 'Currency', 'Symbol', 'Description', 'ISIN',
      'Report Date', 'Date/Time', 'Quantity', 'Proceeds', 'Value',
      'Realized P&L', 'Code',
    ],
  },
]

export function FormatGuide() {
  const [open, setOpen] = useState(false)
  const [showFields, setShowFields] = useState(false)

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
        <div className="px-4 pb-4 text-sm text-blue-900 space-y-5">

          {/* Opción A */}
          <div>
            <p className="font-semibold mb-2">Opción A — Activity Statement CSV (más sencillo)</p>
            <ol className="list-decimal list-inside space-y-1 text-blue-800">
              <li>Entra en <strong>Client Portal → Informes → Extractos de Actividad</strong></li>
              <li>Período: <strong>Año natural 2025</strong></li>
              <li>Formato: <strong>CSV</strong></li>
              <li>Descarga el archivo y arrástralo aquí</li>
            </ol>
            <p className="text-xs text-blue-700 mt-1">
              El Activity Statement incluye automáticamente todas las secciones necesarias (Trades, Dividends, Withholding Tax, Open Positions, Corporate Actions).
            </p>
          </div>

          {/* Opción B */}
          <div>
            <p className="font-semibold mb-2">Opción B — Flex Query XML (más completo y preciso)</p>
            <ol className="list-decimal list-inside space-y-2 text-blue-800">
              <li>
                Ve a <strong>Client Portal → Informes → Flex Queries</strong> y pulsa
                {' '}<strong>+ Crear nueva query</strong>
              </li>
              <li>
                Nombre: por ejemplo <em>Renta 2025</em>. Formato: <strong>XML</strong>.
                Período: <strong>Año natural 2025</strong>.
              </li>
              <li>
                Añade las siguientes <strong>4 secciones</strong> y activa exactamente los campos indicados:
                <button
                  onClick={() => setShowFields(v => !v)}
                  className="ml-2 text-xs underline text-blue-600 hover:text-blue-800"
                >
                  {showFields ? 'Ocultar lista de campos' : 'Ver lista de campos'}
                </button>
                {showFields && (
                  <div className="mt-2 space-y-3">
                    {FLEX_FIELDS.map(({ section, fields }) => (
                      <div key={section} className="bg-white border border-blue-200 rounded p-2">
                        <p className="font-semibold text-blue-900 mb-1">Sección: {section}</p>
                        <div className="flex flex-wrap gap-1">
                          {fields.map(f => (
                            <span key={f} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
              <li>
                En los ajustes de formato de fecha selecciona <strong>YYYY-MM-DD</strong> (o deja el valor predeterminado).
              </li>
              <li>
                Guarda la query, pulsa <strong>Ejecutar</strong> y descarga el archivo <em>.xml</em>.
              </li>
              <li>Arrastra el archivo aquí.</li>
            </ol>
          </div>

          {/* Dividendos separados */}
          <div>
            <p className="font-semibold mb-2">Archivo separado para dividendos (Flex Query CSV)</p>
            <p className="text-xs text-blue-800 mb-2">
              Si usas Flex Query, los dividendos se exportan en un archivo CSV separado con la sección <em>Dividends</em>.
              Crea una segunda Flex Query con las siguientes columnas y arrástrala junto con el archivo de operaciones:
            </p>
            <div className="bg-white border border-blue-200 rounded p-2">
              <div className="flex flex-wrap gap-1">
                {['Symbol', 'ISIN', 'Currency', 'FX Rate To Base', 'Pay Date', 'Ex Date',
                  'Gross Amount', 'Tax', 'Action ID', 'Level Of Detail'].map(f => (
                  <span key={f} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                    <CheckCircle2 className="w-3 h-3 text-blue-500 flex-shrink-0" />
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Consejos */}
          <div className="space-y-1">
            <p className="font-semibold">Consejos</p>
            <ul className="list-disc list-inside space-y-1 text-blue-800 text-xs">
              <li>
                Añade todos los archivos antes de pulsar <strong>Generar resultado</strong>: operaciones 2025, dividendos y, si tienes posiciones abiertas desde años anteriores, también los CSVs históricos.
              </li>
              <li>
                Puedes subir el CSV de Activity Statement <em>y</em> el XML de Flex Query a la vez: los datos se fusionan y se eliminan duplicados automáticamente.
              </li>
              <li>
                Si tienes varias cuentas IBKR, sube los archivos de todas ellas.
              </li>
              <li>
                Los tipos de cambio se obtienen automáticamente del BCE. Si el BCE no cubre una fecha o divisa, se usa el tipo incrustado por IBKR.
              </li>
              <li>
                El procesamiento es <strong>completamente local</strong> — ningún dato financiero sale de tu ordenador.
              </li>
            </ul>
          </div>

          {/* Problemas comunes */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900 space-y-1">
            <p className="font-semibold">Problemas frecuentes</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                <strong>«No se encontraron operaciones»</strong>: verifica que el período de la query cubre el año 2025 completo (01/01/2025 – 31/12/2025).
              </li>
              <li>
                <strong>Tipos de cambio incorrectos</strong>: asegúrate de que el campo <em>FX Rate To Base</em> esté activado en la sección Trades.
              </li>
              <li>
                <strong>Dividendos sin retención</strong>: comprueba que has añadido la sección <em>Cash Transactions</em> con el campo <em>Type</em>.
              </li>
              <li>
                <strong>Splits / fusiones no detectados</strong>: la sección <em>Corporate Actions</em> con los campos <em>Type</em> y <em>Code</em> es obligatoria.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
