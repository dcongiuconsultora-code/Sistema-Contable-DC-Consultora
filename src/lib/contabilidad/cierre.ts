import { cuenta as datosCuenta, nombreCuenta } from "@/lib/plan/plan";
import type { Asiento } from "./diario";
import type { EstadosContables, Saldos } from "./estados";
import type { SaldosIniciales } from "./indicadores";

const RESULTADO_DEL_EJERCICIO = "3.2.02.002";
const NO_ASIGNADOS = "3.2.02.001";

function redondear(n: number) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/** Línea que deja la cuenta en cero (el saldo deudor va al haber y el acreedor al debe). */
function cancelar(cuenta: string, saldoDeudor: number) {
  const s = redondear(saldoDeudor);
  return {
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: s < 0 ? -s : 0,
    haber: s > 0 ? s : 0,
  };
}

const esResultado = (c: string) => c.startsWith("4") || c.startsWith("5");

export interface FinDeEjercicio {
  /** Ajustes previos al cierre (reexpresión RT 6, inventario final), ya incluidos en los saldos. */
  ajustes: Asiento[];
  refundicion: Asiento | null;
  cierre: Asiento | null;
  resultado: number;
  /** Saldos de inicio del ejercicio siguiente (el resultado pasa a no asignados). */
  siguiente: SaldosIniciales;
}

/** Asientos de fin de ejercicio a partir de los saldos con que se arma el balance. */
export function finDeEjercicio(e: EstadosContables): FinDeEjercicio {
  const saldos: Saldos = new Map(
    [...e.saldos].filter(([, s]) => Math.abs(s) >= 0.005),
  );

  // Refundición: las cuentas de resultado se cierran contra "Resultado del ejercicio".
  const lineasRef = [...saldos]
    .filter(([c]) => esResultado(c))
    .map(([c, s]) => cancelar(c, s));
  const neto = redondear(lineasRef.reduce((t, l) => t + l.debe - l.haber, 0));
  // neto > 0: se debitó más (cancelando ganancias) → ganancia, va al haber del PN.
  if (neto) lineasRef.push(cancelar(RESULTADO_DEL_EJERCICIO, neto));
  const resultado = neto;
  const despues = new Map([...saldos].filter(([c]) => !esResultado(c)));
  if (neto)
    despues.set(
      RESULTADO_DEL_EJERCICIO,
      redondear((despues.get(RESULTADO_DEL_EJERCICIO) ?? 0) - neto),
    );

  const ordenar = (l: Asiento["lineas"]) =>
    l
      .filter((x) => x.debe || x.haber)
      .sort(
        (a, b) =>
          (a.debe ? 0 : 1) - (b.debe ? 0 : 1) ||
          a.cuenta.localeCompare(b.cuenta),
      );

  const refundicion: Asiento | null = lineasRef.length
    ? {
        fecha: e.cierre,
        origen: "Cierre",
        descripcion: "Refundición de cuentas de resultado",
        lineas: ordenar(lineasRef),
      }
    : null;

  // Cierre: se cancelan todas las cuentas patrimoniales.
  const lineasCierre = [...despues]
    .filter(([, s]) => Math.abs(s) >= 0.005)
    .map(([c, s]) => cancelar(c, s));
  const cierre: Asiento | null = lineasCierre.length
    ? {
        fecha: e.cierre,
        origen: "Cierre",
        descripcion: "Asiento de cierre del ejercicio",
        lineas: ordenar(lineasCierre),
      }
    : null;

  // Apertura del ejercicio siguiente: el resultado se acumula en no asignados.
  const apertura = new Map(despues);
  const rdo = apertura.get(RESULTADO_DEL_EJERCICIO) ?? 0;
  if (rdo) {
    apertura.delete(RESULTADO_DEL_EJERCICIO);
    apertura.set(
      NO_ASIGNADOS,
      redondear((apertura.get(NO_ASIGNADOS) ?? 0) + rdo),
    );
  }
  const siguiente: SaldosIniciales = { fecha: e.cierre, saldos: {} };
  for (const [c, deudor] of apertura) {
    const natural =
      datosCuenta(c).naturaleza === "Acreedora" ? -deudor : deudor;
    if (Math.abs(natural) >= 0.005) siguiente.saldos[c] = redondear(natural);
  }

  return {
    ajustes: e.asientosDeCierre,
    refundicion,
    cierre,
    resultado,
    siguiente,
  };
}
