# Plan de mejoras — IBKR Renta 2025

Plan de implementación para que un modelo de desarrollo lo ejecute paso a paso. Cada tarea incluye **fichero(s)**, **patrón de cambio** y **criterio de aceptación**. Las tareas están ordenadas por prioridad.

---

## Contexto del proyecto

App React 18 + TS + Vite que procesa informes IBKR (Activity Statement CSV / Flex XML / Flex CSV operaciones / Flex CSV dividendos) y produce las casillas de la **declaración IRPF 2025** (campaña primavera 2026). Procesamiento 100% en navegador.

Cambios arquitectónicos recientes que el modelo debe asumir:
- El normalizador (`src/parsers/normalizer.ts`) **ya no filtra por año fiscal** — todas las operaciones históricas pasan a los calculadores para FIFO multi-año y regla de los 2 meses.
- Solo el calculador de acciones (`src/calculators/stocks.ts`) filtra `lotMatches` al año fiscal (línea ~363).
- UI nueva: el usuario sube varios ficheros (puede borrarlos), y pulsa **"Generar resultado"** para procesar todo a la vez.
- Existe un parser de CSV plano de Flex Query (`src/parsers/flexQueryCsv.ts`) con dos funciones: `parseFlexQueryCsv` (operaciones) y `parseFlexDividendCsv` (dividendos, agrupa por `ActionID` y neutraliza `Po` / `Re`).

---

## P0 — BUGS CRÍTICOS

### Tarea 1 — Filtrar opciones al año fiscal

**Problema.** `src/calculators/options.ts` agrega a `closedTrades` operaciones de cualquier año (igual que pasaba antes con `stocks.ts`). Esto contamina las casillas 1629 / 1630 con cierres de años anteriores.

**Ficheros y líneas.**
- `src/calculators/options.ts` — líneas 161-173 (cómputo final)
- `src/calculators/options.ts` — líneas 122-132 (gestión de vencimientos en `yearEnd`)

**Cambios.**

1. Después del bucle principal y del bloque de vencimientos, **antes** del cómputo de `gains/losses`, filtrar:

```typescript
// Solo se reportan cierres con closeDate dentro del año fiscal
const fiscalClosed = closedTrades.filter(
  t => t.closeDate && t.closeDate.getFullYear() === stmt.fiscalYear
)

const gains  = fiscalClosed.filter(t => t.gainLossEur > 0).reduce((s, t) => s + t.gainLossEur, 0)
const losses = fiscalClosed.filter(t => t.gainLossEur < 0).reduce((s, t) => s + t.gainLossEur, 0)
const net    = roundEur(gains + losses)

return {
  trades: fiscalClosed,                    // <-- en lugar de closedTrades
  openPositions: openOptions,
  totalGains: roundEur(gains),
  totalLosses: roundEur(losses),
  netGainLoss: net,
  casilla1629: roundEur(gains),
  casilla1630: roundEur(Math.abs(losses)),
}
```

2. En el bucle de vencimientos (líneas 122-132) cambiar `yearEnd` para usar `stmt.fiscalYear` (ya está hardcodeado a `FISCAL_YEAR` que es lo mismo, pero por consistencia con el filtro):

```typescript
const yearEnd = new Date(stmt.fiscalYear, 11, 31)
```

3. **NO modificar** `processExpiry` ni `buildOrphanClose` — solo el filtro final.

**Criterio de aceptación.**
- Una opción cerrada el 2024-08-15 con un fichero de 2024 cargado **no aparece** en la pestaña "Opciones" ni suma en casilla 1629/1630.
- Una opción abierta en 2024 y vencida el 2025-01-17 sí aparece y se contabiliza.
- `stmt.fiscalYear` se lee del statement (no se importa `FISCAL_YEAR` desde `@/types/tax` en este punto).

---

### Tarea 2 — Aplicar deducción doble imposición a la cuota estimada

**Problema.** `src/calculators/tax.ts` calcula `estimatedTax` aplicando los tramos a la base del ahorro, pero **nunca resta `dobleImposicion`**. La cuota mostrada al usuario es la cuota *íntegra*, no la *líquida*. Confunde al usuario.

