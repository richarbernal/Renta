import type { NormalizedStatement, NormalizedTrade } from '@/types/normalized'
import type { OptionsResult, OptionsTrade } from '@/types/calculations'
import { generateId, roundEur } from '@/lib/utils'
import { FISCAL_YEAR } from '@/types/tax'

interface OpenOptionLeg {
  tradeId: string
  openDate: Date
  quantity: number   // positive = long, negative = short
  costPerUnit: number // premium paid per unit (always positive)
  direction: 'long' | 'short'
  multiplier: number
}

function buildOptionKey(t: NormalizedTrade): string {
  if (!t.optionSymbol) return ''
  return t.optionSymbol.trim()
}

export function calculateOptions(stmt: NormalizedStatement): OptionsResult {
  const optionTrades = stmt.trades.filter(t => t.assetType === 'option')

  // Sort by date ascending for FIFO
  const sorted = [...optionTrades].sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime())

  // Map: optionSymbol -> open legs
  const openLegs = new Map<string, OpenOptionLeg[]>()
  const closedTrades: OptionsTrade[] = []

  for (const trade of sorted) {
    const key = buildOptionKey(trade)
    if (!key) continue

    const absQty = Math.abs(trade.quantity)
    const isShort = trade.buySell === 'sell' && trade.openClose === 'open'
    const isLong  = trade.buySell === 'buy'  && trade.openClose === 'open'
    const isClose = trade.openClose === 'close'

    // Determine premium per contract (in EUR)
    const premiumPerContract = absQty > 0
      ? Math.abs(trade.netProceedsEur) / absQty / (trade.multiplier)
      : 0

    if (isLong || isShort) {
      // Opening a new position
      const legs = openLegs.get(key) ?? []
      legs.push({
        tradeId: trade.id,
        openDate: trade.tradeDate,
        quantity: trade.quantity, // positive for long, negative for short
        costPerUnit: premiumPerContract,
        direction: isShort ? 'short' : 'long',
        multiplier: trade.multiplier,
      })
      openLegs.set(key, legs)
      continue
    }

    if (isClose) {
      // Closing an existing position — FIFO match
      const legs = openLegs.get(key)
      if (!legs || legs.length === 0) {
        // No open leg found — might be from prior year, record as standalone
        closedTrades.push(buildOrphanClose(trade))
        continue
      }

      let remaining = absQty
      while (remaining > 0 && legs.length > 0) {
        const leg = legs[0]
        const legAbsQty = Math.abs(leg.quantity)
        const matched = Math.min(remaining, legAbsQty)

        // P&L calculation
        let gainLoss = 0
        const openPremium = matched * leg.costPerUnit * leg.multiplier
        const closePremium = (matched / absQty) * Math.abs(trade.netProceedsEur)

        if (leg.direction === 'short') {
          // Short: received premium on open, paid premium on close → gain = openPremium - closePremium
          gainLoss = openPremium - closePremium
        } else {
          // Long: paid premium on open, received premium on close → gain = closePremium - openPremium
          gainLoss = closePremium - openPremium
        }

        closedTrades.push({
          id: generateId('opt'),
          tradeId: trade.id,
          symbol: trade.symbol,
          optionSymbol: key,
          optionType: trade.optionType ?? 'call',
          strike: trade.strike ?? 0,
          expiry: trade.expiry ?? new Date(FISCAL_YEAR, 11, 31),
          openDate: leg.openDate,
          closeDate: trade.tradeDate,
          closeType: 'closed',
          quantity: matched,
          multiplier: leg.multiplier,
          premiumReceivedEur: leg.direction === 'short' ? roundEur(openPremium) : roundEur(closePremium),
          premiumPaidEur: leg.direction === 'long' ? roundEur(openPremium) : roundEur(closePremium),
          closingCostEur: leg.direction === 'short' ? roundEur(closePremium) : 0,
          gainLossEur: roundEur(gainLoss),
          description: trade.description,
        })

        leg.quantity = leg.quantity > 0 ? leg.quantity - matched : leg.quantity + matched
        remaining -= matched
        if (Math.abs(leg.quantity) < 0.001) legs.shift()
      }
      if (legs.length === 0) openLegs.delete(key)
      continue
    }

    // Expiry or exercise (transactionType signals this in Flex)
    if (trade.transactionType === 'Expiry' || trade.transactionType === 'ExpirationOrExercise') {
      processExpiry(key, openLegs, closedTrades, trade)
    }
  }

  // Any options that expired at year-end (open positions with expiry <= Dec 31)
  const yearEnd = new Date(FISCAL_YEAR, 11, 31)
  for (const [key, legs] of openLegs.entries()) {
    for (const leg of legs) {
      // Find the original trade to get expiry info
      const originalTrade = sorted.find(t => t.id === leg.tradeId)
      const expiry = originalTrade?.expiry
      if (expiry && expiry <= yearEnd) {
        processExpiryLeg(key, leg, closedTrades, originalTrade)
      }
    }
  }

  // Open positions (options still open at year end)
  const openOptions: OptionsTrade[] = []
  for (const [key, legs] of openLegs.entries()) {
    for (const leg of legs) {
      const origTrade = sorted.find(t => t.id === leg.tradeId)
      if (!origTrade) continue
      openOptions.push({
        id: generateId('opt'),
        tradeId: leg.tradeId,
        symbol: origTrade.symbol,
        optionSymbol: key,
        optionType: origTrade.optionType ?? 'call',
        strike: origTrade.strike ?? 0,
        expiry: origTrade.expiry ?? new Date(FISCAL_YEAR + 1, 0, 1),
        openDate: leg.openDate,
        closeType: 'open',
        quantity: Math.abs(leg.quantity),
        multiplier: leg.multiplier,
        premiumReceivedEur: leg.direction === 'short' ? roundEur(leg.costPerUnit * Math.abs(leg.quantity) * leg.multiplier) : 0,
        premiumPaidEur: leg.direction === 'long' ? roundEur(leg.costPerUnit * Math.abs(leg.quantity) * leg.multiplier) : 0,
        closingCostEur: 0,
        gainLossEur: 0,
        description: origTrade.description,
      })
    }
  }

  const gains = closedTrades.filter(t => t.gainLossEur > 0).reduce((s, t) => s + t.gainLossEur, 0)
  const losses = closedTrades.filter(t => t.gainLossEur < 0).reduce((s, t) => s + t.gainLossEur, 0)
  const net = roundEur(gains + losses)

  return {
    trades: closedTrades,
    openPositions: openOptions,
    totalGains: roundEur(gains),
    totalLosses: roundEur(losses),
    netGainLoss: net,
    casilla1629: roundEur(gains),
    casilla1630: roundEur(Math.abs(losses)),
  }
}

