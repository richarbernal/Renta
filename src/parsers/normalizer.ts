import type { IBKRRawStatement, IBKRRawTrade, IBKRRawDividend, IBKRRawWithholdingTax, IBKRRawCorporateAction } from '@/types/ibkr'
import type { NormalizedStatement, NormalizedTrade, NormalizedDividend, NormalizedCorporateAction, AssetType, BuySell, OpenClose, CorporateActionType } from '@/types/normalized'
import type { EcbRateLookup } from '@/lib/ecbRates'
import { generateId } from '@/lib/utils'
import { countryFromIsin } from '@/lib/constants'
import { KNOWN_ETF_ISINS } from '@/lib/constants'
import { FISCAL_YEAR } from '@/types/tax'
import { extractIsinFromDescription, extractSymbolFromDescription } from './activityStatementCsv'

// ── Date parsing ─────────────────────────────────────────────────────────────

function parseIbkrDate(val: string): Date | null {
  if (!val || val === '--') return null
  // Strip time portion: handles "2025-05-16;150000", "2025-05-16 15:00:00", "20250516;150000"
  const datePart = val.replace(',', '').trim().split(/[; T]/)[0]
  if (!datePart) return null
  // yyyyMMdd (8 digits, no separators) — IBKR XML/CSV without ISO date format
  if (/^\d{8}$/.test(datePart)) {
    return new Date(
      parseInt(datePart.slice(0, 4), 10),
      parseInt(datePart.slice(4, 6), 10) - 1,
      parseInt(datePart.slice(6, 8), 10)
    )
  }
  const d = new Date(datePart)
  return isNaN(d.getTime()) ? null : d
}

