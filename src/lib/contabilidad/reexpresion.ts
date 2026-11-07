import {
  coeficiente,
  indiceDelMes,
  type Indices,
  mesDe,
} from "@/lib/inflacion/indices";
import { cuenta as datosCuenta, nombreCuenta } from "@/lib/plan/plan";
import type { Asiento } from "./diario";
import type { SaldosIniciales } from "./indicadores";

export const CUENTA_RECPAM = "5.4.01.008";
export const CUENTA_AJUSTE_CAPITAL = "3.1.01.002";

const NO_MONETARIAS = [
  "1.1.04.001", // anticipos a proveedores
  "1.1.04.019",
  "1.1.04.020",
  "1.1.04.021", // gastos pagados por adelantado
  "1.1.05", // bienes de cambio
  "1.1.06",
  "1.2.03.002",
  "1.2.03.003", // propiedades de inversión
  "1.2.04", // participaciones
  "1.2.05", // bienes de uso
  "1.2.06",
  "1.2.07", // intangibles y llave
  "2.1.05", // anticipos de clientes (deudas en especie)
  "2.1.07.005", // ingresos cobrados por adelantado
  "3", // patrimonio neto
  "4",
  "5", // resultados
];

function bajo(codigo: string, prefijo: string) {
  return codigo === prefijo || codigo.startsWith(`${prefijo}.`);
}

/**
 * Partidas que se reexpresan (RT 6). Las monetarias (caja, bancos, créditos y deudas en pesos) y las
 * medidas a valor corriente (moneda extranjera, inversiones con cotización) ya están en moneda de cierre.
 */
export function esNoMonetaria(codigo: string) {
  return codigo !== CUENTA_RECPAM && NO_MONETARIAS.some((p) => bajo(codigo, p));
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export interface Reexpresion {
  /** Asiento que lleva las partidas no monetarias a moneda de cierre, con el RECPAM como contrapartida. */
  asiento: Asiento;
  recpam: number;
  /** Coeficiente de los saldos de inicio (del cierre anterior al cierre actual). */
  coeficienteInicio: number;
  indiceInicio: { mes: string; valor: number };
  indiceCierre: { mes: string; valor: number; estimado: boolean };
  /** Ajuste por cuenta (positivo = aumenta el saldo deudor). */
  ajustes: Map<string, number>;
}

/**
 * Método de la RT 6: cada partida no monetaria se reexpresa desde su mes de origen (los saldos de
 * inicio desde el cierre anterior, que ya estaba en moneda de esa fecha; los movimientos desde el mes
 * del asiento). El capital queda a su valor nominal y su reexpresión va a "Ajuste de capital". El
 * RECPAM es la diferencia que hace cerrar el asiento.
 */
export function reexpresar(
  asientos: Asiento[],
  iniciales: SaldosIniciales,
  cierre: string,
  indices: Indices,
): Reexpresion {
  const mesCierre = mesDe(cierre);
  const mesInicio = mesDe(iniciales.fecha);
  const coef = (mes: string) => coeficiente(indices, mes, mesCierre);
  const ajustes = new Map<string, number>();
  const sumar = (codigo: string, importe: number) =>
    ajustes.set(codigo, (ajustes.get(codigo) ?? 0) + importe);

  const kInicio = coef(mesInicio);
  for (const [codigo, importe] of Object.entries(iniciales.saldos)) {
    if (!esNoMonetaria(codigo) || !importe) continue;
    const deudor =
      datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe;
    sumar(codigo, deudor * (kInicio - 1));
  }
  for (const a of asientos) {
    if (a.fecha <= iniciales.fecha || a.fecha > cierre) continue;
    const k = coef(mesDe(a.fecha));
    if (k === 1) continue;
    for (const l of a.lineas)
      if (esNoMonetaria(l.cuenta))
        sumar(l.cuenta, (l.debe - l.haber) * (k - 1));
  }

  // El capital suscripto y los aportes se muestran a su valor nominal.
  for (const codigo of ["3.1.01.001", "3.1.01.003", "3.1.01.005"]) {
    const a = ajustes.get(codigo);
    if (!a) continue;
    ajustes.delete(codigo);
    sumar(CUENTA_AJUSTE_CAPITAL, a);
  }

  const lineas = [];
  let total = 0;
  for (const [codigo, bruto] of [...ajustes.entries()].sort()) {
    const importe = redondear(bruto);
    ajustes.set(codigo, importe);
    if (!importe) continue;
    total += importe;
    lineas.push({
      cuenta: codigo,
      nombre: nombreCuenta(codigo),
      debe: importe > 0 ? importe : 0,
      haber: importe < 0 ? -importe : 0,
    });
  }
  const recpam = redondear(-total);
  if (recpam)
    lineas.push({
      cuenta: CUENTA_RECPAM,
      nombre: nombreCuenta(CUENTA_RECPAM),
      debe: recpam > 0 ? recpam : 0,
      haber: recpam < 0 ? -recpam : 0,
    });

  const ic = indiceDelMes(indices, mesCierre);
  const ii = indiceDelMes(indices, mesInicio);
  return {
    asiento: {
      fecha: cierre,
      origen: "Cierre",
      descripcion: "Reexpresión en moneda de cierre (RT 6)",
      lineas,
    },
    // Como pérdida va al debe: el resultado del RECPAM es el opuesto.
    recpam: redondear(-recpam),
    coeficienteInicio: kInicio,
    indiceInicio: { mes: ii.mes, valor: ii.valor },
    indiceCierre: ic,
    ajustes,
  };
}
