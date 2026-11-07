import base from "./indices-facpce.json";

/** Índice mensual por mes ("AAAA-MM"). */
export type Indices = Record<string, number>;

/**
 * Serie de la FACPCE (Res. JG 539/18: IPC nacional empalmado con IPIM), del archivo que publica la
 * Federación. Los meses nuevos se agregan subiendo el archivo actualizado en la app.
 */
export const INDICES_FACPCE: Indices = base;

export function mesDe(fecha: string) {
  return fecha.slice(0, 7);
}

export function ultimoMes(indices: Indices) {
  return Object.keys(indices).sort().at(-1) ?? null;
}

/** Índice del mes; si todavía no se publicó, el último disponible (y avisa cuál usó). */
export function indiceDelMes(indices: Indices, mes: string) {
  if (indices[mes]) return { valor: indices[mes], mes, estimado: false };
  const anteriores = Object.keys(indices)
    .filter((m) => m <= mes)
    .sort();
  const usado = anteriores.at(-1);
  if (!usado)
    throw new Error(`No hay índice para ${mes} ni para meses anteriores.`);
  return { valor: indices[usado], mes: usado, estimado: true };
}

/** Coeficiente para llevar un importe del mes de origen a moneda del mes de cierre. */
export function coeficiente(indices: Indices, origen: string, cierre: string) {
  return (
    indiceDelMes(indices, cierre).valor / indiceDelMes(indices, origen).valor
  );
}

function aMes(valor: unknown): string | null {
  if (valor instanceof Date && !Number.isNaN(valor.getTime()))
    return valor.toISOString().slice(0, 7);
  if (typeof valor === "string") {
    const m = valor.trim().match(/^(\d{1,2})[/-](\d{4})$|^(\d{4})-(\d{2})/);
    if (m) return m[3] ? `${m[3]}-${m[4]}` : `${m[2]}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

/** Lee las filas del Excel de la FACPCE: columna A el mes, columna B el índice. */
export function indicesDesdeFilas(filas: unknown[][]): Indices {
  const indices: Indices = {};
  for (const fila of filas) {
    const mes = aMes(fila[0]);
    const valor = fila[1];
    if (mes && typeof valor === "number" && valor > 0) indices[mes] = valor;
  }
  if (Object.keys(indices).length < 12)
    throw new Error(
      "El archivo no parece el de índices de la FACPCE (columna A el mes, columna B el índice).",
    );
  return indices;
}

/** Variación entre dos meses (0,5 = 50 %). */
export function variacion(indices: Indices, desde: string, hasta: string) {
  return coeficiente(indices, desde, hasta) - 1;
}

/** Suma (o resta) meses a "AAAA-MM". */
export function sumarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