function parseExpiry(val: string | undefined): Date | undefined {
  if (!val) return undefined
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

// ── FX rate resolution ────────────────────────────────────────────────────────
// Priority: 1) ECB rate for the date  2) IBKR embedded fxRateToBase  3) 1:1 (with warning)

function resolveEurRate(
  currency: string,
  date: Date,
  fxRateToBase: number | undefined,
  ecbRates: EcbRateLookup | null,
  warnings: string[],
  context: string
): number {
  if (currency === 'EUR') return 1

  if (ecbRates) {
    const ecbRate = ecbRates(currency, date)
    if (ecbRate > 0) return ecbRate
    // ECB doesn't cover this currency — fall through to IBKR rate
    warnings.push(`Tipo BCE no disponible para ${currency} (${context}); usando tipo IBKR.`)
  }

  if (fxRateToBase && fxRateToBase > 0) return fxRateToBase

  warnings.push(`Sin tipo de cambio para ${currency} (${context}); usando 1:1. Ajusta manualmente.`)
  return 1
}

// ── Asset classification ──────────────────────────────────────────────────────

function classifyAsset(raw: IBKRRawTrade): AssetType {
  const cat = raw.assetCategory.toLowerCase()
  if (cat.includes('option') || cat === 'opt') return 'option'
  if (raw.subCategory === 'ETF') return 'etf'
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

// ── Trade normalization ───────────────────────────────────────────────────────

function normalizeTradeRow(
  raw: IBKRRawTrade,
  source: 'activity-csv' | 'flex-xml' | 'flex-csv',
  ecbRates: EcbRateLookup | null,
  warnings: string[]
): NormalizedTrade[] {
  const tradeDate = parseIbkrDate(raw.dateTime)
  if (!tradeDate) {
    warnings.push(`Operación ignorada: fecha inválida "${raw.dateTime}" para ${raw.symbol}`)
    return []
  }

  const assetType = classifyAsset(raw)
  const multiplier = raw.multiplier && raw.multiplier > 1 ? raw.multiplier : 1
  const commission = raw.commissions <= 0 ? raw.commissions : -Math.abs(raw.commissions)
  const grossProceeds = Math.abs(raw.proceeds)
  const netProceeds = raw.proceeds + commission
  const buySell = parseBuySell(raw.buySell)
  const openClose = parseOpenClose(raw.openCloseIndicator)

  const eurRate = resolveEurRate(
    raw.currency, tradeDate, raw.fxRateToBase, ecbRates, warnings,
    `${raw.symbol} ${raw.dateTime}`
  )

  const base: NormalizedTrade = {
    id: generateId('trade'),
    source,
    assetType,
    symbol: assetType === 'option' ? (raw.underlyingSymbol ?? raw.symbol.split(' ')[0]) : raw.symbol,
    optionSymbol: assetType === 'option' ? raw.symbol : undefined,
    isin: raw.isin,
    description: raw.description,
    currency: raw.currency,
    tradeDate,
    quantity: raw.quantity,
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
    const closeQty = -Math.abs(raw.quantity)
    const openQty   = Math.abs(raw.quantity)
    const halfProceeds = netProceeds / 2
    return [
      { ...base, id: generateId('trade'), openClose: 'close', quantity: closeQty, buySell: 'sell', netProceeds: halfProceeds, netProceedsEur: halfProceeds * eurRate },
      { ...base, id: generateId('trade'), openClose: 'open',  quantity: openQty,  buySell: 'buy',  netProceeds: halfProceeds, netProceedsEur: halfProceeds * eurRate },
    ]
  }

  return [base]
}

// ── Dividend normalization ────────────────────────────────────────────────────

function matchDividendsAndWithholding(
  rawDividends: IBKRRawDividend[],
  rawWithholding: IBKRRawWithholdingTax[],
  source: 'activity-csv' | 'flex-xml' | 'flex-csv',
  ecbRates: EcbRateLookup | null,
  warnings: string[]
): NormalizedDividend[] {
  const result: NormalizedDividend[] = []
  const usedWithholding = new Set<number>() // indices into rawWithholding

  for (const div of rawDividends) {
    const sym = extractSymbolFromDescription(div.description)
    const isin = extractIsinFromDescription(div.description)
    const divDate = parseIbkrDate(div.date)
    if (!divDate || div.amount <= 0) continue

    // 1) Exact description match (same description text, negative amount)
    let whIdx = rawWithholding.findIndex((w, i) =>
      !usedWithholding.has(i) &&
      w.description === div.description &&
      w.amount < 0
    )

    // 2) Fallback: same symbol + within 3 days
    if (whIdx === -1) {
      whIdx = rawWithholding.findIndex((w, i) => {
        if (usedWithholding.has(i) || w.amount >= 0) return false
        const wSym  = extractSymbolFromDescription(w.description)
        const wDate = parseIbkrDate(w.date)
        return wSym === sym && wDate && Math.abs(wDate.getTime() - divDate.getTime()) < 86_400_000 * 3
      })
    }

    const withheld = whIdx !== -1 ? Math.abs(rawWithholding[whIdx].amount) : 0
    if (whIdx !== -1) usedWithholding.add(whIdx)

    const eurRate = resolveEurRate(
      div.currency, divDate, div.fxRateToBase, ecbRates, warnings,
      `dividendo ${sym} ${div.date}`
    )

    result.push({
      id: generateId('div'),
      source,
      symbol: sym,
      isin,
      description: div.description,
      currency: div.currency,
      payDate: divDate,
      grossAmount: div.amount,
      grossAmountEur: div.amount * eurRate,
      withholdingTax: withheld,
      withholdingTaxEur: withheld * eurRate,
      country: isin ? countryFromIsin(isin) : 'Desconocido',
    })
  }

  // Warn about withholding entries that couldn't be matched to any dividend
  rawWithholding.forEach((wh, i) => {
    if (usedWithholding.has(i) || wh.amount >= 0) return
    const sym = extractSymbolFromDescription(wh.description)
    const whDate = parseIbkrDate(wh.date)
    const dateStr = whDate ? whDate.toISOString().slice(0, 10) : wh.date
    warnings.push(
      `Retención sin dividendo correspondiente: ${sym} ${dateStr} — ${Math.abs(wh.amount).toFixed(2)} ${wh.currency}. Verifica manualmente.`
    )
  })

  return result
}

// ── Corporate action normalization ────────────────────────────────────────────

// Parse split ratio from description: "AAPL(ISIN) Split 4 for 1" → 4
// "AMZN(ISIN) Split 1 for 10" → 0.1  (reverse split)
function parseSplitRatio(desc: string): number | undefined {
  const m = desc.match(/Split\s+(\d+(?:\.\d+)?)\s+for\s+(\d+(?:\.\d+)?)/i)
  if (!m) return undefined
  return parseFloat(m[1]) / parseFloat(m[2])
}

// Detect type from description + IBKR code
function detectCaType(
  desc: string,
  code: string,
  typeCode: string | undefined
): CorporateActionType {
  const d = desc.toLowerCase()
  const c = (typeCode ?? code).toUpperCase()

  if (c === 'FS' || (d.includes('split') && parseSplitRatio(desc) !== undefined && (parseSplitRatio(desc) ?? 0) > 1)) return 'forward_split'
  if (c === 'RS' || (d.includes('split') && (parseSplitRatio(desc) ?? 1) < 1)) return 'reverse_split'
  if (d.includes('split') && parseSplitRatio(desc) !== undefined) {
    return (parseSplitRatio(desc) ?? 1) >= 1 ? 'forward_split' : 'reverse_split'
  }
  if (c === 'TC' || d.includes('tender') || d.includes('acquisition') || d.includes('merger')) return 'cash_merger'
  if (c === 'TO') return 'stock_merger'
  if (c === 'SO' || d.includes('spinoff') || d.includes('spin-off')) return 'spinoff'
  if (c === 'OR' || d.includes('name change') || d.includes('symbol change') || d.includes('reorganiz')) return 'symbol_change'
  if (c === 'SD' || d.includes('stock dividend')) return 'stock_dividend'
  return 'other'
}

function normalizeCorporateAction(
  raw: IBKRRawCorporateAction,
  source: 'activity-csv' | 'flex-xml' | 'flex-csv',
  ecbRates: EcbRateLookup | null,
  warnings: string[]
): NormalizedCorporateAction | null {
  const date = parseIbkrDate(raw.dateTime) ?? parseIbkrDate(raw.reportDate)
  if (!date) {
    warnings.push(`Acción corporativa ignorada: fecha inválida para ${raw.symbol} — "${raw.description}"`)
    return null
  }

  const type = detectCaType(raw.description, raw.code, raw.typeCode)
  const splitRatio = parseSplitRatio(raw.description)

  // Cash per share for mergers: try to extract from description or use proceeds/quantity
  let cashPerShare: number | undefined
  let cashCurrency: string | undefined
  let cashEurRate: number | undefined

  if (type === 'cash_merger' && raw.proceeds !== 0 && Math.abs(raw.quantity) > 0) {
    cashPerShare = Math.abs(raw.proceeds / raw.quantity)
    cashCurrency = raw.currency
    cashEurRate = resolveEurRate(raw.currency, date, undefined, ecbRates, warnings, `fusión ${raw.symbol}`)
  } else if (type === 'cash_merger') {
    // Try extracting cash per share from description: "... at 45.00 per Share"
    const m = raw.description.match(/at\s+([\d.]+)\s+per\s+share/i)
    if (m) {
      cashPerShare = parseFloat(m[1])
      cashCurrency = raw.currency
      cashEurRate = resolveEurRate(raw.currency, date, undefined, ecbRates, warnings, `fusión ${raw.symbol}`)
    }
  }

  // New symbol for spinoffs / mergers (search after colon or in description)
  let newSymbol: string | undefined
  const spinoffMatch = raw.description.match(/Spinoff[:\s]+([A-Z0-9.]+)/i)
  if (spinoffMatch) newSymbol = spinoffMatch[1]

  return {
    id: generateId('ca'),
    source,
    type,
    symbol: raw.symbol,
    isin: raw.isin,
    date,
    description: raw.description,
    splitRatio,
    cashPerShare,
    cashCurrency,
    cashEurRate,
    newSymbol,
    quantity: raw.quantity || undefined,
  }
}

// ── Main normalizer ───────────────────────────────────────────────────────────

export function normalizeStatement(
  raw: IBKRRawStatement,
  source: 'activity-csv' | 'flex-xml' | 'flex-csv',
  ecbRates: EcbRateLookup | null = null
): NormalizedStatement {
  const warnings: string[] = []

  const trades: NormalizedTrade[] = raw.trades.flatMap(t =>
    normalizeTradeRow(t, source, ecbRates, warnings)
  )

  // Historical trades kept for multi-year FIFO and regla de los 2 meses
  const historicalCount = trades.filter(t => t.tradeDate.getFullYear() !== FISCAL_YEAR).length
  if (historicalCount > 0) {
    warnings.push(`${historicalCount} operaciones históricas cargadas para cálculo de base de coste FIFO y regla de los 2 meses.`)
  }

  const dividends = matchDividendsAndWithholding(
    raw.dividends, raw.withholdingTax, source, ecbRates, warnings
  ).filter(d => d.payDate.getFullYear() === FISCAL_YEAR)

  // Historical corporate actions kept (needed for cost basis of multi-year positions)
  const corporateActions: NormalizedCorporateAction[] = (raw.corporateActions ?? [])
    .map(ca => normalizeCorporateAction(ca, source, ecbRates, warnings))
    .filter((ca): ca is NormalizedCorporateAction => ca !== null)

  const fromDate = parseIbkrDate(raw.fromDate) ?? new Date(FISCAL_YEAR, 0, 1)
  const toDate   = parseIbkrDate(raw.toDate)   ?? new Date(FISCAL_YEAR, 11, 31)

  return {
    accountId: raw.accountId,
    fiscalYear: FISCAL_YEAR,
    fromDate,
    toDate,
    generatedAt: new Date(),
    trades,
    dividends,
    corporateActions,
    rawWarnings: warnings,
    ecbRatesUsed: ecbRates !== null,
  }
}

// ── Statement merge ───────────────────────────────────────────────────────────

export function mergeStatements(a: NormalizedStatement, b: NormalizedStatement): NormalizedStatement {
  const tradeFingerprint = (t: NormalizedTrade) =>
    `${t.symbol}_${t.tradeDate.getTime()}_${t.quantity}_${t.pricePerUnit}`

  const seenTrades = new Set(a.trades.map(tradeFingerprint))
  const uniqueBTrades = b.trades.filter(t => !seenTrades.has(tradeFingerprint(t)))

  const divFingerprint = (d: NormalizedDividend) =>
    `${d.symbol}_${d.payDate.getTime()}_${d.grossAmount}`
  const seenDivs = new Set(a.dividends.map(divFingerprint))
  const uniqueBDivs = b.dividends.filter(d => !seenDivs.has(divFingerprint(d)))

  const caFingerprint = (ca: NormalizedCorporateAction) =>
    `${ca.symbol}_${ca.date.getTime()}_${ca.type}`
  const seenCAs = new Set(a.corporateActions.map(caFingerprint))
  const uniqueBCAs = b.corporateActions.filter(ca => !seenCAs.has(caFingerprint(ca)))

  const duplicateCount =
    b.trades.length - uniqueBTrades.length +
    b.dividends.length - uniqueBDivs.length +
    b.corporateActions.length - uniqueBCAs.length

  const warnings = [...a.rawWarnings, ...b.rawWarnings]
  if (duplicateCount > 0) {
    warnings.push(`${duplicateCount} registros duplicados detectados al combinar archivos — se han ignorado.`)
  }

  return {
    ...a,
    trades: [...a.trades, ...uniqueBTrades],
    dividends: [...a.dividends, ...uniqueBDivs],
    corporateActions: [...a.corporateActions, ...uniqueBCAs],
    rawWarnings: warnings,
    ecbRatesUsed: a.ecbRatesUsed || b.ecbRatesUsed,
  }
}
