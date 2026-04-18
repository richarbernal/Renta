import type { IBKRRawStatement, IBKRRawTrade, IBKRRawDividend, IBKRRawWithholdingTax } from '@/types/ibkr'
import type { NormalizedStatement, NormalizedTrade, NormalizedDividend, AssetType, BuySell, OpenClose } from '@/types/normalized'
import { generateId } from '@/lib/utils'
import { countryFromIsin } from '@/lib/constants'
import { KNOWN_ETF_ISINS } from '@/lib/constants'
import { FISCAL_YEAR } from '@/types/tax'
import { extractIsinFromDescription, extractSymbolFromDescription } from './activityStatementCsv'

// Parse IBKR date formats: "2024-03-15", "2024-03-15 10:30:00", "2024-03-15, 10:30:00"
function parseIbkrDate(val: string): Date | null {
  if (!val || val === '--') return null
  const clean = val.replace(',', '').trim()
  const d = new Date(clean)
  return isNaN(d.getTime()) ? null : d
}

function parseExpiry(val: string | undefined): Date | undefined {
  if (!val) return undefined
  // Formats: "20241220" or "2024-12-20"
  if (/^\d{8}$/.test(val)) {
    return new Date(
      parseInt(val.slice(0, 4), 10),
      parseInt(val.slice(4, 6), 10) - 1,
      parseInt(val.slice(6, 8), 10)
    )
  }
  const d = new Date(val)
  return isNaN(d.getTime()) ? undefined : d
}

// EUR per 1 foreign currency unit. IBKR provides rate as "units of base per 1 foreign".
// If base is EUR and currency is USD with fxRateToBase=0.93, then 1 USD = 0.93 EUR.
function resolveEurRate(currency: string, fxRateToBase: number | undefined): number {
  if (currency === 'EUR') return 1
  if (fxRateToBase && fxRateToBase > 0) return fxRateToBase
  // Fallback: treat as 1:1 and emit warning
  return 1
}

function classifyAsset(raw: IBKRRawTrade): AssetType {
  const cat = raw.assetCategory.toLowerCase()
  if (cat.includes('option')) return 'option'
  const isin = raw.isin
  if (isin && KNOWN_ETF_ISINS.has(isin)) return 'etf'
  const desc = raw.description.toLowerCase()
  if (desc.includes('etf') || desc.includes('ishares') || desc.includes('vanguard') || desc.includes('xtrackers')) return 'etf'
  return 'stock'
}

function parseBuySell(val: string): BuySell {
  return val.toUpperCase().startsWith('B') ? 'buy' : 'sell'
}

function parseOpenClose(val: string): OpenClose {
  if (val === 'C;O' || val === 'O;C') return 'open-close'
  if (val.startsWith('O')) return 'open'
  return 'close'
}

function normalizeTradeRow(raw: IBKRRawTrade, warnings: string[]): NormalizedTrade[] {
  const tradeDate = parseIbkrDate(raw.dateTime)
  if (!tradeDate) {
    warnings.push(`Trade ignorado: fecha inválida "${raw.dateTime}" para ${raw.symbol}`)
    return []
  }

  const eurRate = resolveEurRate(raw.currency, raw.fxRateToBase)
  if (raw.currency !== 'EUR' && !raw.fxRateToBase) {
    warnings.push(`Sin tasa FX para ${raw.symbol} (${raw.currency}) el ${raw.dateTime}; usando 1:1`)
  }

  const qty = raw.quantity
  const assetType = classifyAsset(raw)
  const multiplier = raw.multiplier && raw.multiplier > 1 ? raw.multiplier : 1
  const commission = raw.commissions <= 0 ? raw.commissions : -Math.abs(raw.commissions)
  const grossProceeds = Math.abs(raw.proceeds)
  const netProceeds = raw.proceeds + commission
  const buySell = parseBuySell(raw.buySell)
  const openClose = parseOpenClose(raw.openCloseIndicator)

  const base: NormalizedTrade = {
    id: generateId('trade'),
    source: 'activity-csv',
    assetType,
    symbol: assetType === 'option' ? (raw.underlyingSymbol ?? raw.symbol.split(' ')[0]) : raw.symbol,
    optionSymbol: assetType === 'option' ? raw.symbol : undefined,
    isin: raw.isin,
    description: raw.description,
    currency: raw.currency,
    tradeDate,
    quantity: qty,
    pricePerUnit: raw.tradePrice,
    grossProceeds,
    commission,
    netProceeds,
    eurRate,
    netProceedsEur: netProceeds * eurRate,
    buySell,
    openClose,
    multiplier,
    optionType: raw.putCall === 'C' ? 'call' : raw.putCall === 'P' ? 'put' : undefined,
    strike: raw.strike,
    expiry: parseExpiry(raw.expiry),
    underlyingSymbol: raw.underlyingSymbol,
    transactionType: raw.transactionType,
    ibOrderID: raw.ibOrderID,
  }

  // Split "C;O" (close then open same day) into two synthetic trades
  if (openClose === 'open-close') {
    const closeQty = -Math.abs(qty)
    const openQty = Math.abs(qty)
    const halfProceeds = netProceeds / 2
    return [
      { ...base, id: generateId('trade'), openClose: 'close', quantity: closeQty, buySell: 'sell', netProceeds: halfProceeds, netProceedsEur: halfProceeds * eurRate },
      { ...base, id: generateId('trade'), openClose: 'open', quantity: openQty, buySell: 'buy', netProceeds: halfProceeds, netProceedsEur: halfProceeds * eurRate },
    ]
  }

  return [base]
}

