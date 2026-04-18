import { FileSpreadsheet } from 'lucide-react'
import { FISCAL_YEAR } from '@/types/tax'

export function Header() {
  return (
    <header className="border-b bg-white sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-lg">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">IBKR Renta {FISCAL_YEAR}</h1>
            <p className="text-xs text-gray-500">Declaración IRPF {FISCAL_YEAR}/{FISCAL_YEAR + 1}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-medium px-2.5 py-1 rounded-full border border-green-200">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            100% local — sin envío de datos
          </span>
        </div>
      </div>
    </header>
  )
}
