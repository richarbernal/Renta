import { createContext, useContext, useReducer, type ReactNode } from 'react'
import type { NormalizedStatement } from '@/types/normalized'
import type { TaxSummary } from '@/types/calculations'

export type AppPhase = 'idle' | 'fetching-rates' | 'parsing' | 'calculating' | 'ready' | 'error'

export interface LoadedFile {
  name: string
  size: number
  format: string
}

export interface AppState {
  phase: AppPhase
  files: LoadedFile[]
  statement: NormalizedStatement | null
  results: TaxSummary | null
  errors: string[]
  warnings: string[]
  parseProgress: string
  ecbRatesAvailable: boolean
}

type AppAction =
  | { type: 'FILES_ADDED'; files: LoadedFile[] }
  | { type: 'FETCH_RATES_START' }
  | { type: 'FETCH_RATES_DONE'; available: boolean }
  | { type: 'PARSE_START' }
  | { type: 'PARSE_PROGRESS'; message: string }
  | { type: 'PARSE_SUCCESS'; statement: NormalizedStatement }
  | { type: 'CALC_SUCCESS'; results: TaxSummary }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }

const initialState: AppState = {
  phase: 'idle',
  files: [],
  statement: null,
  results: null,
  errors: [],
  warnings: [],
  parseProgress: '',
  ecbRatesAvailable: false,
}

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'FILES_ADDED':
      return { ...state, files: action.files, errors: [] }
    case 'FETCH_RATES_START':
      return { ...state, phase: 'fetching-rates', parseProgress: 'Obteniendo tipos de cambio del BCE…' }
    case 'FETCH_RATES_DONE':
      return { ...state, ecbRatesAvailable: action.available }
    case 'PARSE_START':
      return { ...state, phase: 'parsing', errors: [], warnings: [], parseProgress: 'Leyendo archivo…' }
    case 'PARSE_PROGRESS':
      return { ...state, parseProgress: action.message }
    case 'PARSE_SUCCESS':
      return {
        ...state,
        phase: 'calculating',
        statement: action.statement,
        warnings: action.statement.rawWarnings,
        parseProgress: 'Calculando…',
      }
    case 'CALC_SUCCESS':
      return { ...state, phase: 'ready', results: action.results, parseProgress: '' }
    case 'ERROR':
      return { ...state, phase: 'error', errors: [action.error], parseProgress: '' }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>
}

export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
