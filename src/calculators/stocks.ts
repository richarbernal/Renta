import type { NormalizedStatement } from '@/types/normalized'
import type { StocksResult, LotMatch, OpenPosition } from '@/types/calculations'
import { generateId, roundEur } from '@/lib/utils'
import { WASH_SALE_DAYS_STOCK, WASH_SALE_DAYS_IIC } from '@/types/tax'
import { KNOWN_ETF_ISINS } from '@/lib/constants'

interface Lot {
  tradeId: string
  buyDate: Date
  quantity: number          // remaining (decremented on sale)
  originalQuantity: number
  costPerUnitEur: number    // cost per share in EUR
  symbol: string
  isin?: string
  description: string
  deferredBasisAdjustment: number // extra cost basis from wash sale deferred losses
}

function msPerDay() { return 86400000 }

function washSaleWindowDays(isin?: string): number {
  if (isin && KNOWN_ETF_ISINS.has(isin)) return WASH_SALE_DAYS_IIC
  return WASH_SALE_DAYS_STOCK
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(a.getTime() - b.getTime()) / msPerDay())
}

export function calculateStocks(stmt: NormalizedStatement): StocksResult {
  const stockTrades = stmt.trades.filter(t => t.assetType === 'stock' || t.assetType === 'etf')

  // Sort by date ascending
  const sorted = [...stockTrades].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime())

  // FIFO queues per symbol
  const lotQueues = new Map<string, Lot[]>()
  const lotMatches: LotMatch[] = []

  // Process all trades (buys build queues, sells trigger FIFO matches)
  for (const trade of sorted) {
    const sym = trade.symbol

    if (trade.buySell === 'buy') {
      const queue = lotQueues.get(sym) ?? []
      queue.push({
        tradeId: trade.id,
        buyDate: trade.tradeDate,
        quantity: Math.abs(trade.quantity),
        originalQuantity: Math.abs(trade.quantity),
        costPerUnitEur: trade.netProceedsEur / Math.abs(trade.quantity),  // negative (cost), becomes negative unit cost
        symbol: sym,
        isin: trade.isin,
        description: trade.description,
        deferredBasisAdjustment: 0,
      })
      lotQueues.set(sym, queue)
      continue
    }

    if (trade.buySell === 'sell') {
      const queue = lotQueues.get(sym) ?? []
      let remainingQty = Math.abs(trade.quantity)
      const totalProceeds = trade.netProceedsEur  // positive = received

      while (remainingQty > 0) {
        if (queue.length === 0) {
          // Short sale or missing buy data
          break
        }

        const lot = queue[0]
        const matched = Math.min(remainingQty, lot.quantity)
        const portionFraction = matched / Math.abs(trade.quantity)

        // Cost basis for this matched portion (negative * EUR/share = negative)
        const costBasisEur = roundEur(matched * lot.costPerUnitEur + matched * lot.deferredBasisAdjustment)
        // Proceeds portion
        const proceedsEur = roundEur(totalProceeds * portionFraction)
        const grossGainLoss = roundEur(proceedsEur + costBasisEur) // costBasisEur is negative

        const match: LotMatch = {
          id: generateId('lot'),
          sellTradeId: trade.id,
          buyTradeId: lot.tradeId,
          symbol: sym,
          isin: lot.isin,
          description: lot.description,
          quantity: matched,
          costBasisEur: roundEur(Math.abs(costBasisEur)),
          proceedsEur: roundEur(proceedsEur),
          grossGainLoss,
          buyDate: lot.buyDate,
          sellDate: trade.tradeDate,
          holdingDays: daysBetween(lot.buyDate, trade.tradeDate),
          washSaleStatus: 'none',
          washSaleAdjustment: 0,
          netGainLoss: grossGainLoss,
          washSaleLinkedTradeId: undefined,
        }

        lotMatches.push(match)

        lot.quantity -= matched
        remainingQty -= matched
        if (lot.quantity < 0.001) queue.shift()
      }

      lotQueues.set(sym, queue)
    }
  }

  // Wash sale pass: for each loss, check if same symbol was bought within ±N days
  for (const match of lotMatches) {
    if (match.grossGainLoss >= 0) continue // only losses trigger wash sale

    const windowDays = washSaleWindowDays(match.isin)
    const windowStart = new Date(match.sellDate.getTime() - windowDays * msPerDay())
    const windowEnd   = new Date(match.sellDate.getTime() + windowDays * msPerDay())

    // Find a buy of the same symbol within the window (excluding the original buy lot)
    const triggeringBuy = sorted.find(t =>
      t.buySell === 'buy' &&
      t.symbol === match.symbol &&
      t.id !== match.buyTradeId &&
      t.tradeDate >= windowStart &&
      t.tradeDate <= windowEnd
    )

    if (triggeringBuy) {
      const deferredAmount = roundEur(Math.abs(match.grossGainLoss))
      match.washSaleAdjustment = deferredAmount  // reverses the loss
      match.netGainLoss = roundEur(match.grossGainLoss + deferredAmount)  // = 0
      match.washSaleStatus = 'deferred'
      match.washSaleLinkedTradeId = triggeringBuy.id

      // Add deferred loss to the replacement lot's cost basis
      const sym = match.symbol
      const replacementQueue = lotQueues.get(sym) ?? []
      const replacementLot = [...replacementQueue].find(l => l.tradeId === triggeringBuy.id)
      if (replacementLot) {
        replacementLot.deferredBasisAdjustment += deferredAmount / replacementLot.quantity
      }
    }
  }

  // Build open positions from remaining lots
  const openPositions: OpenPosition[] = []
  for (const [sym, queue] of lotQueues.entries()) {
    for (const lot of queue) {
      if (lot.quantity < 0.001) continue
      openPositions.push({
        symbol: sym,
        isin: lot.isin,
        description: lot.description,
        quantity: lot.quantity,
        costBasisEur: roundEur(Math.abs(lot.quantity * lot.costPerUnitEur)),
        assetType: (lot.isin && KNOWN_ETF_ISINS.has(lot.isin)) ? 'etf' : 'stock',
      })
    }
  }

  const gains  = lotMatches.filter(m => m.netGainLoss > 0).reduce((s, m) => s + m.netGainLoss, 0)
  const losses = lotMatches.filter(m => m.netGainLoss < 0).reduce((s, m) => s + m.netGainLoss, 0)
  const deferred = lotMatches.filter(m => m.washSaleStatus === 'deferred').reduce((s, m) => s + Math.abs(m.grossGainLoss), 0)

  return {
    lotMatches,
    openPositions,
    totalGains: roundEur(gains),
    totalLosses: roundEur(losses),
    netGainLoss: roundEur(gains + losses),
    deferredLosses: roundEur(deferred),
    casilla1626: roundEur(gains),
    casilla1627: roundEur(Math.abs(losses)),
  }
}
