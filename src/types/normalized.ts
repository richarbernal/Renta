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

export interface NormalizedStatement {
  accountId: string
  accountAlias?: string
  fiscalYear: number
  fromDate: Date
  toDate: Date
  generatedAt: Date
  trades: NormalizedTrade[]
  dividends: NormalizedDividend[]
  rawWarnings: string[]
}
