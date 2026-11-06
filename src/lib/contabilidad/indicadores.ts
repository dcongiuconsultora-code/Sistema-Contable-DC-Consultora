import { cuenta as datosCuenta } from "@/lib/plan/plan";
import type { Asiento } from "./diario";

/** Saldos de inicio que carga el estudio (del último balance), en el lado natural de cada cuenta. */
export interface SaldosIniciales {
  fecha: string; // AAAA-MM-DD: los asientos posteriores a esta fecha se suman
  saldos: Record<string, number>;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

/** Saldo deudor (positivo) o acreedor (negativo) de cada cuenta hasta una fecha. */
export function mayor(
  asientos: Asiento[],
  iniciales: SaldosIniciales,
  hasta: string,
): Map<string, number> {
  const saldos = new Map<string, number>();
  const sumar = (codigo: string, importe: number) =>
    saldos.set(codigo, redondear((saldos.get(codigo) ?? 0) + importe));
  for (const [codigo, importe] of Object.entries(iniciales.saldos)) {
    sumar(
      codigo,
      datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe,
    );
  }
  for (const a of asientos) {
    if (a.fecha <= iniciales.fecha || a.fecha > hasta) continue;
    for (const l of a.lineas) sumar(l.cuenta, l.debe - l.haber);
  }
  return saldos;
}

/** Cambia el signo sin dejar un -0 (que se mostraría como "-0,00"). */
function opuesto(n: number) {
  return n === 0 ? 0 : -n;
}

function sumaPrefijo(saldos: Map<string, number>, prefijo: string) {
  let total = 0;
  for (const [codigo, saldo] of saldos)
    if (codigo === prefijo || codigo.startsWith(`${prefijo}.`)) total += saldo;
  return redondear(total);
}

export interface Balance {
  activoCorriente: number;
  activoNoCorriente: number;
  pasivoCorriente: number;
  pasivoNoCorriente: number;
  patrimonioNeto: number;
  /** Resultado acumulado desde los saldos de inicio (ya incluido en el patrimonio neto). */
  resultado: number;
  disponibilidades: number;
  creditosPorVentas: number;
  bienesDeCambio: number;
  deudasComerciales: number;
  /** Activo − (pasivo + patrimonio neto): 0 si los saldos de inicio balancean. */
  diferencia: number;
}

export function balance(saldos: Map<string, number>): Balance {
  const ac = sumaPrefijo(saldos, "1.1");
  const anc = sumaPrefijo(saldos, "1.2");
  const pc = opuesto(sumaPrefijo(saldos, "2.1"));
  const pnc = opuesto(sumaPrefijo(saldos, "2.2"));
  const resultado = redondear(
    -(sumaPrefijo(saldos, "4") + sumaPrefijo(saldos, "5")),
  );
  const pn = redondear(-sumaPrefijo(saldos, "3") + resultado);
  return {
    activoCorriente: ac,
    activoNoCorriente: anc,
    pasivoCorriente: pc,
    pasivoNoCorriente: pnc,
    patrimonioNeto: pn,
    resultado,
    disponibilidades: sumaPrefijo(saldos, "1.1.01"),
    creditosPorVentas: sumaPrefijo(saldos, "1.1.03"),
    bienesDeCambio: sumaPrefijo(saldos, "1.1.05"),
    deudasComerciales: opuesto(sumaPrefijo(saldos, "2.1.01")),
    diferencia: redondear(ac + anc - pc - pnc - pn),
  };
}

export interface Resultados {
  ventas: number;
  costos: number;
  gastos: number;
  resultado: number;
  /** Resultado / ventas. null si no hubo ventas. */
  margen: number | null;
}

/** Estado de resultados de un período (fechas inclusive). */
export function resultados(
  asientos: Asiento[],
  desde: string,
  hasta: string,
): Resultados {
  let ventas = 0;
  let otrosIngresos = 0;
  let costos = 0;
  let gastos = 0;
  for (const a of asientos) {
    if (a.fecha < desde || a.fecha > hasta) continue;
    for (const l of a.lineas) {
      const neto = l.haber - l.debe;
      if (l.cuenta.startsWith("4.1.")) ventas += neto;
      else if (l.cuenta.startsWith("4.")) otrosIngresos += neto;
      else if (l.cuenta.startsWith("5.1.")) costos -= neto;
      else if (l.cuenta.startsWith("5.")) gastos -= neto;
    }
  }
  const resultado = redondear(ventas + otrosIngresos - costos - gastos);
  return {
    ventas: redondear(ventas),
    costos: redondear(costos),
    gastos: redondear(gastos),
    resultado,
    margen: ventas > 0 ? resultado / ventas : null,
  };
}

export type Estado = "bien" | "atencion" | "critico" | "sin_datos";

export interface Indicador {
  id: "liquidez" | "acida" | "endeudamiento" | "rentabilidad";
  nombre: string;
  valor: number | null;
  estado: Estado;
  /** Qué significa el número para el cliente, en una frase. */
  lectura: string;
  formula: string;
  /** Escala para dibujar el indicador y sus umbrales (de peor a mejor). */
  escala: {
    min: number;
    max: number;
    atencion: number;
    bien: number;
    menorEsMejor?: boolean;
  };
}

function evaluar(
  valor: number | null,
  atencion: number,
  bien: number,
  menorEsMejor = false,
): Estado {
  if (valor === null || !Number.isFinite(valor)) return "sin_datos";
  if (menorEsMejor)
    return valor <= bien ? "bien" : valor <= atencion ? "atencion" : "critico";
  return valor >= bien ? "bien" : valor >= atencion ? "atencion" : "critico";
}

const DOS_DECIMALES = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const PORCENTAJE = new Intl.NumberFormat("es-AR", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Índices de la empresa. Los umbrales son referencias generales; cada rubro tiene los suyos. */
export function indicadores(b: Balance, r: Resultados): Indicador[] {
  const div = (a: number, c: number) => (c > 0 ? a / c : null);
  const liquidez = div(b.activoCorriente, b.pasivoCorriente);
  const acida = div(b.activoCorriente - b.bienesDeCambio, b.pasivoCorriente);
  const pasivo = b.pasivoCorriente + b.pasivoNoCorriente;
  const endeudamiento = b.patrimonioNeto > 0 ? pasivo / b.patrimonioNeto : null;
  const margen = r.margen;

  return [
    {
      id: "rentabilidad",
      nombre: "Rentabilidad",
      valor: margen,
      estado: evaluar(margen, 0, 0.1),
      lectura:
        margen === null
          ? "Todavía no hay ventas en el período."
          : margen >= 0
            ? `De cada $100 que vendiste te quedaron $${DOS_DECIMALES.format(margen * 100)} de ganancia.`
            : `Por cada $100 que vendiste perdiste $${DOS_DECIMALES.format(-margen * 100)}.`,
      formula: "Resultado del período ÷ ventas netas",
      escala: { min: -0.2, max: 0.4, atencion: 0, bien: 0.1 },
    },
    {
      id: "liquidez",
      nombre: "Liquidez corriente",
      valor: liquidez,
      estado: evaluar(liquidez, 1, 1.5),
      lectura:
        liquidez === null
          ? "No hay deudas de corto plazo registradas."
          : `Por cada $1 que tenés que pagar en el año, tenés $${DOS_DECIMALES.format(liquidez)} para hacerlo.`,
      formula: "Activo corriente ÷ pasivo corriente",
      escala: { min: 0, max: 3, atencion: 1, bien: 1.5 },
    },
    {
      id: "acida",
      nombre: "Prueba ácida",
      valor: acida,
      estado: evaluar(acida, 0.7, 1),
      lectura:
        acida === null
          ? "No hay deudas de corto plazo registradas."
          : `Sin contar el stock, por cada $1 de deuda de corto plazo tenés $${DOS_DECIMALES.format(acida)}.`,
      formula: "(Activo corriente − bienes de cambio) ÷ pasivo corriente",
      escala: { min: 0, max: 2, atencion: 0.7, bien: 1 },
    },
    {
      id: "endeudamiento",
      nombre: "Endeudamiento",
      valor: endeudamiento,
      estado: evaluar(endeudamiento, 2, 1, true),
      lectura:
        endeudamiento === null
          ? "El patrimonio neto no es positivo: revisar con el estudio."
          : `Por cada $1 propio, la empresa debe $${DOS_DECIMALES.format(endeudamiento)} a terceros.`,
      formula: "Pasivo total ÷ patrimonio neto",
      escala: { min: 0, max: 3, atencion: 2, bien: 1, menorEsMejor: true },
    },
  ];
}

export function formatoIndicador(i: Indicador) {
  if (i.valor === null) return "—";
  return i.id === "rentabilidad"
    ? PORCENTAJE.format(i.valor)
    : `${DOS_DECIMALES.format(i.valor)}`;
}
