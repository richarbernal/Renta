import type { NormalizedStatement } from '@/types/normalized'
import type { NormalizedCorporateAction } from '@/types/normalized'
import type { StocksResult, LotMatch, OpenPosition } from '@/types/calculations'
import { generateId, roundEur } from '@/lib/utils'
import { WASH_SALE_DAYS_STOCK, WASH_SALE_DAYS_IIC } from '@/types/tax'
import { KNOWN_ETF_ISINS } from '@/lib/constants'

interface Lot {
  tradeId: string
  buyDate: Date
  quantity: number
  originalQuantity: number
  costPerUnitEur: number      // negative: this is a cost
  symbol: string
  isin?: string
  description: string
  deferredBasisAdjustment: number
}

function msPerDay() { return 86_400_000 }

function washSaleWindowDays(isin?: string): number {
  if (isin && KNOWN_ETF_ISINS.has(isin)) return WASH_SALE_DAYS_IIC
  return WASH_SALE_DAYS_STOCK
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay())
}

// ── Corporate action application ─────────────────────────────────────────────

function applyForwardSplit(
  symbol: string,
  ratio: number,
  lotQueues: Map<string, Lot[]>
) {
  const queue = lotQueues.get(symbol) ?? []
  for (const lot of queue) {
    lot.quantity         = roundEur(lot.quantity * ratio)
    lot.originalQuantity = roundEur(lot.originalQuantity * ratio)
    lot.costPerUnitEur   = lot.costPerUnitEur / ratio  // total cost unchanged, more shares
  }
}

function applyReverseSplit(
  symbol: string,
  ratio: number,    // <1 for reverse, e.g. 0.1 for "1 for 10"
  lotQueues: Map<string, Lot[]>
) {
  applyForwardSplit(symbol, ratio, lotQueues)
}

function applyCashMerger(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>,
  lotMatches: LotMatch[]
) {
  const queue = lotQueues.get(ca.symbol) ?? []
  const cashPerShareEur = (ca.cashPerShare ?? 0) * (ca.cashEurRate ?? 1)

  for (const lot of queue) {
    if (lot.quantity < 0.001) continue
    const proceedsEur  = roundEur(lot.quantity * cashPerShareEur)
    const costBasisEur = roundEur(Math.abs(lot.quantity * lot.costPerUnitEur))
    const gain         = roundEur(proceedsEur - costBasisEur)

    lotMatches.push({
      id: generateId('lot'),
      sellTradeId:         ca.id,
      buyTradeId:          lot.tradeId,
      symbol:              ca.symbol,
      isin:                lot.isin,
      description:         `${lot.description} (fusión/adquisición: ${ca.description})`,
      quantity:            lot.quantity,
      costBasisEur,
      proceedsEur,
      grossGainLoss:       gain,
      buyDate:             lot.buyDate,
      sellDate:            ca.date,
      holdingDays:         daysBetween(lot.buyDate, ca.date),
      washSaleStatus:      'none',
      washSaleAdjustment:  0,
      netGainLoss:         gain,
    })
  }
  lotQueues.set(ca.symbol, [])
}

function applyStockMerger(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>
) {
  const oldQueue = lotQueues.get(ca.symbol) ?? []
  if (!ca.newSymbol || oldQueue.length === 0) return

  const ratio = ca.stockExchangeRatio ?? 1
  const newQueue = oldQueue.map(lot => ({
    ...lot,
    symbol:           ca.newSymbol!,
    isin:             ca.newIsin,
    quantity:         roundEur(lot.quantity * ratio),
    originalQuantity: roundEur(lot.originalQuantity * ratio),
    // Cost basis transfers in full; per-unit cost adjusts for ratio
    costPerUnitEur:   lot.costPerUnitEur / ratio,
    description:      `${lot.description} → ${ca.newSymbol} (fusión accionarial)`,
  }))

  lotQueues.delete(ca.symbol)
  const existing = lotQueues.get(ca.newSymbol) ?? []
  lotQueues.set(ca.newSymbol, [...existing, ...newQueue])
}

function applySpinoff(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>
) {
  if (!ca.newSymbol) return
  const queue = lotQueues.get(ca.symbol) ?? []
  if (queue.length === 0) return

  // Fraction of cost basis allocated to new symbol (default 0 if unknown → warn via description)
  const fraction = ca.spinoffCostBasisFraction ?? 0

  const newLots: Lot[] = []
  for (const lot of queue) {
    const costTransferred = lot.costPerUnitEur * fraction
    lot.costPerUnitEur  -= costTransferred  // reduce original

    const ratio = ca.stockExchangeRatio ?? 1
    newLots.push({
      tradeId:                ca.id,
      buyDate:                ca.date,
      quantity:               roundEur(lot.quantity * ratio),
      originalQuantity:       roundEur(lot.originalQuantity * ratio),
      costPerUnitEur:         ratio > 0 ? costTransferred / ratio : 0,
      symbol:                 ca.newSymbol!,
      isin:                   ca.newIsin,
      description:            `Escisión de ${ca.symbol}: ${ca.description}`,
      deferredBasisAdjustment: 0,
    })
  }

  const existing = lotQueues.get(ca.newSymbol) ?? []
  lotQueues.set(ca.newSymbol, [...existing, ...newLots])
}

