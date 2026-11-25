import type { Asiento } from "@/lib/contabilidad/diario";
import type { PeriodoIva } from "@/lib/iva/liquidacion";
import { nombreCuenta } from "@/lib/plan/plan";
import type { DdjjGanancias } from "@/lib/ddjj/leer-ddjj";

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

function ultimoDia(periodo: string) {
  const [a, m] = periodo.split("-").map(Number);
  return `${periodo}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function linea(cuenta: string, debe: number, haber: number) {
  return {
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: redondear(debe),
    haber: redondear(haber),
  };
}

function asiento(
  fecha: string,
  descripcion: string,
  lineas: Asiento["lineas"],
): Asiento | null {
  const l = lineas.filter((x) => x.debe > 0.004 || x.haber > 0.004);
  if (!l.length) return null;
  return { fecha, origen: "Impuestos", descripcion, lineas: l };
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const nombreMes = (p: string) =>
  `${MESES[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;

/**
 * Asiento de la posición mensual de IVA (al último día del mes): cancela el débito con el crédito,
 * los saldos a favor anteriores, las retenciones y percepciones, y deja el IVA a pagar o los nuevos
 * saldos a favor (técnico y de libre disponibilidad).
 */
export function asientoLiquidacionIva(p: PeriodoIva): Asiento | null {
  const l = p.liquidacion;
  const m = p.manual;
  return asiento(
    ultimoDia(p.periodo),
    `Liquidación de IVA de ${nombreMes(p.periodo)}`,
    [
      linea("2.1.04.001", l.debitoFiscal, 0),
      linea("1.1.04.004", 0, l.creditoFiscal),
      linea("1.1.04.005", 0, m.saldoTecnicoAnterior),
      linea("1.1.04.005", l.saldoTecnicoAFavor, 0),
      linea("1.1.04.008", 0, m.percepciones),
      linea("1.1.04.007", 0, m.retenciones),
      linea("1.1.04.006", 0, m.saldoLibreDisponibilidadAnterior),
      linea("1.1.04.006", l.saldoLibreDisponibilidad, 0),
      linea("2.1.04.002", 0, l.saldoAPagar),
    ],
  );
}

/** Datos de la DDJJ de Ingresos Brutos de un mes. */
export interface DatosIibb {
  /** Impuesto determinado (total de la DDJJ, todas las jurisdicciones). */
  determinado: number;
  retenciones: number;
  percepciones: number;
  sircreb: number;
  /** Si se corrigió a mano el saldo a favor que viene del mes anterior. */
  saldoAFavorAnterior?: number;
  /** Pagos a cuenta y créditos fiscales que trae la DDJJ (anticipos). */
  otrosPagos?: number;
  presentada?: boolean;
  /** De dónde salieron los datos (por ejemplo, la DDJJ importada). */
  origen?: string;
}

export interface PeriodoIibb {
  periodo: string;
  datos: DatosIibb;
  saldoAFavorAnterior: number;
  arrastradoDe: string | null;
  aPagar: number;
  saldoAFavor: number;
}

/** Encadena las DDJJ de IIBB mes a mes, llevando el saldo a favor al mes siguiente. */
export function encadenarIibb(
  guardadas: Record<string, DatosIibb>,
): Map<string, PeriodoIibb> {
  const r = new Map<string, PeriodoIibb>();
  let saf = 0;
  let anterior: string | null = null;
  for (const periodo of Object.keys(guardadas).sort()) {
    const d = guardadas[periodo];
    const saldoAFavorAnterior = d.saldoAFavorAnterior ?? saf;
    const deducciones =
      d.retenciones +
      d.percepciones +
      d.sircreb +
      (d.otrosPagos ?? 0) +
      saldoAFavorAnterior;
    const aPagar = redondear(Math.max(0, d.determinado - deducciones));
    const saldoAFavor = redondear(Math.max(0, deducciones - d.determinado));
    r.set(periodo, {
      periodo,
      datos: d,
      saldoAFavorAnterior,
      arrastradoDe: anterior,
      aPagar,
      saldoAFavor,
    });
    saf = saldoAFavor;
    anterior = periodo;
  }
  return r;
}

/** Asiento de la DDJJ de IIBB: el impuesto al gasto, las deducciones y el saldo a pagar o a favor. */
export function asientoIibb(p: PeriodoIibb): Asiento | null {
  const d = p.datos;
  return asiento(
    ultimoDia(p.periodo),
    `DDJJ de Ingresos Brutos de ${nombreMes(p.periodo)}`,
    [
      linea("5.2.01.006", d.determinado, 0),
      linea("1.1.04.014", 0, d.retenciones + d.sircreb),
      linea("1.1.04.015", 0, d.percepciones),
      linea("1.1.04.013", 0, d.otrosPagos ?? 0),
      linea("1.1.04.016", 0, p.saldoAFavorAnterior),
      linea("1.1.04.016", p.saldoAFavor, 0),
      linea("2.1.04.007", 0, p.aPagar),
    ],
  );
}

/** Asiento del impuesto a las ganancias del ejercicio (DDJJ F.713), a la fecha de cierre. */
export function asientoGanancias(d: DdjjGanancias): Asiento | null {
  return asiento(d.cierre, `Impuesto a las ganancias del ejercicio (DDJJ)`, [
    linea("5.6.01.001", d.impuestoDeterminado, 0),
    linea("1.1.04.010", 0, d.retencionesYPercepciones),
    linea("1.1.04.017", 0, d.credeb),
    linea("1.1.04.012", 0, d.saldoAFavorAnterior),
    linea("1.1.04.009", 0, d.anticipos),
    linea("1.1.04.012", d.saldoAFavor, 0),
    linea("2.1.04.005", 0, d.saldoAIngresar),
  ]);
}
