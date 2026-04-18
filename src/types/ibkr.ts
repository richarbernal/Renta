// Raw shapes parsed directly from IBKR files before normalization

export interface IBKRRawTrade {
  assetCategory: string
  currency: string
  symbol: string
  description: string
  conid: string
  securityID?: string
  isin?: string
  dateTime: string
  quantity: number
  tradePrice: number
  tradeMoney: number
  proceeds: number
  commissions: number
  basis: number
  realizedPnL: number
  openCloseIndicator: string
  buySell: string
  ibOrderID?: string
  fxRateToBase?: number
  multiplier?: number
  putCall?: string
  strike?: number
  expiry?: string
  underlyingSymbol?: string
  transactionType?: string
}

export interface IBKRRawDividend {
  currency: string
  date: string
  description: string
  amount: number
}

export interface IBKRRawWithholdingTax {
  currency: string
  date: string
  description: string
  amount: number
  code?: string
}

export interface IBKRRawOpenPosition {
  assetCategory: string
  currency: string
  symbol: string
  description: string
  conid: string
  isin?: string
  quantity: number
  markPrice: number
  positionValue: number
  openPrice: number
  costBasisPrice: number
  costBasisMoney: number
  multiplier?: number
  putCall?: string
  strike?: number
  expiry?: string
  underlyingSymbol?: string
}

export interface IBKRRawStatement {
  accountId: string
  fromDate: string
  toDate: string
  trades: IBKRRawTrade[]
  dividends: IBKRRawDividend[]
  withholdingTax: IBKRRawWithholdingTax[]
  openPositions: IBKRRawOpenPosition[]
}
