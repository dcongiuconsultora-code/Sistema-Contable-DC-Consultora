import type { Comprobante } from "@/lib/arca/tipos";

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export interface TotalesLibro {
  cantidad: number;
  netoGravado: number;
  noGravado: number;
  exento: number;
  otrosTributos: number;
  iva: number;
  total: number;
  /** Neto e IVA por alícuota. La clave "s/d" agrupa comprobantes sin alícuota identificada. */
  porTasa: Map<string, { neto: number; iva: number }>;
}

export function claveTasa(tasa: number | null) {
  return tasa === null ? "s/d" : String(tasa);
}

export function comprobantesDelPeriodo(
  comprobantes: Comprobante[],
  periodo: string,
) {
  return comprobantes
    .filter((c) => c.periodo === periodo)
    .sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) ||
        a.puntoVenta - b.puntoVenta ||
        a.numeroDesde - b.numeroDesde,
    );
}

export function totalesLibro(comprobantes: Comprobante[]): TotalesLibro {
  const t: TotalesLibro = {
    cantidad: comprobantes.length,
    netoGravado: 0,
    noGravado: 0,
    exento: 0,
    otrosTributos: 0,
    iva: 0,
    total: 0,
    porTasa: new Map(),
  };
  for (const c of comprobantes) {
    t.netoGravado += c.netoGravado;
    t.noGravado += c.noGravado;
    t.exento += c.exento;
    t.otrosTributos += c.otrosTributos;
    t.iva += c.iva;
    t.total += c.total;
    for (const a of c.alicuotas) {
      const k = claveTasa(a.tasa);
      const acc = t.porTasa.get(k) ?? { neto: 0, iva: 0 };
      acc.neto += a.neto;
      acc.iva += a.iva;
      t.porTasa.set(k, acc);
    }
  }
  t.netoGravado = redondear(t.netoGravado);
  t.noGravado = redondear(t.noGravado);
  t.exento = redondear(t.exento);
  t.otrosTributos = redondear(t.otrosTributos);
  t.iva = redondear(t.iva);
  t.total = redondear(t.total);
  for (const v of t.porTasa.values()) {
    v.neto = redondear(v.neto);
    v.iva = redondear(v.iva);
  }
  return t;
}

export interface DatosManualesIva {
  saldoTecnicoAnterior: number;
  saldoLibreDisponibilidadAnterior: number;
  percepciones: number;
  retenciones: number;
}

export interface LiquidacionIva {
  debitoPorTasa: Map<string, number>;
  debitoFiscal: number;
  creditoPorTasa: Map<string, number>;
  creditoFiscal: number;
  saldoTecnico: number;
  saldoTecnicoAFavor: number;
  saldoAPagar: number;
  saldoLibreDisponibilidad: number;
}

/** Misma lógica que la pestaña "Liq IVA" de la planilla (F.2002). */
export function liquidarIva(
  ventas: Comprobante[],
  compras: Comprobante[],
  manual: DatosManualesIva,
): LiquidacionIva {
  const tv = totalesLibro(ventas);
  const tc = totalesLibro(compras.filter((c) => c.computaIva));
  const debitoPorTasa = new Map([...tv.porTasa].map(([k, v]) => [k, v.iva]));
  const creditoPorTasa = new Map([...tc.porTasa].map(([k, v]) => [k, v.iva]));
  const debitoFiscal = tv.iva;
  const creditoFiscal = tc.iva;

  const saldoTecnico = redondear(
    debitoFiscal - creditoFiscal - manual.saldoTecnicoAnterior,
  );
  const aDescontar =
    manual.percepciones +
    manual.retenciones +
    manual.saldoLibreDisponibilidadAnterior;
  const impuestoDeterminado = Math.max(0, saldoTecnico);
  return {
    debitoPorTasa,
    debitoFiscal,
    creditoPorTasa,
    creditoFiscal,
    saldoTecnico,
    saldoTecnicoAFavor: Math.max(0, -saldoTecnico),
    saldoAPagar: redondear(Math.max(0, impuestoDeterminado - aDescontar)),
    saldoLibreDisponibilidad: redondear(
      Math.max(0, aDescontar - impuestoDeterminado),
    ),
  };
}