**Ficheros.**
- `src/types/calculations.ts` — interfaz `TaxSummary`
- `src/calculators/tax.ts` — función `calculateTaxSummary`
- `src/components/results/SummaryPanel.tsx` — mostrar el desglose

**Cambios.**

1. En `src/types/calculations.ts`, dentro de `interface TaxSummary`, añadir:

```typescript
export interface TaxSummary {
  // …campos existentes…
  estimatedTax: number             // cuota íntegra (antes de deducciones)
  taxAfterDeductions: number       // cuota líquida (después de doble imposición) — NUEVO
  // …
}
```

2. En `src/calculators/tax.ts`:

```typescript
const { brackets, total: estimatedTax } = applyBrackets(Math.max(0, totalBase))
const taxAfterDeductions = roundEur(Math.max(0, estimatedTax - dividends.casilla0588))

// …
return {
  // …
  estimatedTax,
  taxAfterDeductions,
  // …
}
```

3. En `src/components/results/SummaryPanel.tsx`, mostrar las dos cifras una debajo de la otra (cuota íntegra / − doble imposición / cuota líquida). El modelo puede usar el patrón visual existente del fichero.

**Criterio de aceptación.**
- Si dividendos íntegros = 1.000 € con 150 € retenidos en EE. UU. y la base total es 1.000 €, la deducción es ~150 € (limitada al 19 % × 1.000 = 190 €), `estimatedTax = 190`, `taxAfterDeductions = 40`.
- La pestaña "Resumen IRPF" muestra ambos valores claramente etiquetados.

---

### Tarea 3 — Doble imposición por país

**Problema.** `src/calculators/dividends.ts` calcula `dobleImposicion` agregando todos los países (`Math.min(totalWithholding, totalGross × marginalRate)`). El art. 80 LIRPF es **por país**: el límite por país es la cuota española correspondiente a las rentas obtenidas en ese país. Países con retención superior al tipo español pierden la diferencia.

**Ficheros.**
- `src/calculators/dividends.ts` — función `calculateDividends`

**Cambios.** Reemplazar las líneas 51-56 por:

```typescript
const marginalRate = marginalRateAhorro(totalGrossEur)

// Doble imposición Art. 80 LIRPF: límite por país = min(retenido, tipo medio español × renta del país)
let dobleImposicion = 0
const dobleImposicionByCountry: Record<string, number> = {}
for (const [country, agg] of Object.entries(byCountry)) {
  const cap = agg.gross * marginalRate
  const allowed = roundEur(Math.min(agg.withholding, cap))
  dobleImposicionByCountry[country] = allowed
  dobleImposicion += allowed
}
dobleImposicion = roundEur(dobleImposicion)
```

Y actualizar el `return`:

```typescript
return {
  // …existing fields…
  dobleImposicion,
  dobleImposicionByCountry,   // nuevo
  casilla0588: dobleImposicion,
}
```

Añadir `dobleImposicionByCountry: Record<string, number>` a `DividendsResult` en `src/types/calculations.ts`.

**Criterio de aceptación.**
- Con dividendos de 100 € de EE. UU. (15 % retención = 15 €) y 100 € de Suiza (35 % retención = 35 €), tipo marginal 19 %:
  - EE. UU.: deducción = min(15, 100 × 0,19) = 15
  - Suiza: deducción = min(35, 100 × 0,19) = 19
  - Total casilla 0588 = 34 (no 50).

---

### Tarea 4 — Mejorar matching dividendo / retención por `ActionID`

**Problema.** En `src/parsers/normalizer.ts::matchDividendsAndWithholding` el matching es por símbolo + ventana de 3 días (línea 180). Si un usuario tiene dos dividendos del mismo símbolo en la misma `PayDate` con `ActionID` distintos, la retención puede emparejarse con el dividendo equivocado.

**Solución.** Cuando los registros provienen del CSV de dividendos (ya emparejados por `ActionID`), forzar match 1:1 por descripción **idéntica** (que ya construimos así en `parseFlexDividendCsv`). El cambio es retrocompatible con CSV de Activity Statement (que mantiene la lógica antigua).