function buildOrphanClose(trade: NormalizedTrade): OptionsTrade {
  return {
    id: generateId('opt'),
    tradeId: trade.id,
    symbol: trade.symbol,
    optionSymbol: trade.optionSymbol ?? trade.symbol,
    optionType: trade.optionType ?? 'call',
    strike: trade.strike ?? 0,
    expiry: trade.expiry ?? new Date(FISCAL_YEAR, 11, 31),
    openDate: trade.tradeDate,
    closeDate: trade.tradeDate,
    closeType: 'closed',
    quantity: Math.abs(trade.quantity),
    multiplier: trade.multiplier,
    premiumReceivedEur: trade.buySell === 'sell' ? roundEur(Math.abs(trade.netProceedsEur)) : 0,
    premiumPaidEur: trade.buySell === 'buy' ? roundEur(Math.abs(trade.netProceedsEur)) : 0,
    closingCostEur: 0,
    gainLossEur: roundEur(trade.netProceedsEur),
    description: trade.description + ' (apertura no encontrada)',
  }
}

function processExpiry(
  key: string,
  openLegs: Map<string, OpenOptionLeg[]>,
  closedTrades: OptionsTrade[],
  trade: NormalizedTrade
) {
  const legs = openLegs.get(key)
  if (!legs) return
  for (const leg of legs) {
    processExpiryLeg(key, leg, closedTrades, trade)
  }
  openLegs.delete(key)
}

function processExpiryLeg(
  key: string,
  leg: OpenOptionLeg,
  closedTrades: OptionsTrade[],
  trade: NormalizedTrade | undefined
) {
  const absQty = Math.abs(leg.quantity)
  const totalPremium = leg.costPerUnit * absQty * leg.multiplier
  // Short expired: full premium is a gain; Long expired: full premium is a loss
  const gainLoss = leg.direction === 'short' ? totalPremium : -totalPremium

  closedTrades.push({
    id: generateId('opt'),
    tradeId: leg.tradeId,
    symbol: trade?.symbol ?? key.split(' ')[0],
    optionSymbol: key,
    optionType: trade?.optionType ?? 'call',
    strike: trade?.strike ?? 0,
    expiry: trade?.expiry ?? new Date(FISCAL_YEAR, 11, 31),
    openDate: leg.openDate,
    closeDate: trade?.expiry ?? new Date(FISCAL_YEAR, 11, 31),
    closeType: 'expired',
    quantity: absQty,
    multiplier: leg.multiplier,
    premiumReceivedEur: leg.direction === 'short' ? roundEur(totalPremium) : 0,
    premiumPaidEur: leg.direction === 'long' ? roundEur(totalPremium) : 0,
    closingCostEur: 0,
    gainLossEur: roundEur(gainLoss),
    description: `Vencimiento de ${key}`,
  })
}
