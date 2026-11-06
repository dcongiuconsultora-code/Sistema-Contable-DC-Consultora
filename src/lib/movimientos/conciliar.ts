import type { MovimientoBancario } from "@/lib/bancos/tipos";
import { entraPlata, medio, type Movimiento } from "./tipos";

const DIAS_TOLERANCIA = 3;

function dias(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
}

/**
 * Cruza los movimientos del resumen bancario con los que cargó el cliente por banco: mismo
 * importe, mismo sentido (entra o sale) y hasta 3 días de diferencia. Cada movimiento del cliente
 * se usa una sola vez, con el del banco de fecha más cercana.
 */
export function conciliar(
  banco: MovimientoBancario[],
  cliente: Movimiento[],
): Map<MovimientoBancario, Movimiento> {
  const candidatos = cliente.filter(
    (m) => m.estado !== "observado" && medio(m.medio).bancario,
  );
  const pares: { b: MovimientoBancario; m: Movimiento; distancia: number }[] =
    [];
  for (const b of banco) {
    for (const m of candidatos) {
      if (entraPlata(m) !== b.importe > 0) continue;
      if (Math.abs(Math.abs(b.importe) - m.importe) > 0.005) continue;
      const distancia = dias(b.fecha, m.fecha);
      if (distancia <= DIAS_TOLERANCIA) pares.push({ b, m, distancia });
    }
  }
  pares.sort((x, y) => x.distancia - y.distancia);
  const resultado = new Map<MovimientoBancario, Movimiento>();
  const usados = new Set<string>();
  for (const { b, m } of pares) {
    if (resultado.has(b) || usados.has(m.id)) continue;
    resultado.set(b, m);
    usados.add(m.id);
  }
  return resultado;
}
