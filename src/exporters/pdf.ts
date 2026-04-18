import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { TaxSummary } from '@/types/calculations'
import { FISCAL_YEAR } from '@/types/tax'

const EUR = (v: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(v)
const DAT = (d: Date) => d.toLocaleDateString('es-ES')
const BLUE = [37, 99, 235] as [number, number, number]
const HEADER_STYLE = { fillColor: BLUE, textColor: 255, fontSize: 8, fontStyle: 'bold' as const }
const BODY_STYLE   = { fontSize: 7.5 }

export function exportToPdf(results: TaxSummary, accountId: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // ── Cover / header ───────────────────────────────────────────────────────────
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`IBKR Renta ${FISCAL_YEAR} — Declaración IRPF`, 14, 13)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Cuenta: ${accountId}   |   Generado: ${new Date().toLocaleDateString('es-ES')}`, 14, 19)

  doc.setTextColor(0, 0, 0)
  let y = 30

  // ── 1. Resumen casillas ──────────────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumen de casillas (Modelo 100)', 14, y)
  y += 5

  autoTable(doc, {
    startY: y,
    head: [['Casilla', 'Descripción', 'Importe (€)']],
    body: results.casillaSummary.map(c => [c.casilla, c.description, EUR(c.value)]),
    foot: [['', 'ESTIMACIÓN CUOTA (base ahorro)', EUR(results.estimatedTax)]],
    headStyles: HEADER_STYLE,
    footStyles: { fillColor: [240, 249, 255], textColor: BLUE, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: BODY_STYLE,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 18 }, 2: { halign: 'right', cellWidth: 30 } },
    margin: { left: 14, right: 14 },
  })

  // ── 2. Acciones ──────────────────────────────────────────────────────────────
  doc.addPage()
  addSectionHeader(doc, `Acciones (${results.stocks.lotMatches.length} operaciones)`, 14)

  autoTable(doc, {
    startY: 28,
    head: [['Ticker','F. Compra','F. Venta','Acciones','Coste €','Ingreso €','G/P bruta €','Regla 2m','G/P neta €']],
    body: results.stocks.lotMatches.map(m => [
      m.symbol,
      DAT(m.buyDate),
      DAT(m.sellDate),
      m.quantity.toLocaleString('es-ES'),
      EUR(m.costBasisEur),
      EUR(m.proceedsEur),
      EUR(m.grossGainLoss),
      m.washSaleStatus === 'deferred' ? 'DIFERIDA' : '',
      EUR(m.netGainLoss),
    ]),
    foot: [['','','','','','','','TOTAL', EUR(results.stocks.netGainLoss)]],
    headStyles: HEADER_STYLE,
    footStyles: { fillColor: [249, 250, 251], fontStyle: 'bold', fontSize: 8 },
    bodyStyles: BODY_STYLE,
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const val = results.stocks.lotMatches[data.row.index]?.netGainLoss ?? 0
        data.cell.styles.textColor = val >= 0 ? [22, 163, 74] : [220, 38, 38]
      }
    },
    margin: { left: 14, right: 14 },
  })

  // ── 3. Opciones ──────────────────────────────────────────────────────────────
  if (results.options.trades.length > 0) {
    doc.addPage()
    addSectionHeader(doc, `Opciones (${results.options.trades.length} operaciones)`, 14)

    autoTable(doc, {
      startY: 28,
      head: [['Subyac.','Tipo','Strike','Vencim.','Contratos','F. Apertura','F. Cierre','Cierre','Prima cobr. €','Prima pag. €','G/P neta €']],
      body: results.options.trades.map(t => [
        t.symbol,
        t.optionType?.toUpperCase() ?? '',
        t.strike.toLocaleString('es-ES'),
        DAT(t.expiry),
        t.quantity.toLocaleString('es-ES'),
        DAT(t.openDate),
        t.closeDate ? DAT(t.closeDate) : '—',
        t.closeType,
        EUR(t.premiumReceivedEur),
        EUR(t.premiumPaidEur),
        EUR(t.gainLossEur),
      ]),
      foot: [['','','','','','','','','','TOTAL', EUR(results.options.netGainLoss)]],
      headStyles: HEADER_STYLE,
      footStyles: { fillColor: [249, 250, 251], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: BODY_STYLE,
      margin: { left: 14, right: 14 },
    })
  }

  // ── 4. Dividendos ────────────────────────────────────────────────────────────
  if (results.dividends.lines.length > 0) {
    doc.addPage()
    addSectionHeader(doc, `Dividendos (${results.dividends.lines.length} pagos)`, 14)

    autoTable(doc, {
      startY: 28,
      head: [['Ticker','País','Fecha pago','Divisa','Bruto orig.','Bruto €','Retención €','% ret.','Neto €']],
      body: results.dividends.lines.map(d => [
        d.symbol,
        d.country,
        DAT(d.payDate),
        d.currency,
        d.grossAmountOrig.toLocaleString('es-ES', { minimumFractionDigits: 2 }),
        EUR(d.grossAmountEur),
        EUR(d.withholdingTaxEur),
        (d.percentWithheld * 100).toFixed(1) + '%',
        EUR(d.netAmountEur),
      ]),
      foot: [['','','','','',EUR(results.dividends.totalGrossEur),EUR(results.dividends.totalWithholdingEur),'',EUR(results.dividends.totalNetEur)]],
      headStyles: HEADER_STYLE,
      footStyles: { fillColor: [249, 250, 251], fontStyle: 'bold', fontSize: 8 },
      bodyStyles: BODY_STYLE,
      margin: { left: 14, right: 14 },
    })
  }

  // ── Disclaimer ───────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(6.5)
    doc.setTextColor(150, 150, 150)
    doc.text(
      'Estimación orientativa con fines informativos. No constituye asesoramiento fiscal. Verifica con un asesor fiscal.',
      14,
      doc.internal.pageSize.getHeight() - 6
    )
    doc.text(`Página ${i} / ${pages}`, pageW - 20, doc.internal.pageSize.getHeight() - 6)
  }

  doc.save(`renta${FISCAL_YEAR}_ibkr_${accountId}.pdf`)
}

function addSectionHeader(doc: jsPDF, title: string, y: number) {
  doc.setFillColor(...BLUE)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text(title, 14, y)
  doc.setTextColor(0, 0, 0)
}
