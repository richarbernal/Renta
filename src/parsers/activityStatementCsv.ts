import Papa from 'papaparse'
import type { IBKRRawStatement, IBKRRawTrade, IBKRRawDividend, IBKRRawWithholdingTax, IBKRRawOpenPosition, IBKRRawCorporateAction } from '@/types/ibkr'

// IBKR Activity Statement CSV: multiple logical tables in one file.
// Each section starts with: SectionName,Header,col1,col2,...
// Data rows:                 SectionName,Data,val1,val2,...
// Summary rows:              SectionName,Total,...   (skipped)

interface SectionRows {
  headers: string[]
  rows: Record<string, string>[]
}

function parseSections(csvText: string): Map<string, SectionRows> {
  const result = Papa.parse<string[]>(csvText, { header: false, skipEmptyLines: true })
  const sections = new Map<string, SectionRows>()

  for (const row of result.data) {
    if (!row || row.length < 2) continue
    const sectionName = row[0].trim()
    const rowType = row[1].trim()

    if (rowType === 'Header') {
      sections.set(sectionName, { headers: row.slice(2).map(h => h.trim()), rows: [] })
    } else if (rowType === 'Data') {
      const section = sections.get(sectionName)
      if (!section) continue
      const record: Record<string, string> = {}
      section.headers.forEach((h, i) => { record[h] = (row[i + 2] ?? '').trim() })
      section.rows.push(record)
    }
    // 'Total', 'SubTotal', 'Notes' rows are intentionally skipped
  }

  return sections
}

function num(val: string | undefined): number {
  if (!val || val === '--' || val === '') return 0
  return parseFloat(val.replace(/,/g, '')) || 0
}

function parseDateTime(val: string): string {
  // IBKR formats: "2024-03-15, 10:30:00" or "2024-03-15"
  return val.replace(',', '').trim()
}

function extractFxRate(sections: Map<string, SectionRows>): Map<string, number> {
  // FX Rates section exists in some statement types
  const fxMap = new Map<string, number>()
  fxMap.set('EUR', 1)

  const fxSection = sections.get('Base Currency Exchange Rate') ?? sections.get('Exchange Rates')
  if (fxSection) {
    for (const row of fxSection.rows) {
      const currency = row['Currency'] ?? row['To Currency']
      const rate = num(row['Exchange Rate'] ?? row['Rate'])
      if (currency && rate) fxMap.set(currency, 1 / rate) // rate is base/foreign, we want eur/foreign
    }
  }
  return fxMap
}

function parseTrades(sections: Map<string, SectionRows>): IBKRRawTrade[] {
  const section = sections.get('Trades')
  if (!section) return []

  return section.rows
    .filter(r => {
      const cat = r['Asset Category'] ?? ''
      return cat === 'Stocks' || cat === 'Equity and Index Options' || cat === 'Options'
    })
    .map(r => ({
      assetCategory: r['Asset Category'] ?? '',
      currency: r['Currency'] ?? 'USD',
      symbol: r['Symbol'] ?? '',
      description: r['Description'] ?? '',
      conid: r['Conid'] ?? r['Con ID'] ?? '',
      securityID: r['Security ID'] ?? '',
      isin: extractIsinFromDescription(r['Description'] ?? '') ?? r['ISIN'] ?? undefined,
      dateTime: parseDateTime(r['Date/Time'] ?? r['TradeDate'] ?? ''),
      quantity: num(r['Quantity']),
      tradePrice: num(r['T. Price'] ?? r['TradePrice']),
      tradeMoney: num(r['Trade Money'] ?? r['TradeMoney']),
      proceeds: num(r['Proceeds']),
      commissions: num(r['Comm/Fee'] ?? r['IBCommission'] ?? r['Commission']),
      basis: num(r['Basis']),
      realizedPnL: num(r['Realized P/L'] ?? r['FifoPnlRealized']),
      openCloseIndicator: r['Open/Close Indicator'] ?? r['Open/Close'] ?? '',
      buySell: r['Buy/Sell'] ?? '',
      ibOrderID: r['Order ID'] ?? r['IBOrderID'] ?? undefined,
      fxRateToBase: num(r['FX Rate To Base'] ?? r['FXRateToBase']) || undefined,
      multiplier: num(r['Multiplier']) || 1,
      putCall: r['Put/Call'] ?? undefined,
      strike: num(r['Strike']) || undefined,
      expiry: r['Expiry'] ?? r['Expiration'] ?? undefined,
      underlyingSymbol: r['Underlying Symbol'] ?? r['UnderlyingSymbol'] ?? undefined,
      transactionType: r['Trans. Code'] ?? r['TransactionType'] ?? undefined,
    } as IBKRRawTrade))
}

function parseDividends(sections: Map<string, SectionRows>): IBKRRawDividend[] {
  const section = sections.get('Dividends')
  if (!section) return []
  return section.rows
    .filter(r => r['Currency'] && r['Currency'] !== 'Total')
    .map(r => ({
      currency: r['Currency'] ?? 'USD',
      date: r['Date'] ?? '',
      description: r['Description'] ?? '',
      amount: num(r['Amount']),
    }))
}

