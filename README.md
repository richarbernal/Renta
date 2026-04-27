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

### 1. Exportar los informes desde IBKR

Tienes tres opciones para obtener los archivos:

**Opción A — Activity Statement (CSV)** *(más sencillo)*
1. Entra en el portal web de IBKR (Client Portal)
2. Ve a **Informes → Extractos de Actividad**
3. Selecciona periodo: **Año natural 2025**
4. Formato: **CSV**
5. Descarga el archivo

**Opción B — Flex Query (XML)** *(más completo y preciso)*
1. Ve a **Informes → Flex Queries**
2. Crea una query con las secciones: *Trades, Cash Transactions, Open Positions, Corporate Actions*
3. Activa el campo **Sub Category** en la sección Trades (necesario para identificar ETFs)
4. Selecciona formato **XML** y periodo **2025**
5. Ejecuta y descarga el archivo `.xml`

**Opción C — Flex Query CSV (operaciones + dividendos separados)**
- Crea una Flex Query con la sección *Trades* → exporta en CSV para las operaciones
- Crea otra Flex Query con la sección *Dividends* → exporta en CSV para los dividendos
- Incluye los campos: `Symbol, ISIN, Currency, FX Rate To Base, Pay Date, Gross Amount, Tax, Action ID, Level Of Detail`

> Puedes combinar libremente los tres formatos: sube todos los archivos a la vez y la aplicación fusionará los datos eliminando duplicados.

---

### 2. Cargar los archivos

La aplicación usa un modelo de **carga por lotes** para garantizar la consistencia del cálculo:

1. **Arrastra o selecciona** todos los archivos que quieres procesar (puedes añadir y quitar antes de calcular)
2. Si tienes **posiciones abiertas desde años anteriores** (compras previas a 2025), incluye también los CSVs históricos — son necesarios para el cálculo FIFO correcto y para la regla de los dos meses
3. Cuando hayas añadido todos los archivos, pulsa **Generar resultado**

> Los archivos históricos (de años anteriores al 2025) se procesan para calcular la base de coste FIFO correctamente, pero solo las operaciones cerradas en 2025 aparecen en los resultados fiscales.

---

### 3. Revisar los resultados

| Pestaña | Qué muestra |
|---|---|
| **Resumen IRPF** | Casillas para la declaración, tramos de tributación y cuota estimada |
| **Acciones** | Operaciones de compraventa con cálculo FIFO, resultado neto y pérdidas diferidas por la regla de los dos meses |
| **Opciones** | Puts y calls cerradas en 2025: primas cobradas/pagadas, vencimientos y cierres |
| **Dividendos** | Dividendos cobrados en 2025 por país con retención en origen y deducción doble imposición |
| **Avisos** | Advertencias sobre datos incompletos, tipos de cambio faltantes o registros ignorados |

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

- **Exportar Excel** — genera un `.xlsx` con hojas: Acciones, Opciones, Dividendos y Resumen IRPF
- **Exportar PDF** — genera un `.pdf` con todas las tablas y el resumen de casillas

---

## Configuración y personalización

### Año fiscal

**Archivo:** `src/types/tax.ts` — línea 1

```ts
export const FISCAL_YEAR = 2025
```

Cambia este valor si necesitas procesar otro ejercicio fiscal.
También actualiza las constantes derivadas en `src/lib/constants.ts`:

```ts
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

Los ETFs también se detectan automáticamente a través del campo `SubCategory=ETF` de los archivos Flex Query. Los ISINs de este conjunto sirven como fallback cuando el campo no está disponible.

---

## Cálculo FIFO y regla de los dos meses

El motor de cálculo aplica **FIFO estricto por símbolo** sobre el historial completo de operaciones que hayas subido. Esto significa:

- Si compraste acciones en 2023 y las vendiste en 2025, el coste de compra de 2023 se usa correctamente para el cálculo de la plusvalía 2025
- Las **pérdidas diferidas por la regla de los dos meses** (art. 33.5 LIRPF) se detectan cuando vendes a pérdida y vuelves a comprar el mismo valor dentro de los 61 días anteriores o posteriores (31 días para ETFs/IICs)
- La pérdida diferida se añade al coste del lote de recompra y se realizará cuando ese lote se venda

Para que estos cálculos sean correctos, es importante subir los archivos de todos los años en los que tuvieras posiciones abiertas.

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
│   ├── activityStatementCsv.ts  # Parser del CSV de IBKR (Activity Statement)
│   ├── flexQueryXml.ts          # Parser del XML Flex Query
│   ├── flexQueryCsv.ts          # Parser del CSV Flex Query (operaciones + dividendos)
│   ├── normalizer.ts            # Convierte datos crudos al modelo interno
│   └── index.ts                 # Detección de formato y orquestación
│
├── calculators/         # Lógica fiscal
│   ├── stocks.ts        # FIFO multi-año + regla de los dos meses
│   ├── options.ts       # P&L de opciones cerradas en el año fiscal
│   ├── dividends.ts     # Dividendos + retención + doble imposición por país
│   └── tax.ts           # Agregador: base del ahorro, tramos, cuota estimada
│
├── exporters/           # Generación de archivos descargables
│   ├── excel.ts         # Exportación a .xlsx
│   └── pdf.ts           # Exportación a .pdf (jsPDF + autotable)
│
├── components/          # Interfaz de usuario
│   ├── upload/          # Pantalla de carga (DropZone, lista de archivos, guía)
│   ├── results/         # Tablas de resultados y resumen IRPF
│   ├── export/          # Botones de exportación
│   └── layout/          # Cabecera y pie de página
│
├── store/
│   └── AppContext.tsx   # Estado global: stagedFiles + fase de procesamiento
│
└── lib/
    ├── constants.ts     ← año fiscal (re-exportado de tax.ts) y lista de ETFs conocidos
    ├── ecbRates.ts      # Obtención de tipos de cambio del BCE (caché en memoria)
    └── utils.ts         # Formateo de números, fechas y monedas
```

---

## Aviso legal

Esta herramienta tiene carácter meramente **informativo y orientativo**. Los cálculos son una estimación basada en los datos del informe de IBKR y las normas generales del IRPF.

- No constituye asesoramiento fiscal ni jurídico
- Verifica siempre los resultados con un asesor fiscal o con el borrador de la AEAT
- Los tipos y casillas pueden variar según tu comunidad autónoma, situación familiar y otras circunstancias personales
- Las pérdidas diferidas por la regla de los dos meses, los ajustes de base imponible por ejercicio de opciones y otros casos complejos pueden requerir revisión manual
