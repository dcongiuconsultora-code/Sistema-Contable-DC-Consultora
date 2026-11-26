// Varios resúmenes bancarios por empresa: distintos bancos y distintos meses. Se juntan en uno
// solo para conciliar y para la contabilidad, sin duplicar movimientos.
import type {
  CuentaBancaria,
  MovimientoBancario,
  ResumenBancario,
} from "./tipos";

export interface ResumenCargado {
  /** Id del archivo guardado (sin id: todavía no se guardó). */
  id?: string;
  nombre: string;
  resumen: ResumenBancario;
}

export const claveCuenta = (c: Pick<CuentaBancaria, "banco" | "numero">) =>
  `${c.banco}|${c.numero}`;

/** Mismo banco, mismas cuentas y mismo período: es el mismo resumen subido otra vez. */
export function mismoResumen(a: ResumenBancario, b: ResumenBancario) {
  const cuentas = (r: ResumenBancario) =>
    r.cuentas.map(claveCuenta).sort().join(",");
  return (
    a.banco === b.banco &&
    a.desde === b.desde &&
    a.hasta === b.hasta &&
    cuentas(a) === cuentas(b)
  );
}

const claveMov = (m: MovimientoBancario) =>
  `${m.fecha}|${m.importe}|${m.descripcion}|${m.referencia}|${m.saldo ?? ""}`;

/** Junta todos los resúmenes: una cuenta por banco y número, con los movimientos de todos los meses. */
export function consolidar(lista: ResumenCargado[]): ResumenBancario | null {
  if (!lista.length) return null;
  const ordenados = [...lista].sort((a, b) =>
    (a.resumen.desde ?? "").localeCompare(b.resumen.desde ?? ""),
  );
  const cuentas = new Map<string, CuentaBancaria & { vistos: Set<string> }>();
  for (const { resumen } of ordenados)
    for (const c of resumen.cuentas) {
      const k = claveCuenta(c);
      let acc = cuentas.get(k);
      if (!acc) {
        acc = {
          ...c,
          movimientos: [],
          impuestoDebitosCreditos: 0,
          vistos: new Set(),
        };
        cuentas.set(k, acc);
      }
      for (const m of c.movimientos) {
        const km = claveMov(m);
        if (acc.vistos.has(km)) continue;
        acc.vistos.add(km);
        acc.movimientos.push(m);
      }
      acc.saldoFinal = c.saldoFinal ?? acc.saldoFinal;
      acc.impuestoDebitosCreditos =
        Math.round(
          ((acc.impuestoDebitosCreditos ?? 0) +
            (c.impuestoDebitosCreditos ?? 0)) *
            100,
        ) / 100;
    }
  // El mismo número de cuenta en dos bancos distintos: se distingue con el banco.
  const numeros = new Map<string, number>();
  for (const c of cuentas.values())
    numeros.set(c.numero, (numeros.get(c.numero) ?? 0) + 1);
  const desdes = lista
    .map((r) => r.resumen.desde)
    .filter((x): x is string => Boolean(x))
    .sort();
  const hastas = lista
    .map((r) => r.resumen.hasta)
    .filter((x): x is string => Boolean(x))
    .sort();
  return {
    banco: [...new Set(lista.map((r) => r.resumen.banco))].join(", "),
    titular: ordenados.at(-1)!.resumen.titular,
    cuit: ordenados.at(-1)!.resumen.cuit,
    desde: desdes[0] ?? null,
    hasta: hastas.at(-1) ?? null,
    controles: lista.flatMap((r) =>
      r.resumen.controles.map((c) => `${r.nombre}: ${c}`),
    ),
    cuentas: [...cuentas.values()].map(({ vistos: _, ...c }) => ({
      ...c,
      numero:
        (numeros.get(c.numero) ?? 0) > 1 ? `${c.banco} ${c.numero}` : c.numero,
      movimientos: [...c.movimientos].sort((a, b) =>
        a.fecha.localeCompare(b.fecha),
      ),
    })),
  };
}

/** Meses (AAAA-MM) entre dos fechas, inclusive. */
export function mesesEntre(desde: string, hasta: string): string[] {
  const r: string[] = [];
  let [a, m] = desde.slice(0, 7).split("-").map(Number);
  const fin = hasta.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    if (mes > fin) break;
    r.push(mes);
    m++;
    if (m === 13) {
      m = 1;
      a++;
    }
  }
  return r;
}

export interface CoberturaCuenta {
  clave: string;
  banco: string;
  tipo: string;
  numero: string;
  /** Meses con resumen cargado. */
  meses: Set<string>;
}

/** Qué meses tiene cargados cada cuenta, para ver de un vistazo qué resumen falta. */
export function cobertura(lista: ResumenCargado[]): {
  cuentas: CoberturaCuenta[];
  meses: string[];
} {
  const cuentas = new Map<string, CoberturaCuenta>();
  const todos = new Set<string>();
  for (const { resumen } of lista) {
    const fechas = resumen.cuentas
      .flatMap((c) => c.movimientos.map((m) => m.fecha))
      .sort();
    const desde = resumen.desde ?? fechas[0];
    const hasta = resumen.hasta ?? fechas.at(-1);
    const meses = desde && hasta ? mesesEntre(desde, hasta) : [];
    for (const c of resumen.cuentas) {
      const k = claveCuenta(c);
      const acc = cuentas.get(k) ?? {
        clave: k,
        banco: c.banco,
        tipo: c.tipo,
        numero: c.numero,
        meses: new Set<string>(),
      };
      for (const m of meses) {
        acc.meses.add(m);
        todos.add(m);
      }
      cuentas.set(k, acc);
    }
  }
  const ordenados = [...todos].sort();
  const meses = ordenados.length
    ? mesesEntre(ordenados[0], ordenados.at(-1)!)
    : [];
  return { cuentas: [...cuentas.values()], meses: meses.slice(-24) };
}

/** Solo los movimientos de un mes y/o de una cuenta (para mirar y conciliar por partes). */
export function filtrar(
  r: ResumenBancario,
  f: { mes?: string | null; cuenta?: string | null },
): ResumenBancario {
  const cuentas = r.cuentas
    .filter((c) => !f.cuenta || c.numero === f.cuenta)
    .map((c) => ({
      ...c,
      movimientos: f.mes
        ? c.movimientos.filter((m) => m.fecha.startsWith(f.mes!))
        : c.movimientos,
    }));
  if (!f.mes) return { ...r, cuentas };
  const [a, m] = f.mes.split("-").map(Number);
  const fin = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { ...r, cuentas, desde: `${f.mes}-01`, hasta: fin };
}
