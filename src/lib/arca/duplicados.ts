import type { Comprobante } from "./tipos";

/** Identifica un comprobante como lo hace ARCA: tipo, punto de venta, número y CUIT. */
export function claveArca(
  c: Pick<
    Comprobante,
    "tipoCodigo" | "puntoVenta" | "numeroDesde" | "cuitContraparte"
  >,
) {
  return `${c.tipoCodigo}-${c.puntoVenta}-${c.numeroDesde}-${c.cuitContraparte}`;
}

export interface ResultadoComparacion {
  /** Comprobantes del archivo sin repetir (los que se guardan). */
  unicos: Comprobante[];
  nuevos: number;
  /** Ya estaban cargados de antes (no se duplican: se actualizan). */
  yaEstaban: number;
  /** Venían dos veces en el mismo archivo. */
  repetidosEnArchivo: number;
}

/** Compara lo que se importa con lo que ya está cargado, para no duplicar. */
export function compararImportacion(
  existentes: Comprobante[],
  archivo: Comprobante[],
): ResultadoComparacion {
  const antes = new Set(existentes.map(claveArca));
  const vistos = new Set<string>();
  const unicos: Comprobante[] = [];
  let nuevos = 0;
  let yaEstaban = 0;
  let repetidosEnArchivo = 0;
  for (const c of archivo) {
    const k = claveArca(c);
    if (vistos.has(k)) {
      repetidosEnArchivo++;
      continue;
    }
    vistos.add(k);
    unicos.push(c);
    if (antes.has(k)) yaEstaban++;
    else nuevos++;
  }
  return { unicos, nuevos, yaEstaban, repetidosEnArchivo };
}

/**
 * Posibles duplicados con distinto número: mismo CUIT, misma fecha y mismo total (por ejemplo,
 * una factura cargada a mano o por ticket y otra vez desde ARCA con otro tipo o número).
 */
export function posiblesDuplicados(
  comprobantes: Comprobante[],
): Comprobante[][] {
  const grupos = new Map<string, Comprobante[]>();
  for (const c of comprobantes) {
    if (!c.total) continue;
    const k = `${c.cuitContraparte}|${c.fecha}|${Math.round(c.total * 100)}|${c.clase}`;
    grupos.set(k, [...(grupos.get(k) ?? []), c]);
  }
  return [...grupos.values()].filter((g) => new Set(g.map(claveArca)).size > 1);
}