// Match dividends + withholding tax by (symbol, date)
function matchDividendsAndWithholding(
  rawDividends: IBKRRawDividend[],
  rawWithholding: IBKRRawWithholdingTax[],
  warnings: string[]
): NormalizedDividend[] {
  const result: NormalizedDividend[] = []

  for (const div of rawDividends) {
    const sym = extractSymbolFromDescription(div.description)
    const isin = extractIsinFromDescription(div.description)
    const divDate = parseIbkrDate(div.date)
    if (!divDate || div.amount <= 0) continue

    // Find matching withholding
    const wh = rawWithholding.find(w => {
      const wSym = extractSymbolFromDescription(w.description)
      const wDate = parseIbkrDate(w.date)
      return wSym === sym && wDate && Math.abs(wDate.getTime() - divDate.getTime()) < 86400000 * 3
    })

    const withheld = wh ? Math.abs(wh.amount) : 0
    const eurRate = 1 // dividends in USD need FX — we'll flag this
    const country = isin ? countryFromIsin(isin) : 'Desconocido'

    if (div.currency !== 'EUR' && eurRate === 1) {
      warnings.push(`Dividendo de ${sym}: sin tasa EUR para ${div.currency}. Importa en moneda original.`)
    }

    result.push({
      id: generateId('div'),
      source: 'activity-csv',
      symbol: sym,
      isin,
      description: div.description,
      currency: div.currency,
      payDate: divDate,
      grossAmount: div.amount,
      grossAmountEur: div.amount * eurRate,
      withholdingTax: withheld,
      withholdingTaxEur: withheld * eurRate,
      country,
    })
  }

  // Warn about unmatched withholding
  for (const wh of rawWithholding) {
    if (wh.amount >= 0) continue
    const sym = extractSymbolFromDescription(wh.description)
    const hasDividend = rawDividends.some(d => extractSymbolFromDescription(d.description) === sym)
    if (!hasDividend) {
      warnings.push(`Retención sin dividendo correspondiente para ${sym} el ${wh.date}`)
    }
  }

  return result
}

export function normalizeStatement(
  raw: IBKRRawStatement,
  source: 'activity-csv' | 'flex-xml' | 'flex-csv'
): NormalizedStatement {
  const warnings: string[] = []

  const trades: NormalizedTrade[] = raw.trades.flatMap(t => {
    const normalized = normalizeTradeRow(t, warnings)
    return normalized.map(n => ({ ...n, source }))
  })

  // Filter only fiscal year trades
  const fiscalTrades = trades.filter(t =>
    t.tradeDate.getFullYear() === FISCAL_YEAR
  )
  const otherYearCount = trades.length - fiscalTrades.length
  if (otherYearCount > 0) {
    warnings.push(`${otherYearCount} operaciones fuera del año fiscal ${FISCAL_YEAR} fueron ignoradas.`)
  }

  const dividends = matchDividendsAndWithholding(raw.dividends, raw.withholdingTax, warnings)
    .filter(d => d.payDate.getFullYear() === FISCAL_YEAR)
    .map(d => ({ ...d, source }))

  const fromDate = parseIbkrDate(raw.fromDate) ?? new Date(FISCAL_YEAR, 0, 1)
  const toDate = parseIbkrDate(raw.toDate) ?? new Date(FISCAL_YEAR, 11, 31)

  return {
    accountId: raw.accountId,
    fiscalYear: FISCAL_YEAR,
    fromDate,
    toDate,
    generatedAt: new Date(),
    trades: fiscalTrades,
    dividends,
    rawWarnings: warnings,
  }
}

// Merge two statements (e.g. from CSV + XML for same account), deduplicating by fingerprint
export function mergeStatements(a: NormalizedStatement, b: NormalizedStatement): NormalizedStatement {
  const tradeFingerprint = (t: NormalizedTrade) =>
    `${t.symbol}_${t.tradeDate.getTime()}_${t.quantity}_${t.pricePerUnit}`

  const seenTrades = new Set(a.trades.map(tradeFingerprint))
  const uniqueBTrades = b.trades.filter(t => !seenTrades.has(tradeFingerprint(t)))

  const divFingerprint = (d: NormalizedDividend) =>
    `${d.symbol}_${d.payDate.getTime()}_${d.grossAmount}`
  const seenDivs = new Set(a.dividends.map(divFingerprint))
  const uniqueBDivs = b.dividends.filter(d => !seenDivs.has(divFingerprint(d)))

  const duplicateCount = b.trades.length - uniqueBTrades.length + b.dividends.length - uniqueBDivs.length
  const warnings = [...a.rawWarnings, ...b.rawWarnings]
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} registros duplicados detectados al combinar archivos — se han ignorado.`)
  }

  return {
    ...a,
    trades: [...a.trades, ...uniqueBTrades],
    dividends: [...a.dividends, ...uniqueBDivs],
    rawWarnings: warnings,
  }
}
