import type { StocksResult, OptionsResult, DividendsResult, TaxSummary, TaxBracketRow } from '@/types/calculations'
import { TAX_BRACKETS_AHORRO, CASILLAS } from '@/types/tax'
import { roundEur } from '@/lib/utils'

function applyBrackets(base: number): { brackets: TaxBracketRow[]; total: number } {
  if (base <= 0) return { brackets: [], total: 0 }

  const brackets: TaxBracketRow[] = []
  let remaining = base
  let totalTax = 0

  for (const bracket of TAX_BRACKETS_AHORRO) {
    if (remaining <= 0) break
    const width = isFinite(bracket.to) ? bracket.to - bracket.from : remaining
    const taxableInBracket = Math.min(remaining, width)
    const taxInBracket = taxableInBracket * bracket.rate
    brackets.push({
      from: bracket.from,
      to: bracket.to,
      rate: bracket.rate,
      taxableAmount: roundEur(taxableInBracket),
      tax: roundEur(taxInBracket),
    })
    totalTax += taxInBracket
    remaining -= taxableInBracket
  }

  return { brackets, total: roundEur(totalTax) }
}

export function calculateTaxSummary(
  stocks: StocksResult,
  options: OptionsResult,
  dividends: DividendsResult
): TaxSummary {
  // Base del ahorro components
  const gainLossStocks  = stocks.netGainLoss
  const gainLossOptions = options.netGainLoss
  const dividendsGross  = dividends.totalGrossEur
  const totalBase = gainLossStocks + gainLossOptions + dividendsGross

  const { brackets, total: estimatedTax } = applyBrackets(Math.max(0, totalBase))

  const casillaSummary = [
    { casilla: CASILLAS.DIVIDENDOS_INTEGROS,            description: 'Dividendos y participaciones en beneficios (íntegros)', value: dividends.casilla0029 },
    { casilla: CASILLAS.DIVIDENDOS_RETENCION,           description: 'Retenciones e ingresos a cuenta sobre dividendos',       value: dividends.casilla0031 },
    { casilla: CASILLAS.GP_TRANSMISIONES_GANANCIAS,     description: 'Ganancias: transmisión de acciones cotizadas',           value: stocks.casilla1626 },
    { casilla: CASILLAS.GP_TRANSMISIONES_PERDIDAS,      description: 'Pérdidas: transmisión de acciones cotizadas',            value: stocks.casilla1627 },
    { casilla: CASILLAS.GP_OTROS_GANANCIAS,             description: 'Ganancias: opciones y otros activos financieros',        value: options.casilla1629 },
    { casilla: CASILLAS.GP_OTROS_PERDIDAS,              description: 'Pérdidas: opciones y otros activos financieros',         value: options.casilla1630 },
    { casilla: CASILLAS.DOBLE_IMPOSICION_INTERNACIONAL, description: 'Deducción doble imposición internacional (art. 80)',     value: dividends.casilla0588 },
  ]

  return {
    stocks,
    options,
    dividends,
    baseAhorro: {
      gainLossStocks: roundEur(gainLossStocks),
      gainLossOptions: roundEur(gainLossOptions),
      dividendsGross: roundEur(dividendsGross),
      total: roundEur(totalBase),
    },
    taxBrackets: brackets,
    estimatedTax,
    retencionesDividendos: dividends.casilla0031,
    dobleImposicion: dividends.casilla0588,
    casillaSummary,
  }
}