function applySymbolChange(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>
) {
  if (!ca.newSymbol) return
  const queue = lotQueues.get(ca.symbol) ?? []
  const renamed = queue.map(lot => ({ ...lot, symbol: ca.newSymbol! }))
  lotQueues.delete(ca.symbol)
  const existing = lotQueues.get(ca.newSymbol) ?? []
  lotQueues.set(ca.newSymbol, [...existing, ...renamed])
}

function applyStockDividend(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>
) {
  // Stock dividend adds shares with zero cost basis (the dividend amount was already
  // taxed as dividend income). IBKR quantity field = total new shares added.
  const queue = lotQueues.get(ca.symbol) ?? []
  const qty = ca.quantity ?? 0
  if (qty > 0 && queue.length > 0) {
    // Add a zero-cost lot for the dividend shares
    queue.push({
      tradeId:                ca.id,
      buyDate:                ca.date,
      quantity:               qty,
      originalQuantity:       qty,
      costPerUnitEur:         0,
      symbol:                 ca.symbol,
      isin:                   ca.isin,
      description:            `Dividendo en acciones: ${ca.description}`,
      deferredBasisAdjustment: 0,
    })
  }
}

function dispatchCorporateAction(
  ca: NormalizedCorporateAction,
  lotQueues: Map<string, Lot[]>,
  lotMatches: LotMatch[]
) {
  switch (ca.type) {
    case 'forward_split':
      if (ca.splitRatio) applyForwardSplit(ca.symbol, ca.splitRatio, lotQueues)
      break
    case 'reverse_split':
      if (ca.splitRatio) applyReverseSplit(ca.symbol, ca.splitRatio, lotQueues)
      break
    case 'cash_merger':
      applyCashMerger(ca, lotQueues, lotMatches)
      break
    case 'stock_merger':
      applyStockMerger(ca, lotQueues)
      break
    case 'spinoff':
      applySpinoff(ca, lotQueues)
      break
    case 'symbol_change':
      applySymbolChange(ca, lotQueues)
      break
    case 'stock_dividend':
      applyStockDividend(ca, lotQueues)
      break
    default:
      // 'other': nothing to adjust automatically
      break
  }
}

// ── Main FIFO + wash sale calculator ─────────────────────────────────────────

