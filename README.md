# IBKR Renta 2025 — Herramienta de declaración IRPF

Aplicación web para procesar informes de **Interactive Brokers (IBKR)** y obtener automáticamente los datos necesarios para la **declaración de la renta 2025** (año fiscal 2025, campaña 2026).

> **Privacidad total:** todo el procesamiento ocurre en tu navegador. Ningún dato financiero sale de tu ordenador.

---

## Requisitos

| Herramienta | Versión mínima | Descarga |
|---|---|---|
| Node.js | 18 o superior | https://nodejs.org (descargar LTS) |
| npm | incluido con Node.js | — |
| Navegador | Chrome, Firefox, Edge o Safari modernos | — |

---

## Instalación y arranque

```bash
# 1. Clona el repositorio
git clone <url-del-repositorio>
cd Renta

# 2. Instala las dependencias
npm install

# 3. Arranca el servidor de desarrollo
npm run dev
```

Abre el navegador en **http://localhost:5173**

### Otros comandos útiles

```bash
npm run build      # Genera la versión de producción en /dist
npm run preview    # Previsualiza la build de producción localmente
npm run type-check # Comprueba errores de TypeScript sin compilar
```

---

## Uso de la aplicación

### 1. Exportar el informe desde IBKR

Tienes dos opciones para obtener el archivo:

**Opción A — Activity Statement (CSV)** *(recomendado)*
1. Entra en el portal web de IBKR (Client Portal)
2. Ve a **Informes → Extractos de Actividad**
3. Selecciona periodo: **Año natural 2025**
4. Formato: **CSV**
5. Descarga el archivo

**Opción B — Flex Query (XML)** *(más completo)*
1. Ve a **Informes → Flex Queries**
2. Crea una query con las secciones: *Trades, Cash Transactions, Open Positions*
3. Selecciona formato **XML** y periodo **2025**
4. Ejecuta y descarga el archivo `.xml`

> Puedes subir ambos archivos a la vez para combinarlos automáticamente.

---

### 2. Procesar el informe

1. Arrastra el archivo `.csv` o `.xml` a la zona de carga (o haz clic para buscarlo)
2. La aplicación detecta el formato automáticamente y procesa los datos
3. Los resultados aparecen organizados en cuatro pestañas

---

### 3. Revisar los resultados

| Pestaña | Qué muestra |
|---|---|
| **Resumen IRPF** | Casillas para la declaración, tramos de tributación y cuota estimada |
| **Acciones** | Operaciones de compraventa con cálculo FIFO, resultado neto y pérdidas diferidas por la regla de los dos meses |
| **Opciones** | Puts y calls: primas cobradas/pagadas, vencimientos y cierres |
| **Dividendos** | Dividendos cobrados por país con retención en origen y deducción doble imposición |

#### Casillas que se calculan

| Casilla | Descripción |
|---|---|
| **0029** | Dividendos y participaciones en beneficios (íntegros) |
| **0031** | Retenciones sobre dividendos |
| **0588** | Deducción por doble imposición internacional (art. 80 LIRPF) |
| **1626** | Ganancias: transmisión de acciones cotizadas |
| **1627** | Pérdidas: transmisión de acciones cotizadas |
| **1629** | Ganancias: opciones y otros activos financieros |
| **1630** | Pérdidas: opciones y otros activos financieros |

---

### 4. Exportar los resultados

Desde la barra superior de resultados:

- **Exportar Excel** — genera un `.xlsx` con cuatro hojas: Acciones, Opciones, Dividendos y Resumen IRPF
- **Exportar PDF** — genera un `.pdf` con todas las tablas y el resumen de casillas

---

## Configuración y personalización

### Año fiscal

**Archivo:** `src/types/tax.ts` — línea 1

```ts
export const FISCAL_YEAR = 2025
```

Cambia este valor si necesitas procesar otro ejercicio fiscal.
El mismo cambio hay que reflejarlo en `src/lib/constants.ts`:

```ts
export const FISCAL_YEAR = 2025
export const FISCAL_YEAR_START = new Date(2025, 0, 1)
export const FISCAL_YEAR_END   = new Date(2025, 11, 31)
```

---

### Tramos de tributación

**Archivo:** `src/types/tax.ts`

