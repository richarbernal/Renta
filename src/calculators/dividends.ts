import type { NormalizedStatement } from '@/types/normalized'
import type { DividendsResult, DividendLine } from '@/types/calculations'
import { generateId, roundEur } from '@/lib/utils'
import { TAX_BRACKETS_AHORRO } from '@/types/tax'

// Marginal rate on base del ahorro for computing the deduction cap
function marginalRateAhorro(totalBase: number): number {
  let remaining = totalBase
  for (const bracket of TAX_BRACKETS_AHORRO) {
    const width = isFinite(bracket.to) ? bracket.to - bracket.from : remaining
    if (remaining <= width) return bracket.rate
    remaining -= width
  }
  return TAX_BRACKETS_AHORRO[TAX_BRACKETS_AHORRO.length - 1].rate
}

export function calculateDividends(stmt: NormalizedStatement): DividendsResult {
  const lines: DividendLine[] = stmt.dividends.map(d => {
    const netAmountEur = roundEur(d.grossAmountEur - d.withholdingTaxEur)
    const percentWithheld = d.grossAmountEur > 0 ? d.withholdingTaxEur / d.grossAmountEur : 0
    return {
      id: d.id ?? generateId('dline'),
      symbol: d.symbol,
      isin: d.isin,
      country: d.country,
      payDate: d.payDate,
      grossAmountEur: roundEur(d.grossAmountEur),
      withholdingTaxEur: roundEur(d.withholdingTaxEur),
      netAmountEur,
      percentWithheld,
      currency: d.currency,
      grossAmountOrig: d.grossAmount,
      withholdingOrig: d.withholdingTax,
    }
  })

  const totalGrossEur = roundEur(lines.reduce((s, l) => s + l.grossAmountEur, 0))
  const totalWithholdingEur = roundEur(lines.reduce((s, l) => s + l.withholdingTaxEur, 0))
  const totalNetEur = roundEur(totalGrossEur - totalWithholdingEur)

  // Group by country for deducción doble imposición breakdown
  const byCountry: DividendsResult['byCountry'] = {}
  for (const line of lines) {
    const key = line.country
    if (!byCountry[key]) byCountry[key] = { gross: 0, withholding: 0, count: 0 }
    byCountry[key].gross += line.grossAmountEur
    byCountry[key].withholding += line.withholdingTaxEur
    byCountry[key].count += 1
  }

  // Deducción por doble imposición internacional — Art. 80 LIRPF
  // Limit: min(foreign tax paid, Spanish tax that would apply on that income)
  // Spanish marginal rate estimated on dividends alone (conservative approach)
  const marginalRate = marginalRateAhorro(totalGrossEur)
  const spanishTaxOnDividends = roundEur(totalGrossEur * marginalRate)
  const dobleImposicion = roundEur(Math.min(totalWithholdingEur, spanishTaxOnDividends))

  return {
    lines,
    totalGrossEur,
    totalWithholdingEur,
    totalNetEur,
    byCountry,
    dobleImposicion,
    casilla0029: totalGrossEur,
    casilla0031: totalWithholdingEur,
    casilla0588: dobleImposicion,
  }
}
