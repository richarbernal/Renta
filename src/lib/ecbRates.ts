// Fetches and caches ECB daily reference exchange rates for a given year.
// ECB publishes rates as "units of foreign currency per 1 EUR".
// We invert them to "EUR per 1 unit of foreign currency" for easy multiplication.
//
// API docs: https://data-api.ecb.europa.eu

export type EcbRateLookup = (currency: string, date: Date) => number

// Currencies IBKR commonly reports
const CURRENCIES = 'USD+GBP+CHF+CAD+AUD+HKD+JPY+SEK+NOK+DKK+SGD+KRW+CNY+BRL+NZD+MXN+ZAR+PLN+CZK+HUF'
const ECB_BASE   = 'https://data-api.ecb.europa.eu/service/data/EXR'

// In-memory cache: year → lookup function
const ratesCache = new Map<number, EcbRateLookup>()

type RatesMap = Map<string, Map<string, number>> // date "YYYY-MM-DD" → { USD: 0.9259, GBP: 1.18, ... }

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseEcbCsv(csv: string): RatesMap {
  const map: RatesMap = new Map()
  const lines = csv.split('\n')
  for (const line of lines.slice(1)) {
    const parts = line.split(',')
    if (parts.length < 8) continue
    const currency  = parts[2]?.trim()
    const dateStr   = parts[6]?.trim()
    const rateStr   = parts[7]?.trim()
    if (!currency || !dateStr || !rateStr) continue
    const ecbRate = parseFloat(rateStr)
    if (isNaN(ecbRate) || ecbRate <= 0) continue
    if (!map.has(dateStr)) map.set(dateStr, new Map())
    // ECB rate = foreign per EUR → invert to EUR per foreign
    map.get(dateStr)!.set(currency, 1 / ecbRate)
  }
  return map
}

function buildLookup(map: RatesMap): EcbRateLookup {
  // Pre-sort dates for fast nearest-day search
  const dates = [...map.keys()].sort()

  return function lookup(currency: string, date: Date): number {
    if (currency === 'EUR') return 1

    const target = toIso(date)

    // Search backwards up to 7 days to handle weekends & bank holidays
    for (let offset = 0; offset <= 7; offset++) {
      const d = new Date(date.getTime() - offset * 86_400_000)
      const key = toIso(d)
      const dayRates = map.get(key)
      if (dayRates?.has(currency)) return dayRates.get(currency)!
    }

    // Search forward up to 3 days (e.g. dates after last available ECB date)
    for (let offset = 1; offset <= 3; offset++) {
      const d = new Date(date.getTime() + offset * 86_400_000)
      const key = toIso(d)
      const dayRates = map.get(key)
      if (dayRates?.has(currency)) return dayRates.get(currency)!
    }

    // Last resort: use most recent available date for this currency
    for (let i = dates.length - 1; i >= 0; i--) {
      const dayRates = map.get(dates[i])
      if (dayRates?.has(currency)) return dayRates.get(currency)!
    }

    // Currency not in ECB database (e.g. TWD)
    console.warn(`ECB rate not found for ${currency} on ${target}`)
    return 0 // caller must handle 0 as "unavailable"
  }
}

export async function fetchEcbRates(year: number): Promise<EcbRateLookup> {
  if (ratesCache.has(year)) return ratesCache.get(year)!

  const url =
    `${ECB_BASE}/D.${CURRENCIES}.EUR.SP00.A` +
    `?startPeriod=${year}-01-01&endPeriod=${year}-12-31` +
    `&format=csvdata&detail=dataonly`

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Error al obtener tipos de cambio del BCE (HTTP ${resp.status}). Comprueba tu conexión a internet.`)
  }

  const csv = await resp.text()
  const map = parseEcbCsv(csv)

  if (map.size === 0) {
    throw new Error('El BCE devolvió datos vacíos. Inténtalo de nuevo más tarde.')
  }

  const lookup = buildLookup(map)
  ratesCache.set(year, lookup)
  return lookup
}

// Clears the cache (useful for testing or year changes)
export function clearEcbRatesCache(): void {
  ratesCache.clear()
}
