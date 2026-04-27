import { describe, it, expect } from 'vitest'
import { calculateStocks } from '@/calculators/stocks'
import { calculateOptions } from '@/calculators/options'
import { calculateDividends } from '@/calculators/dividends'
import { calculateTaxSummary } from '@/calculators/tax'
import type { NormalizedStatement, NormalizedTrade, NormalizedDividend } from '@/types/normalized'

const BASE_STMT: NormalizedStatement = {
  accountId: 'TEST',
  fiscalYear: 2025,
  fromDate: new Date(2025, 0, 1),
  toDate: new Date(2025, 11, 31),
  generatedAt: new Date(),
  trades: [],
  dividends: [],
  corporateActions: [],
  rawWarnings: [],
  ecbRatesUsed: false,
}

function trade(overrides: Partial<NormalizedTrade> = {}): NormalizedTrade {
  return {
    id: 'T1',
    source: 'flex-csv',
    assetType: 'stock',
    symbol: 'AAPL',
    description: 'Apple Inc',
    currency: 'USD',
    tradeDate: new Date(2025, 5, 1),
    quantity: 10,
    pricePerUnit: 150,
    grossProceeds: 1500,
    commission: -5,
    netProceeds: 1495,
    eurRate: 1,
    netProceedsEur: 1495,
    buySell: 'buy',
    openClose: 'open',
    multiplier: 1,
    ...overrides,
  }
}

function dividend(overrides: Partial<NormalizedDividend> = {}): NormalizedDividend {
  return {
    id: 'D1',
    source: 'flex-csv',
    symbol: 'MSFT',
    description: 'MSFT (US5949181045) Dividendo',
    currency: 'USD',
    payDate: new Date(2025, 3, 15),
    grossAmount: 100,
    grossAmountEur: 90,
    withholdingTax: 15,
    withholdingTaxEur: 13.5,
    country: 'Estados Unidos',
    ...overrides,
  }
}

describe('Casillas smoke test', () => {
  it('computes stock casillas without NaN', () => {
    const buy = trade({ id: 'B1', quantity: 10, netProceedsEur: -1500, buySell: 'buy', openClose: 'open' })
    const sell = trade({
      id: 'S1', quantity: -10, netProceedsEur: 2000, buySell: 'sell', openClose: 'close',
      tradeDate: new Date(2025, 8, 1),
    })
    const stmt = { ...BASE_STMT, trades: [buy, sell] }
    const result = calculateStocks(stmt)

    expect(result.casilla1626).not.toBeNaN()
    expect(result.casilla1627).not.toBeNaN()
    expect(result.netGainLoss).not.toBeNaN()
    expect(result.casilla1626).toBeGreaterThan(0)   // should be a gain
    expect(result.casilla1627).toBe(0)
  })

  it('computes dividend casillas without NaN', () => {
    const stmt = { ...BASE_STMT, dividends: [dividend()] }
    const result = calculateDividends(stmt)

    expect(result.casilla0029).not.toBeNaN()
    expect(result.casilla0031).not.toBeNaN()
    expect(result.casilla0588).not.toBeNaN()
    expect(result.dobleImposicion).not.toBeNaN()
    expect(result.casilla0029).toBeGreaterThan(0)
    // doble imposición should not exceed Spanish tax on the gross
    expect(result.dobleImposicion).toBeLessThanOrEqual(result.casilla0029 * 0.28)
  })

  it('doble imposición is per-country capped', () => {
    // Switzerland: 35% withholding, Spain cap = 19%
    const swiss = dividend({
      id: 'D2', country: 'Suiza',
      grossAmountEur: 100, withholdingTaxEur: 35,
      grossAmount: 100, withholdingTax: 35,
    })
    const stmt = { ...BASE_STMT, dividends: [swiss] }
    const result = calculateDividends(stmt)

    // Swiss withholding (35) > Spanish cap (100 * 0.19 = 19), so deduction = 19
    expect(result.dobleImposicion).toBeCloseTo(19, 1)
    expect(result.casilla0588).toBeCloseTo(19, 1)
  })

  it('options outside fiscal year are excluded', () => {
    const open2024 = trade({
      id: 'O1', assetType: 'option', optionSymbol: 'AAPL  250117P00150000',
      buySell: 'sell', openClose: 'open', quantity: -1, multiplier: 100,
      netProceedsEur: 300, tradeDate: new Date(2024, 10, 1),
      optionType: 'put', strike: 150, expiry: new Date(2024, 11, 20),
    })
    const stmt = { ...BASE_STMT, trades: [open2024] }
    const result = calculateOptions(stmt)

    // Option opened and expiring in 2024 should NOT be in 2025 fiscal result
    expect(result.trades.length).toBe(0)
    expect(result.casilla1629).toBe(0)
    expect(result.casilla1630).toBe(0)
  })

  it('tax summary has no NaN values', () => {
    const buy = trade({ id: 'B1', quantity: 10, netProceedsEur: -1500, buySell: 'buy', openClose: 'open' })
    const sell = trade({
      id: 'S1', quantity: -10, netProceedsEur: 2000, buySell: 'sell', openClose: 'close',
      tradeDate: new Date(2025, 8, 1),
    })
    const stmt = { ...BASE_STMT, trades: [buy, sell], dividends: [dividend()] }

    const stocks = calculateStocks(stmt)
    const options = calculateOptions(stmt)
    const dividends = calculateDividends(stmt)
    const summary = calculateTaxSummary(stocks, options, dividends)

    expect(summary.estimatedTax).not.toBeNaN()
    expect(summary.taxAfterDeductions).not.toBeNaN()
    expect(summary.taxAfterDeductions).toBeGreaterThanOrEqual(0)
    expect(summary.taxAfterDeductions).toBeLessThanOrEqual(summary.estimatedTax)
    for (const row of summary.casillaSummary) {
      expect(row.value).not.toBeNaN()
      expect(typeof row.value).toBe('number')
    }
  })
})