function parseWithholdingTax(sections: Map<string, SectionRows>): IBKRRawWithholdingTax[] {
  const section = sections.get('Withholding Tax')
  if (!section) return []
  return section.rows
    .filter(r => r['Currency'] && r['Currency'] !== 'Total')
    .map(r => ({
      currency: r['Currency'] ?? 'USD',
      date: r['Date'] ?? '',
      description: r['Description'] ?? '',
      amount: num(r['Amount']),
      code: r['Code'] ?? undefined,
    }))
}

function parseOpenPositions(sections: Map<string, SectionRows>): IBKRRawOpenPosition[] {
  const section = sections.get('Open Positions')
  if (!section) return []
  return section.rows
    .filter(r => {
      const cat = r['Asset Category'] ?? ''
      return cat === 'Stocks' || cat === 'Equity and Index Options' || cat === 'Options'
    })
    .map(r => ({
      assetCategory: r['Asset Category'] ?? '',
      currency: r['Currency'] ?? 'USD',
      symbol: r['Symbol'] ?? '',
      description: r['Description'] ?? '',
      conid: r['Conid'] ?? r['Con ID'] ?? '',
      isin: r['ISIN'] ?? undefined,
      quantity: num(r['Quantity']),
      markPrice: num(r['Mark Price']),
      positionValue: num(r['Position Value']),
      openPrice: num(r['Open Price']),
      costBasisPrice: num(r['Cost Price']),
      costBasisMoney: num(r['Cost Basis']),
      multiplier: num(r['Multiplier']) || 1,
      putCall: r['Put/Call'] ?? undefined,
      strike: num(r['Strike']) || undefined,
      expiry: r['Expiry'] ?? r['Expiration'] ?? undefined,
      underlyingSymbol: r['Underlying Symbol'] ?? undefined,
    }))
}

function extractAccountId(sections: Map<string, SectionRows>): string {
  const info = sections.get('Statement') ?? sections.get('Account Information')
  if (info) {
    for (const row of info.rows) {
      const field = row['Field Name'] ?? row['Name'] ?? ''
      if (field.toLowerCase().includes('account')) {
        return row['Field Value'] ?? row['Value'] ?? 'UNKNOWN'
      }
    }
  }
  return 'UNKNOWN'
}

function extractDates(sections: Map<string, SectionRows>): { from: string; to: string } {
  const info = sections.get('Statement') ?? sections.get('Account Information')
  let from = ''
  let to = ''
  if (info) {
    for (const row of info.rows) {
      const field = (row['Field Name'] ?? row['Name'] ?? '').toLowerCase()
      if (field.includes('period')) {
        const period = row['Field Value'] ?? row['Value'] ?? ''
        const parts = period.split(' - ')
        if (parts.length === 2) { from = parts[0].trim(); to = parts[1].trim() }
      }
    }
  }
  return { from, to }
}

// Extracts ISIN from IBKR description patterns like "AAPL (US0378331005) Cash Dividend..."
export function extractIsinFromDescription(description: string): string | undefined {
  const match = description.match(/\(([A-Z]{2}[A-Z0-9]{9}\d)\)/)
  return match ? match[1] : undefined
}

// Extracts symbol from description like "AAPL (US0378331005) Cash Dividend..."
export function extractSymbolFromDescription(description: string): string {
  const match = description.match(/^([A-Z0-9.]+)\s*\(/)
  return match ? match[1] : description.split(' ')[0]
}

function parseCorporateActions(sections: Map<string, SectionRows>): IBKRRawCorporateAction[] {
  const section = sections.get('Corporate Actions')
  if (!section) return []
  return section.rows
    .filter(r => r['Asset Category'] && r['Asset Category'] !== 'Total')
    .map(r => ({
      assetCategory: r['Asset Category'] ?? '',
      currency: r['Currency'] ?? 'USD',
      symbol: extractSymbolFromDescription(r['Description'] ?? ''),
      isin: extractIsinFromDescription(r['Description'] ?? '') ?? undefined,
      description: r['Description'] ?? '',
      reportDate: r['Report Date'] ?? r['Date/Time'] ?? '',
      dateTime: r['Date/Time'] ?? r['Report Date'] ?? '',
      quantity: num(r['Quantity']),
      proceeds: num(r['Proceeds']),
      value: num(r['Value']),
      realizedPnL: num(r['Realized P/L'] ?? r['Realized P&L']),
      code: r['Code'] ?? '',
      typeCode: undefined,
    }))
}

export function parseActivityStatementCsv(csvText: string): IBKRRawStatement {
  const sections = parseSections(csvText)
  extractFxRate(sections) // reserved for future embedded FX rate usage
  const dates = extractDates(sections)

  return {
    accountId: extractAccountId(sections),
    fromDate: dates.from,
    toDate: dates.to,
    trades: parseTrades(sections),
    dividends: parseDividends(sections),
    withholdingTax: parseWithholdingTax(sections),
    openPositions: parseOpenPositions(sections),
    corporateActions: parseCorporateActions(sections),
  }
}