**Ficheros.**
- `src/parsers/normalizer.ts` — función `matchDividendsAndWithholding`

**Cambios.** Reemplazar la búsqueda actual por:

```typescript
// 1) Match exacto por descripción (caso CSV de dividendos: misma description para Po+retención)
let wh = rawWithholding.find(w =>
  w.description === div.description &&
  parseIbkrDate(w.date)?.getTime() === divDate.getTime()
)
// 2) Fallback: match por símbolo + ventana de 3 días (Activity Statement CSV / Flex XML)
if (!wh) {
  wh = rawWithholding.find(w => {
    const wSym  = extractSymbolFromDescription(w.description)
    const wDate = parseIbkrDate(w.date)
    return wSym === sym && wDate && Math.abs(wDate.getTime() - divDate.getTime()) < 86_400_000 * 3
  })
}
```

Además, **marcar la retención como "consumida"** para que no se reutilice:

```typescript
const consumed = new Set<IBKRRawWithholdingTax>()
// dentro del bucle: después de encontrar wh, hacer consumed.add(wh)
// ambos `find` filtran con `!consumed.has(w)` al inicio
```

**Criterio de aceptación.**
- Dos dividendos de "ACXe" pagados el 2025-04-15 con `ActionID` distintos (151391246 y 155087314 del ejemplo del usuario) producen 2 entradas distintas, cada una con su retención correcta.

---

## P1 — MEJORAS DE ARQUITECTURA

### Tarea 5 — Una sola fuente de FISCAL_YEAR

