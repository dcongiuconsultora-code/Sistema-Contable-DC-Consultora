import type { DdjjGanancias } from "@/lib/ddjj/leer-ddjj";
import { indiceDelMes, type Indices } from "@/lib/inflacion/indices";

/**
 * Quebrantos de Ganancias (art. 25 de la ley): se pueden compensar con las ganancias de los cinco
 * períodos siguientes y se actualizan por IPC desde el mes de cierre en que se generaron hasta el
 * mes de cierre del período en que se usan. Se arma con las DDJJ cargadas y los quebrantos de
 * años anteriores que cargue el estudio.
 */
export interface QuebrantoDisponible {
  /** Cierre del período en que se generó (AAAA-MM-DD). */
  origen: string;
  /** Cargado a mano (de antes de usar el sistema) o tomado de la DDJJ. */
  manual: boolean;
  original: number;
  /** Lo ya compensado en períodos posteriores, a valores de origen. */
  compensado: number;
  /** Lo que queda, a valores de origen. */
  saldo: number;
  /** Lo que queda, actualizado por IPC al cierre del período a liquidar. */
  saldoActualizado: number;
  coeficiente: number;
  /** Último período fiscal en que se puede usar. */
  venceEnPeriodo: number;
  vencido: boolean;
}

export interface Quebrantos {
  /** Cierre del período que se va a liquidar. */
  aCierre: string;
  lista: QuebrantoDisponible[];
  totalActualizado: number;
  /** El IPC más nuevo que hay cargado (si el cierre es posterior, se usa ese). */
  ipcHasta: string | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const anio = (f: string) => Number(f.slice(0, 4));

function coef(indices: Indices, desde: string, hasta: string) {
  try {
    return (
      indiceDelMes(indices, hasta.slice(0, 7)).valor /
      indiceDelMes(indices, desde.slice(0, 7)).valor
    );
  } catch {
    return 1;
  }
}

function sumarAnio(cierre: string) {
  const [a, m] = cierre.split("-").map(Number);
  return new Date(Date.UTC(a + 1, m, 0)).toISOString().slice(0, 10);
}

export function calcularQuebrantos(
  ddjj: Record<string, DdjjGanancias>,
  manuales: Record<string, number>,
  indices: Indices,
  aCierre?: string,
): Quebrantos {
  const cierres = Object.keys(ddjj).sort();
  const hasta =
    aCierre ??
    (cierres.length
      ? sumarAnio(cierres[cierres.length - 1])
      : `${new Date().getFullYear()}-12-31`);
  // Cada quebranto con lo que le queda, a valores de origen.
  const lista: {
    origen: string;
    manual: boolean;
    original: number;
    saldo: number;
  }[] = Object.entries(manuales)
    .filter(([, v]) => v > 0)
    .map(([origen, v]) => ({ origen, manual: true, original: v, saldo: v }));
  const eventos = [...new Set([...cierres, ...Object.keys(manuales)])].sort();
  for (const cierre of eventos) {
    const d = ddjj[cierre];
    if (!d) continue;
    const r = d.resultadoImpositivo;
    if (r < 0) {
      if (!lista.some((q) => q.origen === cierre))
        lista.push({ origen: cierre, manual: false, original: -r, saldo: -r });
      continue;
    }
    // Una ganancia consume los quebrantos más viejos que sigan vigentes.
    let ganancia = r;
    for (const q of lista.sort((a, b) => a.origen.localeCompare(b.origen))) {
      if (ganancia <= 0) break;
      if (
        q.origen >= cierre ||
        anio(cierre) > anio(q.origen) + 5 ||
        q.saldo <= 0
      )
        continue;
      const k = coef(indices, q.origen, cierre);
      const usado = Math.min(ganancia, q.saldo * k);
      q.saldo = redondear(q.saldo - usado / k);
      ganancia -= usado;
    }
  }
  const ipcHasta = Object.keys(indices).sort().at(-1) ?? null;
  const detalle = lista
    .sort((a, b) => a.origen.localeCompare(b.origen))
    .map((q) => {
      const k = coef(indices, q.origen, hasta);
      const venceEnPeriodo = anio(q.origen) + 5;
      return {
        origen: q.origen,
        manual: q.manual,
        original: redondear(q.original),
        compensado: redondear(q.original - q.saldo),
        saldo: redondear(q.saldo),
        saldoActualizado: redondear(q.saldo * k),
        coeficiente: Math.round(k * 10000) / 10000,
        venceEnPeriodo,
        vencido: anio(hasta) > venceEnPeriodo,
      };
    });
  return {
    aCierre: hasta,
    lista: detalle,
    totalActualizado: redondear(
      detalle
        .filter((q) => !q.vencido)
        .reduce((t, q) => t + q.saldoActualizado, 0),
    ),
    ipcHasta,
  };
}
