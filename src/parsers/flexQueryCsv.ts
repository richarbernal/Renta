import Papa from 'papaparse'
import type { IBKRRawStatement, IBKRRawTrade, IBKRRawDividend, IBKRRawWithholdingTax, IBKRRawCorporateAction } from '@/types/ibkr'
import { extractIsinFromDescription } from './activityStatementCsv'

// Flat single-header Flex Query CSV export from IBKR.
// All sections (Trades, Cash Transactions, Corporate Actions) share the same header row.
// Row type is determined by the AssetClass and Type fields.

function num(val: string | undefined): number {
  if (!val || val === '--' || val === '') return 0
  return parseFloat(val.replace(/,/g, '')) || 0
}

function str(val: string | undefined): string {
  return (val ?? '').trim()
}

export function parseFlexQueryCsv(csvText: string): IBKRRawStatement {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  })

  const trades: IBKRRawTrade[] = []
  const dividends: IBKRRawDividend[] = []
  const withholdingTax: IBKRRawWithholdingTax[] = []
  const corporateActions: IBKRRawCorporateAction[] = []

  for (const row of result.data) {
    const assetClass = str(row['AssetClass'] ?? row['Asset Category'])
    const txType = str(row['Type'])            // Cash Transactions: "Dividends", "Withholding Tax"
    const levelOfDetail = str(row['LevelOfDetail'])

    // Skip summary/subtotal rows
    if (levelOfDetail === 'SUMMARY' || levelOfDetail === 'SUBTOTAL') continue

    // ── Trades (STK / OPT) ───────────────────────────────────────────────────
    if (assetClass === 'STK' || assetClass === 'OPT') {
      // DateTime field: "2025-05-16;150000" — keep as-is; normalizer parses it
      const dateTime = str(row['DateTime'] ?? row['TradeDate'])
      const isin = str(row['ISIN']) || extractIsinFromDescription(str(row['Description'])) || undefined

      trades.push({
        assetCategory: assetClass === 'OPT' ? 'Equity and Index Options' : 'Stocks',
        currency: str(row['CurrencyPrimary'] ?? row['Currency']) || 'USD',
        symbol: str(row['Symbol']),
        description: str(row['Description']),
        conid: str(row['Conid']),
        isin,
        dateTime,
        quantity: num(row['Quantity']),
        tradePrice: num(row['TradePrice']),
        tradeMoney: num(row['TradeMoney']),
        proceeds: num(row['Proceeds']),
        commissions: num(row['IBCommission']),
        basis: num(row['CostBasis']),
        realizedPnL: num(row['FifoPnlRealized']),
        openCloseIndicator: str(row['Open/CloseIndicator']),
        buySell: str(row['Buy/Sell']),
        ibOrderID: str(row['IBOrderID'] ?? row['OrigOrderID']) || undefined,
        fxRateToBase: num(row['FXRateToBase']) || undefined,
        multiplier: num(row['Multiplier']) || 1,
        putCall: str(row['Put/Call']) || undefined,
        strike: num(row['Strike']) || undefined,
        expiry: str(row['Expiry'] ?? row['Expiration']) || undefined,
        underlyingSymbol: str(row['UnderlyingSymbol']) || undefined,
        transactionType: str(row['TransactionType']) || undefined,
        subCategory: str(row['SubCategory']) || undefined,
      })
      continue
    }

    // ── Cash Transactions (dividends / withholding) ──────────────────────────
    if (txType === 'Dividends' || txType === 'Payment In Lieu of Dividends') {
      dividends.push({
        currency: str(row['CurrencyPrimary'] ?? row['Currency']) || 'USD',
        date: str(row['DateTime'] ?? row['SettleDate'] ?? row['Date']),
        description: str(row['Description']),
        amount: num(row['Amount']),
      })
      continue
    }

    if (txType === 'Withholding Tax' || txType === 'Tax') {
      withholdingTax.push({
        currency: str(row['CurrencyPrimary'] ?? row['Currency']) || 'USD',
        date: str(row['DateTime'] ?? row['SettleDate'] ?? row['Date']),
        description: str(row['Description']),
        amount: num(row['Amount']),
        code: str(row['Code']) || undefined,
      })
      continue
    }

    // ── Corporate Actions ────────────────────────────────────────────────────
    if (assetClass && assetClass !== '' && str(row['Code']) !== '' && str(row['ReportDate']) !== '') {
      corporateActions.push({
        assetCategory: assetClass,
        currency: str(row['CurrencyPrimary'] ?? row['Currency']) || 'USD',
        symbol: str(row['Symbol']),
        isin: str(row['ISIN']) || undefined,
        description: str(row['Description']),
        reportDate: str(row['ReportDate']),
        dateTime: str(row['DateTime'] ?? row['ReportDate']),
        quantity: num(row['Quantity']),
        proceeds: num(row['Proceeds']),
        value: num(row['Value']),
        realizedPnL: num(row['FifoPnlRealized']),
        code: str(row['Code']),
        typeCode: undefined,
      })
    }
  }

  return {
    accountId: 'UNKNOWN',
    fromDate: '',
    toDate: '',
    trades,
    dividends,
    withholdingTax,
    openPositions: [],
    corporateActions,
  }
}
