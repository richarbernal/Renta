export type WashSaleStatus = 'none' | 'deferred' | 'applied'
export type OptionCloseType = 'expired' | 'closed' | 'exercised' | 'assigned' | 'open'

export interface LotMatch {
  id: string
  sellTradeId: string
  buyTradeId: string
  symbol: string
  isin?: string
  description: string
  quantity: number
  costBasisEur: number       // total cost for matched quantity
  proceedsEur: number        // total proceeds for matched quantity
  grossGainLoss: number      // proceedsEur - costBasisEur
  buyDate: Date
  sellDate: Date
  holdingDays: number
  washSaleStatus: WashSaleStatus
  washSaleAdjustment: number // positive = deferred loss added back (reverses the loss)
  netGainLoss: number        // grossGainLoss + washSaleAdjustment
  washSaleLinkedTradeId?: string
}

export interface OpenPosition {
  symbol: string
  isin?: string
  description: string
  quantity: number
  costBasisEur: number
  assetType: 'stock' | 'etf'
}

export interface StocksResult {
  lotMatches: LotMatch[]
  openPositions: OpenPosition[]
  totalGains: number
  totalLosses: number        // negative number
  netGainLoss: number
  deferredLosses: number     // total losses deferred via regla 2 meses (positive)
  casilla1626: number        // ganancias: transmisión valores cotizados
  casilla1627: number        // pérdidas: transmisión valores cotizados (positive)
}

export interface OptionsTrade {
  id: string
  tradeId: string
  symbol: string
  optionSymbol: string
  optionType: 'call' | 'put'
  strike: number
  expiry: Date
  openDate: Date
  closeDate?: Date
  closeType: OptionCloseType
  quantity: number
  multiplier: number
  premiumReceivedEur: number  // credit received (positive)
  premiumPaidEur: number      // debit paid (positive)
  closingCostEur: number      // cost to close/buy back (positive)
  gainLossEur: number         // net P&L
  description: string
}

export interface OptionsResult {
  trades: OptionsTrade[]
  openPositions: OptionsTrade[]
  totalGains: number
  totalLosses: number         // negative number
  netGainLoss: number
  casilla1629: number         // ganancias: opciones
  casilla1630: number         // pérdidas: opciones (positive)
}

export interface DividendLine {
  id: string
  symbol: string
  isin?: string
  country: string
  payDate: Date
  grossAmountEur: number
  withholdingTaxEur: number
  netAmountEur: number
  percentWithheld: number
  currency: string
  grossAmountOrig: number
  withholdingOrig: number
}

export interface DividendsResult {
  lines: DividendLine[]
  totalGrossEur: number
  totalWithholdingEur: number
  totalNetEur: number
  byCountry: Record<string, { gross: number; withholding: number; count: number }>
  dobleImposicion: number
  casilla0029: number         // dividendos íntegros
  casilla0031: number         // retenciones sobre dividendos
  casilla0588: number         // deducción doble imposición internacional
}

export interface TaxBracketRow {
  from: number
  to: number
  rate: number
  taxableAmount: number
  tax: number
}

export interface TaxSummary {
  stocks: StocksResult
  options: OptionsResult
  dividends: DividendsResult
  baseAhorro: {
    gainLossStocks: number
    gainLossOptions: number
    dividendsGross: number
    total: number
  }
  taxBrackets: TaxBracketRow[]
  estimatedTax: number
  retencionesDividendos: number
  dobleImposicion: number
  casillaSummary: { casilla: string; description: string; value: number }[]
}
