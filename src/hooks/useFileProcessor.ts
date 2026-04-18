import { useCallback } from 'react'
import { useAppContext } from '@/store/AppContext'
import { parseFiles, detectFormat } from '@/parsers'
import { calculateStocks } from '@/calculators/stocks'
import { calculateOptions } from '@/calculators/options'
import { calculateDividends } from '@/calculators/dividends'
import { calculateTaxSummary } from '@/calculators/tax'
import { fetchEcbRates, type EcbRateLookup } from '@/lib/ecbRates'
import { FISCAL_YEAR } from '@/types/tax'

export function useFileProcessor() {
  const { dispatch } = useAppContext()

  const processFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const loadedFiles = files.map(f => ({
      name: f.name,
      size: f.size,
      format: detectFormat(f.name, ''),
    }))
    dispatch({ type: 'FILES_ADDED', files: loadedFiles })

    // ── Step 1: Fetch ECB rates ──────────────────────────────────────────────
    dispatch({ type: 'FETCH_RATES_START' })
    let ecbRates: EcbRateLookup | null = null
    try {
      ecbRates = await fetchEcbRates(FISCAL_YEAR)
      dispatch({ type: 'FETCH_RATES_DONE', available: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Non-fatal: warn and continue without ECB rates (falls back to IBKR embedded rates)
      dispatch({ type: 'FETCH_RATES_DONE', available: false })
      console.warn('ECB rates unavailable:', msg)
    }

    // ── Step 2: Parse files ──────────────────────────────────────────────────
    dispatch({ type: 'PARSE_START' })

    try {
      dispatch({ type: 'PARSE_PROGRESS', message: `Leyendo ${files.length > 1 ? files.length + ' archivos' : files[0].name}…` })
      const statement = await parseFiles(files, ecbRates)

      dispatch({ type: 'PARSE_SUCCESS', statement })

      // ── Step 3: Calculators ──────────────────────────────────────────────
      dispatch({ type: 'PARSE_PROGRESS', message: 'Calculando acciones (FIFO + acciones corporativas)…' })
      const stocks = calculateStocks(statement)

      dispatch({ type: 'PARSE_PROGRESS', message: 'Calculando opciones…' })
      const options = calculateOptions(statement)

      dispatch({ type: 'PARSE_PROGRESS', message: 'Calculando dividendos…' })
      const dividends = calculateDividends(statement)

      dispatch({ type: 'PARSE_PROGRESS', message: 'Generando resumen fiscal…' })
      const results = calculateTaxSummary(stocks, options, dividends)

      dispatch({ type: 'CALC_SUCCESS', results })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido al procesar el archivo.'
      dispatch({ type: 'ERROR', error: msg })
    }
  }, [dispatch])

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' })
  }, [dispatch])

  return { processFiles, reset }
}
