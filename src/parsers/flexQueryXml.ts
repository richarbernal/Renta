import { XMLParser } from 'fast-xml-parser'
import type { IBKRRawStatement, IBKRRawTrade, IBKRRawDividend, IBKRRawWithholdingTax, IBKRRawOpenPosition } from '@/types/ibkr'

function num(val: string | number | undefined): number {
  if (val === undefined || val === '' || val === null) return 0
  return parseFloat(String(val).replace(/,/g, '')) || 0
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return []
  return Array.isArray(val) ? val : [val]
}

// OCC option symbol: "AAPL  241220C00150000"
const OCC_REGEX = /^(\w+)\s+(\d{6})([CP])(\d{8})$/

function parseOccSymbol(sym: string): {
  underlying: string; expiry: string; putCall: 'C' | 'P'; strike: number
} | null {
  const m = sym.trim().replace(/\s+/, '  ').match(OCC_REGEX)
  if (!m) return null
  const [, underlying, expStr, pc, strikeStr] = m
  const year = '20' + expStr.slice(0, 2)
  const month = expStr.slice(2, 4)
  const day = expStr.slice(4, 6)
  return {
    underlying,
    expiry: `${year}-${month}-${day}`,
    putCall: pc as 'C' | 'P',
    strike: parseInt(strikeStr, 10) / 1000,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTrades(raw: any[]): IBKRRawTrade[] {
  return raw
    .filter(t => {
      const cat = String(t.assetCategory ?? '')
      return cat === 'STK' || cat === 'OPT'
    })
    .map(t => {
      const symbol = String(t.symbol ?? '')
      const parsed = t.assetCategory === 'OPT' ? parseOccSymbol(symbol) : null
      return {
        assetCategory: t.assetCategory === 'STK' ? 'Stocks' : 'Equity and Index Options',
        currency: String(t.currency ?? 'USD'),
        symbol,
        description: String(t.description ?? ''),
        conid: String(t.conid ?? ''),
        isin: t.isin ? String(t.isin) : undefined,
        dateTime: String(t.tradeDate ?? '') + ' ' + String(t.tradeTime ?? '00:00:00'),
        quantity: num(t.quantity),
        tradePrice: num(t.tradePrice),
        tradeMoney: num(t.tradeMoney),
        proceeds: num(t.proceeds),
        commissions: num(t.ibCommission ?? t.commission),
        basis: num(t.costBasis),
        realizedPnL: num(t.fifoPnlRealized ?? t.realizedPnl),
        openCloseIndicator: String(t.openCloseIndicator ?? ''),
        buySell: String(t.buySell ?? ''),
        ibOrderID: t.ibOrderID ? String(t.ibOrderID) : undefined,
        fxRateToBase: num(t.fxRateToBase) || undefined,
        multiplier: num(t.multiplier) || 1,
        putCall: parsed?.putCall ?? (t.putCall ? String(t.putCall) : undefined),
        strike: parsed?.strike ?? (num(t.strike) || undefined),
        expiry: parsed?.expiry ?? (t.expiry ? String(t.expiry) : undefined),
        underlyingSymbol: parsed?.underlying ?? (t.underlyingSymbol ? String(t.underlyingSymbol) : undefined),
        transactionType: t.transactionType ? String(t.transactionType) : undefined,
      } as IBKRRawTrade
    })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseCashTransactions(raw: any[]): { dividends: IBKRRawDividend[]; withholdingTax: IBKRRawWithholdingTax[] } {
  const dividends: IBKRRawDividend[] = []
  const withholdingTax: IBKRRawWithholdingTax[] = []

  for (const t of raw) {
    const type = String(t.type ?? '')
    const amount = num(t.amount)
    const currency = String(t.currency ?? 'USD')
    const description = String(t.description ?? '')
    const date = String(t.dateTime ?? t.date ?? '').split(' ')[0]

    if (type === 'Dividends' || type === 'Payment In Lieu of Dividends') {
      dividends.push({ currency, date, description, amount })
    } else if (type === 'Withholding Tax' || type === 'Tax') {
      withholdingTax.push({ currency, date, description, amount, code: undefined })
    }
  }

  return { dividends, withholdingTax }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseOpenPositions(raw: any[]): IBKRRawOpenPosition[] {
  return raw
    .filter(p => {
      const cat = String(p.assetCategory ?? '')
      return cat === 'STK' || cat === 'OPT'
    })
    .map(p => {
      const symbol = String(p.symbol ?? '')
      const parsed = p.assetCategory === 'OPT' ? parseOccSymbol(symbol) : null
      return {
        assetCategory: p.assetCategory === 'STK' ? 'Stocks' : 'Equity and Index Options',
        currency: String(p.currency ?? 'USD'),
        symbol,
        description: String(p.description ?? ''),
        conid: String(p.conid ?? ''),
        isin: p.isin ? String(p.isin) : undefined,
        quantity: num(p.position),
        markPrice: num(p.markPrice),
        positionValue: num(p.positionValue),
        openPrice: num(p.openPrice),
        costBasisPrice: num(p.costBasisPrice),
        costBasisMoney: num(p.costBasisMoney),
        multiplier: num(p.multiplier) || 1,
        putCall: parsed?.putCall ?? (p.putCall ? String(p.putCall) : undefined),
        strike: parsed?.strike ?? (num(p.strike) || undefined),
        expiry: parsed?.expiry ?? (p.expiry ? String(p.expiry) : undefined),
        underlyingSymbol: parsed?.underlying ?? (p.underlyingSymbol ? String(p.underlyingSymbol) : undefined),
      } as IBKRRawOpenPosition
    })
}

export function parseFlexQueryXml(xmlText: string): IBKRRawStatement {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => ['Trade', 'CashTransaction', 'OpenPosition', 'FlexStatement'].includes(name),
  })

  const doc = parser.parse(xmlText)
  const response = doc?.FlexQueryResponse ?? doc
  const statements = toArray(response?.FlexStatements?.FlexStatement)
  const stmt = statements[0] ?? {}

  const rawTrades = toArray(stmt?.Trades?.Trade)
  const rawCash = toArray(stmt?.CashTransactions?.CashTransaction)
  const rawPositions = toArray(stmt?.OpenPositions?.OpenPosition)

  const { dividends, withholdingTax } = parseCashTransactions(rawCash)

  return {
    accountId: String(stmt.accountId ?? stmt.acctAlias ?? 'UNKNOWN'),
    fromDate: String(stmt.fromDate ?? ''),
    toDate: String(stmt.toDate ?? ''),
    trades: parseTrades(rawTrades),
    dividends,
    withholdingTax,
    openPositions: parseOpenPositions(rawPositions),
  }
}
