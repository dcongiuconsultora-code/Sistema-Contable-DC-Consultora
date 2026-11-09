import {
  cuenta as datosCuenta,
  nombreCuenta,
  PLAN_MODELO,
} from "@/lib/plan/plan";
import type { Asiento } from "./diario";
import type { SaldosIniciales } from "./indicadores";

export interface FilaSumasSaldos {
  codigo: string;
  nombre: string;
  /** Saldo al empezar el período (positivo = deudor). */
  anterior: number;
  debe: number;
  haber: number;
  /** Saldo al terminar el período (positivo = deudor). */
  saldo: number;
}

export interface SumasSaldos {
  desde: string;
  hasta: string;
  filas: FilaSumasSaldos[];
  totales: { debe: number; haber: number; deudor: number; acreedor: number };
}

function redondear(n: number) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Balance de sumas y saldos de un período (anual o intermedio): saldo anterior, sumas del debe y
 * del haber del período y saldo final de cada cuenta.
 */
export function sumasYSaldos(
  asientos: Asiento[],
  iniciales: SaldosIniciales,
  desde: string,
  hasta: string,
): SumasSaldos {
  const filas = new Map<string, FilaSumasSaldos>();
  const fila = (codigo: string) => {
    let f = filas.get(codigo);
    if (!f) {
      f = {
        codigo,
        nombre: nombreCuenta(codigo),
        anterior: 0,
        debe: 0,
        haber: 0,
        saldo: 0,
      };
      filas.set(codigo, f);
    }
    return f;
  };
  for (const [codigo, importe] of Object.entries(iniciales.saldos)) {
    if (!importe) continue;
    fila(codigo).anterior +=
      datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe;
  }
  for (const a of asientos) {
    if (a.fecha <= iniciales.fecha || a.fecha > hasta) continue;
    for (const l of a.lineas) {
      const f = fila(l.cuenta);
      if (a.fecha < desde) f.anterior += l.debe - l.haber;
      else {
        f.debe += l.debe;
        f.haber += l.haber;
      }
    }
  }
  const orden = new Map(PLAN_MODELO.map((c, i) => [c.codigo, i]));
  const lista = [...filas.values()]
    .map((f) => ({
      ...f,
      anterior: redondear(f.anterior),
      debe: redondear(f.debe),
      haber: redondear(f.haber),
      saldo: redondear(f.anterior + f.debe - f.haber),
    }))
    .filter((f) => f.anterior || f.debe || f.haber)
    .sort(
      (a, b) =>
        (orden.get(a.codigo) ?? 1e9) - (orden.get(b.codigo) ?? 1e9) ||
        a.codigo.localeCompare(b.codigo),
    );
  const t = { debe: 0, haber: 0, deudor: 0, acreedor: 0 };
  for (const f of lista) {
    t.debe += f.debe;
    t.haber += f.haber;
    if (f.saldo > 0) t.deudor += f.saldo;
    else t.acreedor -= f.saldo;
  }
  return {
    desde,
    hasta,
    filas: lista,
    totales: {
      debe: redondear(t.debe),
      haber: redondear(t.haber),
      deudor: redondear(t.deudor),
      acreedor: redondear(t.acreedor),
    },
  };
}

/** Errores de un asiento manual antes de guardarlo. */
export function revisarAsiento(a: Pick<Asiento, "fecha" | "lineas">): string[] {
  const errores: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) errores.push("Falta la fecha.");
  const lineas = a.lineas.filter((l) => l.cuenta && (l.debe || l.haber));
  if (lineas.length < 2) errores.push("Tiene que tener al menos dos cuentas.");
  for (const l of lineas) {
    const c = PLAN_MODELO.find((x) => x.codigo === l.cuenta);
    if (!c) errores.push(`La cuenta ${l.cuenta} no está en el plan.`);
    else if (!c.imputable)
      errores.push(`${c.nombre} es un rubro: elegí una cuenta.`);
    if (l.debe < 0 || l.haber < 0)
      errores.push("Los importes van en positivo.");
    if (l.debe && l.haber)
      errores.push("Cada renglón va al debe o al haber, no a los dos.");
  }
  const debe = lineas.reduce((s, l) => s + l.debe, 0);
  const haber = lineas.reduce((s, l) => s + l.haber, 0);
  if (Math.abs(debe - haber) > 0.005)
    errores.push(
      `No balancea: debe ${debe.toFixed(2)} y haber ${haber.toFixed(2)}.`,
    );
  return errores;
}

const CUENTAS_IVA_A_FAVOR = [
  "1.1.04.004",
  "1.1.04.005",
  "1.1.04.007",
  "1.1.04.008",
];

/**
 * Refundición de las cuentas de IVA a una fecha: compensa el débito con el crédito, las
 * retenciones y percepciones y el saldo a favor anterior, y deja el IVA a pagar o el saldo a favor.
 */
export function asientoRefundicionIva(
  saldos: Map<string, number>,
): { lineas: Asiento["lineas"] } | null {
  const linea = (cuenta: string, importe: number) => ({
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: importe > 0 ? redondear(importe) : 0,
    haber: importe < 0 ? redondear(-importe) : 0,
  });
  const lineas: Asiento["lineas"] = [];
  let neto = 0;
  const debito = saldos.get("2.1.04.001") ?? 0; // acreedor: negativo
  if (debito) {
    lineas.push(linea("2.1.04.001", -debito));
    neto += debito;
  }
  for (const c of CUENTAS_IVA_A_FAVOR) {
    const s = saldos.get(c) ?? 0;
    if (!s) continue;
    lineas.push(linea(c, -s));
    neto += s;
  }
  if (!lineas.length) return null;
  neto = redondear(neto);
  if (neto < 0)
    lineas.push(linea("2.1.04.002", neto)); // IVA a pagar
  else if (neto > 0) lineas.push(linea("1.1.04.005", neto)); // saldo a favor técnico
  return { lineas: lineas.filter((l) => l.debe || l.haber) };
}
