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
  // Cap computed per country: min(withholding_paid_country, Spanish_tax_on_income_from_country)
  // Using the marginal rate of each country's income within the base del ahorro is an approximation;
  // a precise calculation would require the full base del ahorro (stocks + options + dividends).
  const dobleImposicionByCountry: Record<string, number> = {}
  let dobleImposicion = 0
  for (const [country, data] of Object.entries(byCountry)) {
    if (data.withholding <= 0) continue
    const marginalRate = marginalRateAhorro(data.gross)
    const spanishTaxOnCountry = roundEur(data.gross * marginalRate)
    const dd = roundEur(Math.min(data.withholding, spanishTaxOnCountry))
    dobleImposicionByCountry[country] = dd
    dobleImposicion += dd
  }
  dobleImposicion = roundEur(dobleImposicion)

  return {
    lines,
    totalGrossEur,
    totalWithholdingEur,
    totalNetEur,
    byCountry,
    dobleImposicion,
    dobleImposicionByCountry,
    casilla0029: totalGrossEur,
    casilla0031: totalWithholdingEur,
    casilla0588: dobleImposicion,
  }
}
