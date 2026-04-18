export const FISCAL_YEAR = 2025
export const FISCAL_YEAR_START = new Date(2025, 0, 1)
export const FISCAL_YEAR_END = new Date(2025, 11, 31)

// Countries that typically appear in IBKR dividend descriptions
// Maps first 2 chars of ISIN to country name
export const ISIN_COUNTRY_MAP: Record<string, string> = {
  US: 'Estados Unidos',
  GB: 'Reino Unido',
  DE: 'Alemania',
  FR: 'Francia',
  NL: 'Países Bajos',
  IE: 'Irlanda',
  CH: 'Suiza',
  ES: 'España',
  IT: 'Italia',
  SE: 'Suecia',
  NO: 'Noruega',
  DK: 'Dinamarca',
  FI: 'Finlandia',
  BE: 'Bélgica',
  AT: 'Austria',
  LU: 'Luxemburgo',
  PT: 'Portugal',
  JP: 'Japón',
  CA: 'Canadá',
  AU: 'Australia',
  HK: 'Hong Kong',
  SG: 'Singapur',
  KR: 'Corea del Sur',
  TW: 'Taiwán',
  CN: 'China',
  BR: 'Brasil',
}

export function countryFromIsin(isin?: string): string {
  if (!isin || isin.length < 2) return 'Desconocido'
  return ISIN_COUNTRY_MAP[isin.slice(0, 2).toUpperCase()] ?? isin.slice(0, 2).toUpperCase()
}

// Well-known ETF ISINs to apply 31-day wash sale window instead of 61 days
// In practice users can add their own
export const KNOWN_ETF_ISINS = new Set([
  'IE00B4L5Y983', // iShares MSCI World
  'IE00B3RBWM25', // Vanguard FTSE All-World
  'IE00B5BMR087', // iShares S&P 500
  'LU0274208692', // Xtrackers S&P 500
  'IE00BKX55T58', // Vanguard US 500 Stock
  'IE00B52MJY50', // iShares MSCI EM
])
