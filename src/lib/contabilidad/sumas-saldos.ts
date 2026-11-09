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

export interface RenglonMayor {
  fecha: string;
  origen: Asiento["origen"];
  descripcion: string;
  debe: number;
  haber: number;
  saldo: number;
}

/** Libro mayor de una cuenta: saldo anterior y cada movimiento con el saldo acumulado. */
export function mayorDeCuenta(
  asientos: Asiento[],
  iniciales: SaldosIniciales,
  codigo: string,
  desde: string,
  hasta: string,
) {
  const inicial = iniciales.saldos[codigo] ?? 0;
  let anterior =
    datosCuenta(codigo).naturaleza === "Acreedora" ? -inicial : inicial;
  const renglones: RenglonMayor[] = [];
  const ordenados = [...asientos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha),
  );
  let saldo = 0;
  let debe = 0;
  let haber = 0;
  for (const a of ordenados) {
    if (a.fecha <= iniciales.fecha || a.fecha > hasta) continue;
    for (const l of a.lineas) {
      if (l.cuenta !== codigo) continue;
      if (a.fecha < desde) {
        anterior += l.debe - l.haber;
        continue;
      }
      debe += l.debe;
      haber += l.haber;
      renglones.push({
        fecha: a.fecha,
        origen: a.origen,
        descripcion: [a.descripcion, l.detalle].filter(Boolean).join(" · "),
        debe: l.debe,
        haber: l.haber,
        saldo: 0,
      });
    }
  }
  anterior = redondear(anterior);
  saldo = anterior;
  for (const r of renglones) {
    saldo = redondear(saldo + r.debe - r.haber);
    r.saldo = saldo;
  }
  return {
    codigo,
    anterior,
    renglones,
    debe: redondear(debe),
    haber: redondear(haber),
    saldo,
  };
}

/** Renglones del estado de resultados mes por mes. */
export const RENGLONES_MENSUALES: {
  clave: string;
  nombre: string;
  prefijos: string[];
  total?: boolean;
}[] = [
  { clave: "ventas", nombre: "Ventas netas", prefijos: ["4.1"] },
  { clave: "costo", nombre: "Costo de ventas", prefijos: ["5.1"] },
  {
    clave: "bruta",
    nombre: "Ganancia bruta",
    prefijos: ["4.1", "5.1"],
    total: true,
  },
  {
    clave: "comercializacion",
    nombre: "Gastos de comercialización",
    prefijos: ["5.2"],
  },
  {
    clave: "administracion",
    nombre: "Gastos de administración",
    prefijos: ["5.3"],
  },
  {
    clave: "financieros",
    nombre: "Resultados financieros",
    prefijos: ["4.2.01", "5.4"],
  },
  {
    clave: "otros",
    nombre: "Otros ingresos y egresos",
    prefijos: ["4.2.02", "5.5"],
  },
  { clave: "impuesto", nombre: "Impuesto a las ganancias", prefijos: ["5.6"] },
  {
    clave: "resultado",
    nombre: "Resultado",
    prefijos: ["4", "5"],
    total: true,
  },
];

/** Estado de resultados por mes (positivo = ganancia), para ver la evolución en el año. */
export function resultadosMensuales(
  asientos: Asiento[],
  desde: string,
  hasta: string,
) {
  const meses: string[] = [];
  for (
    let m = desde.slice(0, 7);
    m <= hasta.slice(0, 7) && meses.length < 24;
  ) {
    meses.push(m);
    const [a, n] = m.split("-").map(Number);
    m = n === 12 ? `${a + 1}-01` : `${a}-${String(n + 1).padStart(2, "0")}`;
  }
  const valores = RENGLONES_MENSUALES.map(() => meses.map(() => 0));
  const bajo = (c: string, p: string) => c === p || c.startsWith(`${p}.`);
  for (const a of asientos) {
    if (a.fecha < desde || a.fecha > hasta) continue;
    const i = meses.indexOf(a.fecha.slice(0, 7));
    if (i < 0) continue;
    for (const l of a.lineas)
      RENGLONES_MENSUALES.forEach((r, j) => {
        if (r.prefijos.some((p) => bajo(l.cuenta, p)))
          valores[j][i] += l.haber - l.debe;
      });
  }
  return {
    meses,
    filas: RENGLONES_MENSUALES.map((r, j) => ({
      ...r,
      valores: valores[j].map(redondear),
      total: redondear(valores[j].reduce((s, v) => s + v, 0)),
    })),
  };
}

export interface DiaCaja {
  fecha: string;
  entradas: number;
  salidas: number;
  saldo: number;
  movimientos: {
    descripcion: string;
    cuenta: string;
    importe: number;
    origen: Asiento["origen"];
  }[];
}

/**
 * Caja y bancos día por día: saldo inicial, lo que entró y salió cada día y el saldo al final del
 * día. `cuentas` limita a algunas cuentas de 1.1.01 (todas si está vacío); `unidad` a una unidad
 * de negocio (undefined = toda la empresa).
 */
export function cajaDiaria(
  asientos: Asiento[],
  iniciales: SaldosIniciales,
  desde: string,
  hasta: string,
  cuentas: string[] = [],
  unidad?: string | null,
) {
  const esCaja = (c: string) =>
    c.startsWith("1.1.01.") && (!cuentas.length || cuentas.includes(c));
  const deLaUnidad = (a: Asiento) =>
    unidad === undefined || (a.unidad ?? null) === unidad;
  // El saldo inicial por unidad no se conoce: solo se usa el de inicio para toda la empresa.
  let inicial =
    unidad === undefined
      ? Object.entries(iniciales.saldos)
          .filter(([c]) => esCaja(c))
          .reduce((s, [, v]) => s + v, 0)
      : 0;
  const dias = new Map<string, DiaCaja>();
  for (const a of asientos) {
    if (a.fecha <= iniciales.fecha || a.fecha > hasta || !deLaUnidad(a))
      continue;
    const neto = a.lineas
      .filter((l) => esCaja(l.cuenta))
      .reduce((s, l) => s + l.debe - l.haber, 0);
    if (Math.abs(neto) < 0.005) continue;
    if (a.fecha < desde) {
      inicial += neto;
      continue;
    }
    let d = dias.get(a.fecha);
    if (!d) {
      d = {
        fecha: a.fecha,
        entradas: 0,
        salidas: 0,
        saldo: 0,
        movimientos: [],
      };
      dias.set(a.fecha, d);
    }
    if (neto > 0) d.entradas += neto;
    else d.salidas -= neto;
    const contra = a.lineas.find((l) => !l.cuenta.startsWith("1.1.01."));
    d.movimientos.push({
      descripcion: a.descripcion,
      cuenta: contra?.nombre ?? "Entre cuentas",
      importe: redondear(neto),
      origen: a.origen,
    });
  }
  let saldo = redondear(inicial);
  const lista = [...dias.values()]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((d) => {
      saldo = redondear(saldo + d.entradas - d.salidas);
      return {
        ...d,
        entradas: redondear(d.entradas),
        salidas: redondear(d.salidas),
        saldo,
      };
    });
  return {
    inicial: redondear(inicial),
    dias: lista,
    entradas: redondear(lista.reduce((s, d) => s + d.entradas, 0)),
    salidas: redondear(lista.reduce((s, d) => s + d.salidas, 0)),
    final: saldo,
  };
}
