import type { NormalizedStatement } from '@/types/normalized'
import { parseActivityStatementCsv } from './activityStatementCsv'
import { parseFlexQueryXml } from './flexQueryXml'
import { normalizeStatement, mergeStatements } from './normalizer'

export type DetectedFormat = 'activity-csv' | 'flex-xml' | 'flex-csv' | 'unknown'

export function detectFormat(filename: string, firstChunk: string): DetectedFormat {
  const lower = filename.toLowerCase()

  if (lower.endsWith('.xml')) return 'flex-xml'

  if (lower.endsWith('.csv')) {
    const firstLines = firstChunk.slice(0, 2000)
    // Flex Query CSV typically starts with a header containing TradeDate or FlexStatement
    if (firstLines.includes('FlexStatement') || firstLines.match(/TradeDate.*Symbol.*Currency/)) {
      return 'flex-csv'
    }
    // Activity Statement CSV has section-named rows like "Trades,Header,..."
    if (firstLines.match(/^(Statement|Trades|Dividends|Account Information),/m)) {
      return 'activity-csv'
    }
    return 'activity-csv' // default
  }

  if (firstChunk.trimStart().startsWith('<')) return 'flex-xml'

  return 'unknown'
}

export async function parseFile(file: File): Promise<NormalizedStatement> {
  const text = await file.text()
  const format = detectFormat(file.name, text)

  if (format === 'flex-xml') {
    const raw = parseFlexQueryXml(text)
    return normalizeStatement(raw, 'flex-xml')
  }

  if (format === 'activity-csv') {
    const raw = parseActivityStatementCsv(text)
    return normalizeStatement(raw, 'activity-csv')
  }

  throw new Error(
    `Formato de archivo no reconocido: "${file.name}". ` +
    `Exporta un Activity Statement (CSV) o un Flex Query (XML) desde IBKR.`
  )
}

export async function parseFiles(files: File[]): Promise<NormalizedStatement> {
  if (files.length === 0) throw new Error('No se han proporcionado archivos.')

  const statements = await Promise.all(files.map(parseFile))

  return statements.reduce((acc, stmt) => mergeStatements(acc, stmt))
}