**Problema.** `FISCAL_YEAR` está duplicado en `src/types/tax.ts:1` y `src/lib/constants.ts:1`. Si el usuario sólo cambia uno, la app se rompe silenciosamente (audit #11).

**Ficheros.**
- `src/lib/constants.ts` — quitar la duplicación
- `src/types/tax.ts` — pasa a ser la única fuente
- README.md — actualizar la sección de configuración

**Cambios.**

1. En `src/lib/constants.ts`, sustituir:
   ```typescript
   export const FISCAL_YEAR = 2025
   export const FISCAL_YEAR_START = new Date(2025, 0, 1)
   export const FISCAL_YEAR_END   = new Date(2025, 11, 31)
   ```
   por:
   ```typescript
   import { FISCAL_YEAR } from '@/types/tax'
   export const FISCAL_YEAR_START = new Date(FISCAL_YEAR, 0, 1)
   export const FISCAL_YEAR_END   = new Date(FISCAL_YEAR, 11, 31)
   ```

2. **Verificar** que ningún fichero importa `FISCAL_YEAR` desde `@/lib/constants` (debe importarse siempre desde `@/types/tax`). Si alguno lo hace, ajustar el import.

**Criterio de aceptación.**
- `grep -r "FISCAL_YEAR" src/lib/constants.ts` no muestra ninguna asignación — solo la re-exportación implícita por `import`.
- Cambiar `FISCAL_YEAR` en `tax.ts` actualiza correctamente todos los usos.

---

### Tarea 6 — Avisar al usuario cuando `FXRateToBase` por defecto = 1

**Problema.** `src/parsers/flexQueryCsv.ts:166` hace `fxRate: num(row['FXRateToBase']) || 1` — si el campo falta, usa 1 sin avisar. Para CAD/USD con campo vacío, los dividendos se procesarán como si fueran EUR (audit #13).

**Cambios.** En `parseFlexDividendCsv`, cuando creamos el `IBKRRawDividend`:

```typescript
const fxRate = num(row['FXRateToBase'])
// Solo asignar fxRate si > 0; si no, dejar undefined → resolveEurRate usará ECB / fallback
const dividendEntry: IBKRRawDividend = {
  // …
  fxRateToBase: fxRate > 0 ? fxRate : undefined,
}
```

Esto delega al normalizador la resolución del tipo de cambio (ECB → IBKR → 1 con warning).

**Criterio de aceptación.**
- Un dividendo en USD con `FXRateToBase` vacío usa el tipo BCE; si el BCE no está disponible se añade el aviso "Sin tipo de cambio para USD…" a `state.warnings`.

---

### Tarea 7 — Marcar retenciones huérfanas con aviso útil

**Problema.** En `src/parsers/normalizer.ts` la advertencia "Retención sin dividendo correspondiente" sólo se emite si `wh.amount < 0`. Para nuestro CSV de dividendos las retenciones se generan con `amount = -netTax`, que es negativo, así que el comprobador funciona. Pero el mensaje no incluye la fecha en formato legible.

**Cambios.** Sustituir línea 211:
```typescript
warnings.push(`Retención sin dividendo correspondiente para ${sym} el ${wh.date}`)
```
por:
```typescript
const formatted = parseIbkrDate(wh.date)?.toISOString().slice(0, 10) ?? wh.date
warnings.push(`Retención sin dividendo correspondiente: ${sym} el ${formatted} (${Math.abs(wh.amount).toFixed(2)} ${wh.currency})`)
```

**Criterio de aceptación.** El mensaje muestra fecha ISO y cantidad/moneda.

---

## P2 — DOCUMENTACIÓN Y UI

### Tarea 8 — Reescribir README.md

**Problema.** README está obsoleto en varios puntos: flujo de carga de un solo fichero (debe ser staging multi-fichero), no menciona Flex CSV ni el fichero separado de dividendos, no describe la regla de los 2 meses multi-año, lista 4 pestañas (son 5 con "Acc. corporativas").

**Secciones a reescribir** (manteniendo el estilo y nivel de detalle existentes, en español):

1. **Sección "Uso de la aplicación / 2. Procesar el informe"** (líneas 68-73 actuales). Nuevo flujo:
   > 1. Arrastra los archivos de IBKR a la zona de carga (o haz clic para seleccionarlos)
   > 2. Puedes añadir varios archivos: operaciones del año fiscal, dividendos del año fiscal, e informes de **años anteriores** con posiciones aún abiertas
   > 3. Cada archivo aparece en la lista; puedes quitar uno con la **X** si te equivocas
   > 4. Cuando todos estén listos, pulsa **Generar resultado**
   > 5. Los resultados aparecen organizados en pestañas

2. **Sección "Exportar el informe desde IBKR"** (líneas 47-65 actuales). Reescribir como:
   - Opción A — Activity Statement CSV (incluye todo en un solo archivo)
   - Opción B — Flex Query XML (un archivo)
   - Opción C — Flex Query CSV (sección Trades + sección Dividends en archivos separados — recomendado para granularidad)
   - Para Flex Query, listar las **secciones obligatorias** y referenciar `FormatGuide` dentro de la app para los campos exactos.

3. **Tabla de pestañas** (líneas 78-83 actuales). Añadir fila:
   | **Acc. corporativas** | Splits, fusiones, escisiones y cambios de símbolo detectados |

4. **Nueva sección "Multi-año y regla de los 2 meses"** (insertar después de "Revisar resultados"):
   > La regla de los dos meses (art. 33.5.f LIRPF) requiere conocer las compras de los 61/31 días anteriores y posteriores a una venta con pérdida. Si tu venta con pérdida es de enero o diciembre, **debes subir también el informe del año previo / posterior** para que la herramienta detecte correctamente las recompras. Lo mismo ocurre con la base de coste FIFO de posiciones abiertas en años anteriores.

5. **Sección "Casillas que se calculan"** (líneas 85-96): añadir un párrafo introductorio sobre cómo se relacionan con la base del ahorro y los tramos.

6. **Sección "Estructura del proyecto"** (líneas 196-232): añadir `flexQueryCsv.ts` debajo de `flexQueryXml.ts`.

7. **Eliminar** referencias duplicadas a `FISCAL_YEAR` en `src/lib/constants.ts` (después de la tarea 5).

**Criterio de aceptación.** Un usuario que sólo lee el README puede:
- Entender que tiene que subir varios ficheros y pulsar un botón.
- Saber que hay tres formatos compatibles.
- Entender por qué necesita ficheros de años anteriores.

---

### Tarea 9 — Añadir `SubCategory` al FormatGuide de Flex Query

**Problema.** `FormatGuide.tsx` no lista `SubCategory` en la sección Trades. Sin él, `classifyAsset` en el normalizador (línea ~73) no detecta ETFs nuevos y los clasifica como acciones (regla de 61 días en lugar de 31).

**Ficheros.**
- `src/components/upload/FormatGuide.tsx` — array `FLEX_FIELDS`

**Cambio.** En el bloque `section: 'Trades'`, añadir `'SubCategory'` a la lista de fields (después de `'Multiplier'`).

**Criterio de aceptación.** El badge "SubCategory" aparece en la lista de campos de Trades dentro de la guía.

---

### Tarea 10 — Añadir aviso visual de fichero histórico

**Problema.** Cuando el usuario sube un fichero de 2024, no es obvio en la lista de ficheros staged que ese fichero solo aporta histórico (no genera casillas).

**Ficheros.**
- `src/components/upload/UploadPage.tsx` — render del listado de ficheros staged

**Cambios sugeridos** (no bloquea la implementación):
- Si el nombre del fichero contiene `2024`, `2023`, etc., mostrar un badge "Histórico (no fiscal)" en gris.
- Esto es heurístico; si es complicado, omitir esta tarea.

**Criterio de aceptación.** Opcional. Si se implementa, el badge aparece junto al badge de formato.

---

## P3 — TAREAS OPCIONALES (mejor calidad de salida)

### Tarea 11 — Marcar wash sales "aplicadas" cuando el lote se vende

**Problema.** En `src/calculators/stocks.ts`, cuando una pérdida se difiere a un lote nuevo y ese lote se vende posteriormente, el ajuste de coste se aplica al `costBasisEur` pero el `lotMatch` resultante no marca `washSaleStatus: 'applied'`. El usuario no ve que esa venta absorbió una pérdida diferida.

**Cambio.** En el bucle FIFO de venta (líneas ~270-310), si `lot.deferredBasisAdjustment > 0`, marcar la match generada con `washSaleStatus: 'applied'` y rellenar `washSaleAdjustment` con el ajuste.

**Criterio de aceptación.** Operación de venta que consume un lote con `deferredBasisAdjustment > 0` aparece en la tabla de acciones con badge ámbar "Wash sale aplicada".

---

### Tarea 12 — Validar que las casillas se computan (test de humo)

**Sugerencia.** Crear un test mínimo (Vitest) en `src/__tests__/casillas.test.ts` que:
- Construya un `NormalizedStatement` con datos de juguete (1 buy + 1 sell + 1 dividendo con retención).
- Llame a los calculadores y verifique que las casillas no son `NaN` ni `undefined`.

Esto previene regresiones silenciosas si alguien cambia los nombres de los campos `casillaXXXX`.

---

## Resumen de ficheros tocados

| Fichero | Tareas |
|---|---|
| `src/calculators/options.ts` | 1 |
| `src/calculators/tax.ts` | 2 |
| `src/calculators/dividends.ts` | 3 |
| `src/parsers/normalizer.ts` | 4, 7 |
| `src/parsers/flexQueryCsv.ts` | 6 |
| `src/types/calculations.ts` | 2, 3 |
| `src/lib/constants.ts` | 5 |
| `src/components/results/SummaryPanel.tsx` | 2 |
| `src/components/upload/UploadPage.tsx` | 10 (opcional) |
| `src/components/upload/FormatGuide.tsx` | 9 |
| `README.md` | 8 |

---

## Orden de ejecución recomendado

1. **Tareas 1, 2, 3, 4** (P0) — bugs críticos de cálculo. Verificar build (`npm run build`) tras cada una.
2. **Tarea 5** (P1) — limpieza fácil que reduce riesgo.
3. **Tareas 6, 7** (P1) — robustez de parsers.
4. **Tareas 8, 9** (P2) — documentación, sin riesgo.
5. **Tareas 10, 11, 12** (P3 — opcional).

Tras todas las tareas: `npm run build` debe pasar sin errores y la app debe procesar correctamente los ficheros de muestra (Flex CSV operaciones + Flex CSV dividendos del año fiscal + opcionalmente uno de un año anterior).