export function calculateStocks(stmt: NormalizedStatement): StocksResult {
  const stockTrades = stmt.trades.filter(t => t.assetType === 'stock' || t.assetType === 'etf')
  const corporateActions = stmt.corporateActions.filter(
    ca => ca.type !== 'other' || ca.symbol !== ''
  )

  // Unified timeline: trades + corporate actions sorted by date
  type Event =
    | { kind: 'trade'; date: Date; data: typeof stockTrades[number] }
    | { kind: 'ca';    date: Date; data: NormalizedCorporateAction }

  const timeline: Event[] = [
    ...stockTrades.map(t => ({ kind: 'trade' as const, date: t.tradeDate, data: t })),
    ...corporateActions.map(ca => ({ kind: 'ca' as const, date: ca.date, data: ca })),
  ].sort((a, b) => {
    const diff = a.date.getTime() - b.date.getTime()
    if (diff !== 0) return diff
    // Corporate actions before same-day trades (splits happen at market open)
    if (a.kind === 'ca' && b.kind === 'trade') return -1
    if (a.kind === 'trade' && b.kind === 'ca')  return 1
    return 0
  })

  const lotQueues  = new Map<string, Lot[]>()
  const lotMatches: LotMatch[] = []

  for (const event of timeline) {
    if (event.kind === 'ca') {
      dispatchCorporateAction(event.data, lotQueues, lotMatches)
      continue
    }

    const trade = event.data
    const sym   = trade.symbol

    if (trade.buySell === 'buy') {
      const queue = lotQueues.get(sym) ?? []
      queue.push({
        tradeId:                trade.id,
        buyDate:                trade.tradeDate,
        quantity:               Math.abs(trade.quantity),
        originalQuantity:       Math.abs(trade.quantity),
        costPerUnitEur:         trade.netProceedsEur / Math.abs(trade.quantity),
        symbol:                 sym,
        isin:                   trade.isin,
        description:            trade.description,
        deferredBasisAdjustment: 0,
      })
      lotQueues.set(sym, queue)
      continue
    }

    if (trade.buySell === 'sell') {
      const queue = lotQueues.get(sym) ?? []
      let remainingQty    = Math.abs(trade.quantity)
      const totalProceeds = trade.netProceedsEur

      while (remainingQty > 0) {
        if (queue.length === 0) break

        const lot            = queue[0]
        const matched        = Math.min(remainingQty, lot.quantity)
        const portionFraction = matched / Math.abs(trade.quantity)
        const costBasisEur   = roundEur(matched * lot.costPerUnitEur + matched * lot.deferredBasisAdjustment)
        const proceedsEur    = roundEur(totalProceeds * portionFraction)
        const grossGainLoss  = roundEur(proceedsEur + costBasisEur)  // costBasisEur is negative

        lotMatches.push({
          id:                  generateId('lot'),
          sellTradeId:         trade.id,
          buyTradeId:          lot.tradeId,
          symbol:              sym,
          isin:                lot.isin,
          description:         lot.description,
          quantity:            matched,
          costBasisEur:        roundEur(Math.abs(costBasisEur)),
          proceedsEur:         roundEur(proceedsEur),
          grossGainLoss,
          buyDate:             lot.buyDate,
          sellDate:            trade.tradeDate,
          holdingDays:         daysBetween(lot.buyDate, trade.tradeDate),
          washSaleStatus:      'none',
          washSaleAdjustment:  0,
          netGainLoss:         grossGainLoss,
        })

        lot.quantity  -= matched
        remainingQty  -= matched
        if (lot.quantity < 0.001) queue.shift()
      }
      lotQueues.set(sym, queue)
    }
  }

  // ── Wash sale pass ──────────────────────────────────────────────────────────
  const allBuys = stockTrades.filter(t => t.buySell === 'buy')

  for (const match of lotMatches) {
    if (match.grossGainLoss >= 0) continue
    if (match.symbol.startsWith('__ca')) continue  // skip merger-generated matches

    const windowDays = washSaleWindowDays(match.isin)
    const windowStart = new Date(match.sellDate.getTime() - windowDays * msPerDay())
    const windowEnd   = new Date(match.sellDate.getTime() + windowDays * msPerDay())

    const triggeringBuy = allBuys.find(t =>
      t.symbol === match.symbol &&
      t.id     !== match.buyTradeId &&
      t.tradeDate >= windowStart &&
      t.tradeDate <= windowEnd
    )

    if (triggeringBuy) {
      const deferredAmount = roundEur(Math.abs(match.grossGainLoss))
      match.washSaleAdjustment      = deferredAmount
      match.netGainLoss             = roundEur(match.grossGainLoss + deferredAmount)
      match.washSaleStatus          = 'deferred'
      match.washSaleLinkedTradeId   = triggeringBuy.id

      const replacementQueue = lotQueues.get(match.symbol) ?? []
      const replacementLot   = replacementQueue.find(l => l.tradeId === triggeringBuy.id)
      if (replacementLot) {
        replacementLot.deferredBasisAdjustment += deferredAmount / replacementLot.quantity
      }
    }
  }

  // ── Open positions ──────────────────────────────────────────────────────────
  const openPositions: OpenPosition[] = []
  for (const [sym, queue] of lotQueues.entries()) {
    for (const lot of queue) {
      if (lot.quantity < 0.001) continue
      openPositions.push({
        symbol:       sym,
        isin:         lot.isin,
        description:  lot.description,
        quantity:     lot.quantity,
        costBasisEur: roundEur(Math.abs(lot.quantity * lot.costPerUnitEur)),
        assetType:    (lot.isin && KNOWN_ETF_ISINS.has(lot.isin)) ? 'etf' : 'stock',
      })
    }
  }

  // Only report sells from the fiscal year; historical sells only affect cost basis
  const fiscalMatches = lotMatches.filter(m => m.sellDate.getFullYear() === stmt.fiscalYear)

  const gains    = fiscalMatches.filter(m => m.netGainLoss > 0).reduce((s, m) => s + m.netGainLoss, 0)
  const losses   = fiscalMatches.filter(m => m.netGainLoss < 0).reduce((s, m) => s + m.netGainLoss, 0)
  const deferred = fiscalMatches.filter(m => m.washSaleStatus === 'deferred').reduce((s, m) => s + Math.abs(m.grossGainLoss), 0)

  return {
    lotMatches: fiscalMatches,
    openPositions,
    totalGains:    roundEur(gains),
    totalLosses:   roundEur(losses),
    netGainLoss:   roundEur(gains + losses),
    deferredLosses: roundEur(deferred),
    casilla1626:   roundEur(gains),
    casilla1627:   roundEur(Math.abs(losses)),
  }
}
