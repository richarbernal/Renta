import * as XLSX from 'xlsx'
import type { TaxSummary } from '@/types/calculations'
import { FISCAL_YEAR } from '@/types/tax'

function fmtDate(d: Date): string {
  return d.toLocaleDateString('es-ES')
}

export function exportToExcel(results: TaxSummary, accountId: string): void {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Acciones ────────────────────────────────────────────────────────
  const stockRows = results.stocks.lotMatches.map(m => ({
    'Ticker':            m.symbol,
    'Descripción':       m.description,
    'F. Compra':         fmtDate(m.buyDate),
    'F. Venta':          fmtDate(m.sellDate),
    'Días':              m.holdingDays,
    'Acciones':          m.quantity,
    'Coste (€)':         m.costBasisEur,
    'Ingreso (€)':       m.proceedsEur,
    'G/P bruta (€)':     m.grossGainLoss,
    'Regla 2 meses':     m.washSaleStatus === 'deferred' ? 'DIFERIDA' : m.washSaleStatus === 'applied' ? 'Aplicada' : '',
    'Ajuste diferido (€)': m.washSaleAdjustment,
    'G/P neta (€)':      m.netGainLoss,
  }))
  const wsStocks = XLSX.utils.json_to_sheet(stockRows)
  wsStocks['!cols'] = [14,30,10,10,6,8,14,14,14,14,16,14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsStocks, 'Acciones')

  // ── Sheet 2: Opciones ────────────────────────────────────────────────────────
  const optionRows = results.options.trades.map(t => ({
    'Subyacente':       t.symbol,
    'Símbolo opción':   t.optionSymbol,
    'Tipo':             t.optionType?.toUpperCase(),
    'Strike':           t.strike,
    'Vencimiento':      fmtDate(t.expiry),
    'Contratos':        t.quantity,
    'Multiplicador':    t.multiplier,
    'F. Apertura':      fmtDate(t.openDate),
    'F. Cierre':        t.closeDate ? fmtDate(t.closeDate) : '',
    'Motivo cierre':    t.closeType,
    'Prima cobrada (€)': t.premiumReceivedEur,
    'Prima pagada (€)':  t.premiumPaidEur,
    'Coste cierre (€)':  t.closingCostEur,
    'G/P neta (€)':      t.gainLossEur,
  }))
  const wsOptions = XLSX.utils.json_to_sheet(optionRows)
  wsOptions['!cols'] = [12,24,6,8,12,8,10,10,10,12,14,14,14,14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsOptions, 'Opciones')

  // ── Sheet 3: Dividendos ──────────────────────────────────────────────────────
  const divRows = results.dividends.lines.map(d => ({
    'Ticker':             d.symbol,
    'País':               d.country,
    'ISIN':               d.isin ?? '',
    'Fecha pago':         fmtDate(d.payDate),
    'Divisa':             d.currency,
    'Bruto (orig.)':      d.grossAmountOrig,
    'Retención (orig.)':  d.withholdingOrig,
    'Bruto (€)':          d.grossAmountEur,
    'Retención (€)':      d.withholdingTaxEur,
    '% ret.':             +(d.percentWithheld * 100).toFixed(1),
    'Neto (€)':           d.netAmountEur,
  }))
  const wsDivs = XLSX.utils.json_to_sheet(divRows)
  wsDivs['!cols'] = [10,18,14,12,8,14,14,12,13,8,12].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsDivs, 'Dividendos')

  // ── Sheet 4: Resumen IRPF ────────────────────────────────────────────────────
  const summaryRows = [
    { '': '', 'Concepto': `RESUMEN IRPF ${FISCAL_YEAR} — Cuenta ${accountId}`, 'Casilla': '', 'Importe (€)': '' },
    { '': '', 'Concepto': '', 'Casilla': '', 'Importe (€)': '' },
    { '': '', 'Concepto': 'BASE DEL AHORRO', 'Casilla': '', 'Importe (€)': '' },
    ...results.casillaSummary.map(c => ({
      '': '',
      'Concepto': c.description,
      'Casilla': c.casilla,
      'Importe (€)': c.value,
    })),
    { '': '', 'Concepto': '', 'Casilla': '', 'Importe (€)': '' },
    { '': '', 'Concepto': 'ESTIMACIÓN CUOTA (solo base ahorro)', 'Casilla': '', 'Importe (€)': results.estimatedTax },
    { '': '', 'Concepto': '*** Estimación orientativa. Verifica con asesor fiscal. ***', 'Casilla': '', 'Importe (€)': '' },
  ]
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [2, 55, 8, 14].map(w => ({ wch: w }))
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen IRPF')

  XLSX.writeFile(wb, `renta${FISCAL_YEAR}_ibkr_${accountId}.xlsx`)
}
