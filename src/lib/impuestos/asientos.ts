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

/** Una jurisdicción de la DDJJ de Convenio Multilateral (CM03). */
export interface JurisdiccionIibb {
  codigo: string;
  nombre: string;
  determinado: number;
  restan: number;
  suman: number;
  aFavorContribuyente: number;
  aPagar: number;
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
  /**
   * DDJJ que trae las deducciones juntas (Convenio Multilateral): el total, incluido el saldo a
   * favor anterior. Las retenciones, percepciones y SIRCREB de los archivos sirven para repartirlo.
   */
  deduccionesDdjj?: number;
  /** Lo que dio la DDJJ presentada (manda sobre lo calculado). */
  aPagarDdjj?: number;
  saldoAFavorDdjj?: number;
  jurisdicciones?: JurisdiccionIibb[];
  fechaPresentacion?: string;
}

export interface PeriodoIibb {
  periodo: string;
  datos: DatosIibb;
  saldoAFavorAnterior: number;
  arrastradoDe: string | null;
  aPagar: number;
  saldoAFavor: number;
  /** Deducciones con que se arma el asiento. */
  deducciones: {
    retenciones: number;
    percepciones: number;
    sircreb: number;
    otrosPagos: number;
  };
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
    let saldoAFavorAnterior = d.saldoAFavorAnterior ?? saf;
    let deducciones: PeriodoIibb["deducciones"];
    if (d.deduccionesDdjj !== undefined) {
      // Total de la DDJJ: primero el saldo a favor anterior, después lo que se conoce por los
      // archivos (percepciones y SIRCREB) y el resto como retenciones.
      const total = d.deduccionesDdjj;
      saldoAFavorAnterior = Math.min(saldoAFavorAnterior, total);
      let resto = redondear(total - saldoAFavorAnterior);
      const percepciones = Math.min(Math.max(0, d.percepciones), resto);
      resto = redondear(resto - percepciones);
      const sircreb = Math.min(Math.max(0, d.sircreb), resto);
      deducciones = {
        retenciones: redondear(resto - sircreb),
        percepciones,
        sircreb,
        otrosPagos: 0,
      };
    } else
      deducciones = {
        retenciones: d.retenciones,
        percepciones: d.percepciones,
        sircreb: d.sircreb,
        otrosPagos: d.otrosPagos ?? 0,
      };
    const total =
      deducciones.retenciones +
      deducciones.percepciones +
      deducciones.sircreb +
      deducciones.otrosPagos +
      saldoAFavorAnterior;
    const aPagar =
      d.aPagarDdjj ?? redondear(Math.max(0, d.determinado - total));
    const saldoAFavor =
      d.aPagarDdjj !== undefined
        ? (d.saldoAFavorDdjj ?? 0)
        : redondear(Math.max(0, total - d.determinado));
    r.set(periodo, {
      periodo,
      datos: d,
      saldoAFavorAnterior,
      arrastradoDe: anterior,
      aPagar,
      saldoAFavor,
      deducciones,
    });
    saf = saldoAFavor;
    anterior = periodo;
  }
  return r;
}

/** Asiento de la DDJJ de IIBB: el impuesto al gasto, las deducciones y el saldo a pagar o a favor. */
export function asientoIibb(p: PeriodoIibb): Asiento | null {
  const d = p.deducciones;
  const haber =
    d.retenciones +
    d.sircreb +
    d.percepciones +
    d.otrosPagos +
    p.saldoAFavorAnterior +
    p.aPagar;
  // El gasto es lo que cierra el asiento (si la DDJJ trae intereses o redondeos, quedan ahí).
  const gasto = redondear(haber - p.saldoAFavor);
  return asiento(
    ultimoDia(p.periodo),
    `DDJJ de Ingresos Brutos de ${nombreMes(p.periodo)}`,
    [
      linea("5.2.01.006", Math.max(0, gasto), Math.max(0, -gasto)),
      linea("1.1.04.014", 0, d.retenciones + d.sircreb),
      linea("1.1.04.015", 0, d.percepciones),
      linea("1.1.04.013", 0, d.otrosPagos),
      linea("1.1.04.016", 0, p.saldoAFavorAnterior),
      linea("1.1.04.016", p.saldoAFavor, 0),
      linea("2.1.04.007", 0, p.aPagar),
    ],
  );
}

/** Asiento del impuesto a las ganancias del ejercicio (DDJJ F.713), a la fecha de cierre. */
export function asientoGanancias(d: DdjjGanancias): Asiento | null {
  // Persona humana: el impuesto es del titular, no un gasto de la actividad; va a su cuenta
  // particular (como un retiro).
  const humana = d.formulario === "F.2711";
  return asiento(
    d.cierre,
    humana
      ? "Impuesto a las ganancias del titular (DDJJ F.2711)"
      : "Impuesto a las ganancias del ejercicio (DDJJ)",
    [
      linea(humana ? "1.1.04.024" : "5.6.01.001", d.impuestoDeterminado, 0),
      linea("1.1.04.010", 0, d.retencionesYPercepciones),
      linea("1.1.04.017", 0, d.credeb),
      linea("1.1.04.012", 0, d.saldoAFavorAnterior),
      linea("1.1.04.009", 0, d.anticipos),
      linea("1.1.04.012", d.saldoAFavor, 0),
      linea("2.1.04.005", 0, d.saldoAIngresar),
    ],
  );
}