```ts
export const TAX_BRACKETS_AHORRO: TaxBracket[] = [
  { from: 0,       to: 6_000,   rate: 0.19 },
  { from: 6_000,   to: 50_000,  rate: 0.21 },
  { from: 50_000,  to: 200_000, rate: 0.23 },
  { from: 200_000, to: 300_000, rate: 0.27 },
  { from: 300_000, to: Infinity, rate: 0.28 },
]
```

Actualiza estos valores si la AEAT modifica los tramos para el ejercicio que estás declarando.

---

### Ventanas de la regla de los dos meses

**Archivo:** `src/types/tax.ts`

```ts
export const WASH_SALE_DAYS_STOCK = 61  // acciones: ±2 meses
export const WASH_SALE_DAYS_IIC   = 31  // ETFs/fondos IIC: ±1 mes
```

---

### Números de casilla

**Archivo:** `src/types/tax.ts`

```ts
export const CASILLAS = {
  DIVIDENDOS_INTEGROS:            '0029',
  DIVIDENDOS_RETENCION:           '0031',
  GP_TRANSMISIONES_GANANCIAS:     '1626',
  GP_TRANSMISIONES_PERDIDAS:      '1627',
  GP_OTROS_GANANCIAS:             '1629',
  GP_OTROS_PERDIDAS:              '1630',
  DOBLE_IMPOSICION_INTERNACIONAL: '0588',
}
```

Verifica estos números contra el modelo 100 oficial de la AEAT cada año, ya que pueden cambiar entre ejercicios.

---

### ETFs y fondos con ventana de 31 días

**Archivo:** `src/lib/constants.ts`

```ts
export const KNOWN_ETF_ISINS = new Set([
  'IE00B4L5Y983', // iShares MSCI World
  'IE00B3RBWM25', // Vanguard FTSE All-World
  // ...añade aquí los ISINs de tus ETFs
])
```

Los valores de este conjunto reciben la ventana de 31 días (1 mes) en lugar de los 61 días (2 meses) que aplican a las acciones individuales.

---

## Estructura del proyecto

```
src/
├── types/               # Modelos de datos y constantes fiscales
│   ├── tax.ts           ← año fiscal, tramos, casillas (principal punto de config)
│   ├── normalized.ts    # Modelo interno de operaciones y dividendos
│   ├── calculations.ts  # Tipos de salida de los calculadores
│   └── ibkr.ts          # Formas crudas de los informes IBKR
│
├── parsers/             # Lectura de archivos IBKR
│   ├── activityStatementCsv.ts  # Parser del CSV de IBKR
│   ├── flexQueryXml.ts          # Parser del XML Flex Query
│   ├── normalizer.ts            # Convierte datos crudos al modelo interno
│   └── index.ts                 # Detección de formato y orquestación
│
├── calculators/         # Lógica fiscal
│   ├── stocks.ts        # FIFO + regla de los dos meses
│   ├── options.ts       # P&L de opciones (primas, vencimientos, ejercicios)
│   ├── dividends.ts     # Dividendos + retención + doble imposición
│   └── tax.ts           # Agregador: base del ahorro, tramos, cuota estimada
│
├── exporters/           # Generación de archivos descargables
│   ├── excel.ts         # Exportación a .xlsx (4 hojas)
│   └── pdf.ts           # Exportación a .pdf (jsPDF + autotable)
│
├── components/          # Interfaz de usuario
│   ├── upload/          # Pantalla de carga de archivos
│   ├── results/         # Tablas de resultados y resumen IRPF
│   ├── export/          # Botones de exportación
│   └── layout/          # Cabecera y pie de página
│
├── store/
│   └── AppContext.tsx   # Estado global de la aplicación (useReducer)
│
└── lib/
    ├── constants.ts     ← año fiscal y lista de ETFs conocidos
    └── utils.ts         # Formateo de números, fechas y monedas
```

---

## Aviso legal

Esta herramienta tiene carácter meramente **informativo y orientativo**. Los cálculos son una estimación basada en los datos del informe de IBKR y las normas generales del IRPF.

- No constituye asesoramiento fiscal ni jurídico
- Verifica siempre los resultados con un asesor fiscal o con el borrador de la AEAT
- Los tipos y casillas pueden variar según tu comunidad autónoma, situación familiar y otras circunstancias personales
- Las pérdidas diferidas por la regla de los dos meses, los ajustes de base imponible por ejercicio de opciones y otros casos complejos pueden requerir revisión manual
