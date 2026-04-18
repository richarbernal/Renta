export type AssetType = 'stock' | 'etf' | 'option'
export type SourceFormat = 'activity-csv' | 'flex-xml' | 'flex-csv'
export type BuySell = 'buy' | 'sell'
export type OpenClose = 'open' | 'close' | 'open-close'
export type OptionType = 'call' | 'put'

export interface NormalizedTrade {
  id: string
  source: SourceFormat
  assetType: AssetType
  symbol: string
  optionSymbol?: string
  isin?: string
  description: string
  currency: string
  tradeDate: Date
  quantity: number       // positive = buy, negative = sell
  pricePerUnit: number
  grossProceeds: number  // abs proceeds in original currency
  commission: number     // always negative
  netProceeds: number    // grossProceeds + commission (what you actually received/paid)
  eurRate: number        // EUR per 1 unit of currency (e.g. 0.93 for USD→EUR)
  netProceedsEur: number
  buySell: BuySell
  openClose: OpenClose
  // Options fields
  optionType?: OptionType
  strike?: number
  expiry?: Date
  multiplier: number     // 1 for stocks, 100 for standard options
  underlyingSymbol?: string
  transactionType?: string
  ibOrderID?: string
}

export interface NormalizedDividend {
  id: string
  source: SourceFormat
  symbol: string
  isin?: string
  description: string
  currency: string
  payDate: Date
  grossAmount: number
  grossAmountEur: number
  withholdingTax: number    // positive = amount withheld
  withholdingTaxEur: number
  country: string           // 2-letter ISO, derived from ISIN
}

export type CorporateActionType =
  | 'forward_split'
  | 'reverse_split'
  | 'cash_merger'
  | 'stock_merger'
  | 'spinoff'
  | 'symbol_change'
  | 'stock_dividend'
  | 'other'

export interface NormalizedCorporateAction {
  id: string
  source: SourceFormat
  type: CorporateActionType
  symbol: string        // symbol affected (pre-action)
  isin?: string
  date: Date
  description: string
  // Splits
  splitRatio?: number   // newShares / oldShares (>1 forward, <1 reverse)
  // Cash mergers / tender offers
  cashPerShare?: number    // in original currency
  cashCurrency?: string
  cashEurRate?: number     // EUR per 1 cashCurrency on event date
  // Stock mergers / spinoffs / symbol changes
  newSymbol?: string
  newIsin?: string
  stockExchangeRatio?: number  // new shares per old share
  // Spinoff: fraction of original cost basis that transfers to new symbol
  spinoffCostBasisFraction?: number
  // Number of shares involved (e.g. stock dividend shares added)
  quantity?: number
}

export interface NormalizedStatement {
  accountId: string
  accountAlias?: string
  fiscalYear: number
  fromDate: Date
  toDate: Date
  generatedAt: Date
  trades: NormalizedTrade[]
  dividends: NormalizedDividend[]
  corporateActions: NormalizedCorporateAction[]
  rawWarnings: string[]
  ecbRatesUsed: boolean
}
