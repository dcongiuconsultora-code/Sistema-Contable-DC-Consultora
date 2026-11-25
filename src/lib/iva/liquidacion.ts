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

/** Lo que dice la DDJJ de IVA presentada (F.2051 / F.2002). */
export interface DdjjIva {
  debitoFiscal: number;
  creditoFiscal: number;
  saldoTecnicoAnterior: number;
  saldoLibreDisponibilidadAnterior: number;
  /** Retenciones, percepciones y pagos a cuenta (la DDJJ los trae juntos). */
  retencionesYPercepciones: number;
  saldoTecnicoAFavor: number;
  saldoAPagar: number;
  saldoLibreDisponibilidad: number;
  fechaPresentacion?: string;
  transaccion?: string;
}

/** Totales del Libro IVA Digital presentado (F.2083), para controlar contra lo cargado. */
export interface LibroIvaDigital {
  ventasNeto: number;
  debitoFiscal: number;
  comprasNeto: number;
  creditoFiscal: number;
  fechaPresentacion?: string;
}

/** Lo guardado de una liquidación: lo que se corrigió a mano y, si se presentó, su resultado. */
export interface LiquidacionGuardada {
  /** DDJJ importada: manda sobre lo calculado con los comprobantes. */
  ddjj?: DdjjIva;
  libro?: LibroIvaDigital;
  manual: Partial<DatosManualesIva>;
  presentada?: boolean;
  resultado?: {
    saldoTecnicoAFavor: number;
    saldoLibreDisponibilidad: number;
    saldoAPagar: number;
  };
}

export interface PeriodoIva {
  periodo: string;
  manual: DatosManualesIva;
  /** Período del que vienen los saldos anteriores (null en el primero). */
  arrastradoDe: string | null;
  arrastrado: { saldoTecnico: number; libreDisponibilidad: number };
  liquidacion: LiquidacionIva;
  presentada: boolean;
  /** Si hay DDJJ importada: lo que daba el sistema con los comprobantes, para comparar. */
  calculada?: LiquidacionIva;
}

/** Arma la liquidación con los importes de la DDJJ (lo presentado manda). */
function desdeDdjj(
  calculada: LiquidacionIva,
  d: DdjjIva,
  manual: DatosManualesIva,
): { liquidacion: LiquidacionIva; manual: DatosManualesIva } {
  // La DDJJ trae retenciones y percepciones juntas: las percepciones conocidas van como
  // percepciones y el resto como retenciones.
  const percepciones = Math.min(
    Math.max(0, manual.percepciones),
    d.retencionesYPercepciones,
  );
  return {
    manual: {
      saldoTecnicoAnterior: d.saldoTecnicoAnterior,
      saldoLibreDisponibilidadAnterior: d.saldoLibreDisponibilidadAnterior,
      percepciones,
      retenciones: redondear(d.retencionesYPercepciones - percepciones),
    },
    liquidacion: {
      ...calculada,
      debitoFiscal: d.debitoFiscal,
      creditoFiscal: d.creditoFiscal,
      saldoTecnico: redondear(
        d.debitoFiscal - d.creditoFiscal - d.saldoTecnicoAnterior,
      ),
      saldoTecnicoAFavor: d.saldoTecnicoAFavor,
      saldoAPagar: d.saldoAPagar,
      saldoLibreDisponibilidad: d.saldoLibreDisponibilidad,
    },
  };
}

function mesSiguiente(p: string) {
  const [a, m] = p.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Liquida todos los meses en orden, llevando el saldo técnico a favor y el de libre
 * disponibilidad de cada mes al siguiente. Lo corregido a mano en un mes manda; un mes presentado
 * arrastra el resultado que se guardó al presentarlo.
 */
export function encadenarIva(
  periodos: string[],
  datosDe: (periodo: string) => {
    ventas: Comprobante[];
    compras: Comprobante[];
    desdeArchivos: { percepciones: number; retenciones: number } | null;
  },
  guardadas: Record<string, LiquidacionGuardada>,
): Map<string, PeriodoIva> {
  const todos = [...new Set([...periodos, ...Object.keys(guardadas)])].sort();
  const r = new Map<string, PeriodoIva>();
  if (!todos.length) return r;
  let saldoTecnico = 0;
  let libreDisponibilidad = 0;
  let anterior: string | null = null;
  for (let p = todos[0]; p <= todos[todos.length - 1]; p = mesSiguiente(p)) {
    const g = guardadas[p];
    const d = datosDe(p);
    const manual: DatosManualesIva = {
      saldoTecnicoAnterior: saldoTecnico,
      saldoLibreDisponibilidadAnterior: libreDisponibilidad,
      percepciones: 0,
      retenciones: 0,
      ...g?.manual,
      ...(d.desdeArchivos ?? {}),
    };
    const calculada = liquidarIva(d.ventas, d.compras, manual);
    const conDdjj = g?.ddjj ? desdeDdjj(calculada, g.ddjj, manual) : null;
    const liquidacion = conDdjj?.liquidacion ?? calculada;
    r.set(p, {
      periodo: p,
      manual: conDdjj?.manual ?? manual,
      arrastradoDe: anterior,
      arrastrado: { saldoTecnico, libreDisponibilidad },
      liquidacion,
      presentada: Boolean(g?.presentada || g?.ddjj),
      calculada: conDdjj ? calculada : undefined,
    });
    const base = conDdjj
      ? liquidacion
      : g?.presentada && g.resultado
        ? g.resultado
        : liquidacion;
    saldoTecnico = base.saldoTecnicoAFavor;
    libreDisponibilidad = base.saldoLibreDisponibilidad;
    anterior = p;
  }
  return r;
}
