export const FISCAL_YEAR = 2024

export interface TaxBracket {
  from: number
  to: number
  rate: number
}

// Base del ahorro IRPF 2024 — art. 66 Ley 35/2006 + modificación PGE 2023
export const TAX_BRACKETS_AHORRO: TaxBracket[] = [
  { from: 0,        to: 6_000,   rate: 0.19 },
  { from: 6_000,    to: 50_000,  rate: 0.21 },
  { from: 50_000,   to: 200_000, rate: 0.23 },
  { from: 200_000,  to: 300_000, rate: 0.27 },
  { from: 300_000,  to: Infinity, rate: 0.28 },
]

// Wash sale windows
export const WASH_SALE_DAYS_STOCK = 61  // 2 months = 30+1+30 for stocks
export const WASH_SALE_DAYS_IIC   = 31  // 1 month for ETFs/IICs

// Casilla reference numbers (Modelo 100, Renta 2024)
export const CASILLAS = {
  DIVIDENDOS_INTEGROS:            '0029',
  DIVIDENDOS_RETENCION:           '0031',
  GP_TRANSMISIONES_GANANCIAS:     '1626',
  GP_TRANSMISIONES_PERDIDAS:      '1627',
  GP_OTROS_GANANCIAS:             '1629',
  GP_OTROS_PERDIDAS:              '1630',
  DOBLE_IMPOSICION_INTERNACIONAL: '0588',
} as const

export type CasillaKey = keyof typeof CASILLAS
