import { coeficiente, type Indices, mesDe } from "@/lib/inflacion/indices";
import { cuenta as datosCuenta, nombreCuenta } from "@/lib/plan/plan";
import type { Asiento } from "./diario";
import { mayor, type SaldosIniciales } from "./indicadores";
import { type Reexpresion, reexpresar } from "./reexpresion";

/** Saldos con signo: positivo = deudor, negativo = acreedor. */
export type Saldos = Map<string, number>;

const CUENTA_COSTO_EXISTENCIAS = "5.1.01.001";

function redondear(n: number) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r;
}

export function bajo(codigo: string, prefijo: string) {
  return codigo === prefijo || codigo.startsWith(`${prefijo}.`);
}

export function enAlguna(codigo: string, prefijos: string[]) {
  return prefijos.some((p) => bajo(codigo, p));
}

/** Suma de saldos deudores de las cuentas bajo los prefijos (salvo las excluidas). */
export function sumar(
  saldos: Saldos,
  prefijos: string[],
  excluir: string[] = [],
) {
  let total = 0;
  for (const [codigo, saldo] of saldos)
    if (enAlguna(codigo, prefijos) && !enAlguna(codigo, excluir))
      total += saldo;
  return redondear(total);
}

// Rubros del estado de situación patrimonial (modelo RT 54) ----------------------------------------

export type Lado = "AC" | "ANC" | "PC" | "PNC";

export interface DefRubro {
  clave: string;
  nombre: string;
  lado: Lado;
  incluye: string[];
  excluye?: string[];
}

const PARTES_RELACIONADAS_ACTIVO = ["1.1.04.023", "1.1.04.024", "1.1.04.025"];
const CREDITOS_IMPOSITIVOS = [
  "1.1.04.004",
  "1.1.04.005",
  "1.1.04.006",
  "1.1.04.007",
  "1.1.04.008",
  "1.1.04.009",
  "1.1.04.010",
  "1.1.04.011",
  "1.1.04.012",
  "1.1.04.013",
  "1.1.04.014",
  "1.1.04.015",
  "1.1.04.016",
  "1.1.04.017",
  "1.1.04.018",
];
const PARTES_RELACIONADAS_PASIVO = [
  "2.1.02.004",
  "2.1.06",
  "2.1.07.001",
  "2.1.07.002",
  "2.1.07.003",
];

export const RUBROS_ESP: DefRubro[] = [
  { clave: "caja", nombre: "Caja y bancos", lado: "AC", incluye: ["1.1.01"] },
  {
    clave: "inversiones",
    nombre: "Inversiones financieras",
    lado: "AC",
    incluye: ["1.1.02"],
  },
  {
    clave: "clientes",
    nombre: "Cuentas por cobrar a clientes en moneda",
    lado: "AC",
    incluye: ["1.1.03"],
  },
  {
    clave: "impositivos",
    nombre: "Créditos impositivos",
    lado: "AC",
    incluye: CREDITOS_IMPOSITIVOS,
  },
  {
    clave: "relacionadas",
    nombre: "Créditos en moneda con partes relacionadas",
    lado: "AC",
    incluye: PARTES_RELACIONADAS_ACTIVO,
  },
  {
    clave: "otrosCreditos",
    nombre: "Otras cuentas por cobrar en moneda",
    lado: "AC",
    incluye: ["1.1.04", "1.1.06"],
    excluye: [...CREDITOS_IMPOSITIVOS, ...PARTES_RELACIONADAS_ACTIVO],
  },
  {
    clave: "bienesCambio",
    nombre: "Bienes de cambio",
    lado: "AC",
    incluye: ["1.1.05"],
  },
  {
    clave: "inversiones",
    nombre: "Inversiones financieras",
    lado: "ANC",
    incluye: ["1.2.03.001", "1.2.03.004", "1.2.04"],
  },
  {
    clave: "clientes",
    nombre: "Cuentas por cobrar a clientes en moneda",
    lado: "ANC",
    incluye: ["1.2.01"],
  },
  {
    clave: "impositivos",
    nombre: "Créditos impositivos",
    lado: "ANC",
    incluye: ["1.2.02.001", "1.2.02.004"],
  },
  {
    clave: "relacionadas",
    nombre: "Créditos en moneda con partes relacionadas",
    lado: "ANC",
    incluye: ["1.2.02.003"],
  },
  {
    clave: "otrosCreditos",
    nombre: "Otras cuentas por cobrar en moneda",
    lado: "ANC",
    incluye: ["1.2.02.002"],
  },
  {
    clave: "bienesCambio",
    nombre: "Bienes de cambio",
    lado: "ANC",
    incluye: [],
  },
  {
    clave: "bienesUso",
    nombre: "Bienes de uso",
    lado: "ANC",
    incluye: ["1.2.05"],
  },
  {
    clave: "propiedadesInversion",
    nombre: "Propiedades de inversión",
    lado: "ANC",
    incluye: ["1.2.03.002", "1.2.03.003"],
  },
  {
    clave: "intangibles",
    nombre: "Activos intangibles",
    lado: "ANC",
    incluye: ["1.2.06", "1.2.07"],
  },
  {
    clave: "proveedores",
    nombre: "Proveedores de bienes y servicios",
    lado: "PC",
    incluye: ["2.1.01"],
  },
  {
    clave: "prestamos",
    nombre: "Préstamos y otros pasivos financieros",
    lado: "PC",
    incluye: ["2.1.02"],
    excluye: ["2.1.02.004"],
  },
  {
    clave: "fiscales",
    nombre: "Deudas fiscales",
    lado: "PC",
    incluye: ["2.1.04"],
  },
  {
    clave: "laborales",
    nombre: "Deudas laborales y previsionales",
    lado: "PC",
    incluye: ["2.1.03"],
  },
  {
    clave: "especie",
    nombre: "Deudas en especie",
    lado: "PC",
    incluye: ["2.1.05"],
  },
  {
    clave: "relacionadas",
    nombre: "Deudas en moneda con partes relacionadas",
    lado: "PC",
    incluye: PARTES_RELACIONADAS_PASIVO,
  },
  {
    clave: "previsiones",
    nombre: "Previsiones",
    lado: "PC",
    incluye: ["2.1.08"],
  },
  {
    clave: "otrasDeudas",
    nombre: "Otras deudas",
    lado: "PC",
    incluye: ["2.1.07"],
    excluye: PARTES_RELACIONADAS_PASIVO,
  },
  {
    clave: "proveedores",
    nombre: "Proveedores de bienes y servicios",
    lado: "PNC",
    incluye: ["2.2.01"],
  },
  {
    clave: "prestamos",
    nombre: "Préstamos y otros pasivos financieros",
    lado: "PNC",
    incluye: ["2.2.02"],
    excluye: ["2.2.02.003"],
  },
  {
    clave: "fiscales",
    nombre: "Deudas fiscales",
    lado: "PNC",
    incluye: ["2.2.03"],
  },
  {
    clave: "laborales",
    nombre: "Deudas laborales y previsionales",
    lado: "PNC",
    incluye: [],
  },
  {
    clave: "especie",
    nombre: "Deudas en especie",
    lado: "PNC",
    incluye: [],
  },
  {
    clave: "relacionadas",
    nombre: "Deudas en moneda con partes relacionadas",
    lado: "PNC",
    incluye: ["2.2.02.003", "2.2.04.001"],
  },
  {
    clave: "previsiones",
    nombre: "Previsiones",
    lado: "PNC",
    incluye: ["2.2.05"],
  },
  {
    clave: "otrasDeudas",
    nombre: "Otras deudas",
    lado: "PNC",
    incluye: ["2.2.04.002"],
  },
];

export interface DetalleCuenta {
  codigo: string;
  nombre: string;
  actual: number;
  anterior: number;
}

export interface Renglon {
  clave: string;
  nombre: string;
  actual: number;
  anterior: number | null;
  cuentas: DetalleCuenta[];
}

function detalle(
  actual: Saldos,
  anterior: Saldos,
  incluye: string[],
  excluye: string[],
  signo: 1 | -1,
): DetalleCuenta[] {
  const codigos = new Set(
    [...actual.keys(), ...anterior.keys()].filter(
      (c) => enAlguna(c, incluye) && !enAlguna(c, excluye),
    ),
  );
  return [...codigos]
    .sort()
    .map((codigo) => ({
      codigo,
      nombre: nombreCuenta(codigo),
      actual: redondear(signo * (actual.get(codigo) ?? 0)),
      anterior: redondear(signo * (anterior.get(codigo) ?? 0)),
    }))
    .filter((d) => d.actual !== 0 || d.anterior !== 0);
}

function renglon(
  clave: string,
  nombre: string,
  actual: Saldos,
  anterior: Saldos | null,
  incluye: string[],
  excluye: string[] = [],
  signo: 1 | -1 = 1,
): Renglon {
  return {
    clave,
    nombre,
    actual: redondear(signo * sumar(actual, incluye, excluye)),
    anterior: anterior
      ? redondear(signo * sumar(anterior, incluye, excluye))
      : null,
    cuentas: detalle(actual, anterior ?? new Map(), incluye, excluye, signo),
  };
}

// Estado de resultados -----------------------------------------------------------------------------

export const RENGLONES_ER: {
  clave: string;
  nombre: string;
  incluye: string[];
}[] = [
  {
    clave: "ventas",
    nombre: "Ingresos netos por ventas de bienes y servicios",
    incluye: ["4.1"],
  },
  {
    clave: "costo",
    nombre: "Costo de los bienes vendidos y servicios prestados",
    incluye: ["5.1"],
  },
  {
    clave: "comercializacion",
    nombre: "Gastos de comercialización",
    incluye: ["5.2"],
  },
  {
    clave: "administracion",
    nombre: "Gastos de administración",
    incluye: ["5.3"],
  },
  {
    clave: "financieros",
    nombre: "Resultados financieros y por tenencia (incluido el RECPAM)",
    incluye: ["4.2.01", "5.4"],
  },
  {
    clave: "otros",
    nombre: "Otros ingresos y egresos",
    incluye: ["4.2.02", "5.5"],
  },
  {
    clave: "impuesto",
    nombre: "Impuesto a las ganancias",
    incluye: ["5.6"],
  },
];

// Evolución del patrimonio neto --------------------------------------------------------------------

export const COLUMNAS_PN = {
  capital: ["3.1.01.001", "3.1.01.004", "3.1.01.005"],
  ajusteCapital: ["3.1.01.002"],
  aportes: ["3.1.01.003"],
  reservaLegal: ["3.2.01.001"],
  otrasReservas: ["3.2.01.002", "3.2.01.003", "3.2.03"],
  noAsignados: ["3.2.02"],
} as const;
export type ColumnaPN = keyof typeof COLUMNAS_PN;

// Flujo de efectivo (método directo) ---------------------------------------------------------------

export type FilaFlujo =
  | "cobrosVentas"
  | "pagosProveedores"
  | "pagosPersonal"
  | "pagosImpuestos"
  | "pagosDividendos"
  | "cobrosIntereses"
  | "pagosIntereses"
  | "pagosGanancias"
  | "otrosOperativos"
  | "pagosBienesUso"
  | "cobrosBienesUso"
  | "pagosIntangibles"
  | "cobrosIntangibles"
  | "pagosInversiones"
  | "cobrosInversiones"
  | "aportes"
  | "cobrosPrestamos"
  | "pagosPrestamos";

const SOCIOS = [
  "1.1.04.023",
  "1.1.04.024",
  "1.1.04.025",
  "1.2.02.003",
  "2.1.02.004",
  "2.1.07.001",
  "2.1.07.002",
  "2.1.07.003",
  "2.2.02.003",
  "2.2.04.001",
];
const PERSONAL = [
  "2.1.03",
  "1.1.04.002",
  "1.1.04.003",
  "5.1.01.009",
  "5.1.01.010",
  "5.2.01.001",
  "5.2.01.002",
  "5.3.01.001",
  "5.3.01.002",
  "5.3.01.003",
  "5.3.01.004",
];
const GASTOS_IMPUESTOS = [
  "5.2.01.006",
  "5.2.01.007",
  "5.3.01.021",
  "5.3.01.022",
  "5.3.01.023",
];

/** Por qué entró o salió la plata en un asiento que mueve caja y bancos. */
function causaDelFlujo(cuentas: string[], neto: number): FilaFlujo {
  const hay = (prefijos: string[], excluir: string[] = []) =>
    cuentas.some((c) => enAlguna(c, prefijos) && !enAlguna(c, excluir));
  const entra = neto > 0;
  if (
    hay([
      "2.1.04.005",
      "1.1.04.009",
      "1.1.04.010",
      "1.1.04.011",
      "1.1.04.012",
      "5.6",
    ])
  )
    return "pagosGanancias";
  if (hay(PERSONAL)) return "pagosPersonal";
  if (hay(["4.1", "1.1.03", "1.2.01", "2.1.05"])) return "cobrosVentas";
  if (
    hay(
      [
        "2.1.01",
        "2.2.01",
        "5.1",
        "5.2",
        "5.3",
        "1.1.04.001",
        "1.1.05",
        "1.1.04.019",
        "1.1.04.020",
        "1.1.04.021",
      ],
      GASTOS_IMPUESTOS,
    )
  )
    return "pagosProveedores";
  if (
    hay(
      ["2.1.04", "2.2.03", "1.1.04", ...GASTOS_IMPUESTOS],
      [...SOCIOS, "1.1.04.026", "1.1.04.022"],
    )
  )
    return "pagosImpuestos";
  if (hay(["4.2.01.001", "4.2.01.002"])) return "cobrosIntereses";
  if (hay(["5.4"])) return "pagosIntereses";
  if (hay(["1.2.05", "1.2.03.002", "1.2.03.003"]))
    return entra ? "cobrosBienesUso" : "pagosBienesUso";
  if (hay(["1.2.06", "1.2.07"]))
    return entra ? "cobrosIntangibles" : "pagosIntangibles";
  if (hay(["1.1.02", "1.2.03", "1.2.04"]))
    return entra ? "cobrosInversiones" : "pagosInversiones";
  if (hay(["3.1"])) return "aportes";
  if (hay(["2.1.06.001", "3.2"])) return "pagosDividendos";
  if (hay(["2.1.02", "2.2.02", ...SOCIOS]))
    return entra ? "cobrosPrestamos" : "pagosPrestamos";
  return "otrosOperativos";
}

export const ACTIVIDAD_FLUJO: Record<
  FilaFlujo,
  "operativas" | "inversion" | "financiacion"
> = {
  cobrosVentas: "operativas",
  pagosProveedores: "operativas",
  pagosPersonal: "operativas",
  pagosImpuestos: "operativas",
  pagosDividendos: "operativas",
  cobrosIntereses: "operativas",
  pagosIntereses: "operativas",
  pagosGanancias: "operativas",
  otrosOperativos: "operativas",
  pagosBienesUso: "inversion",
  cobrosBienesUso: "inversion",
  pagosIntangibles: "inversion",
  cobrosIntangibles: "inversion",
  pagosInversiones: "inversion",
  cobrosInversiones: "inversion",
  aportes: "financiacion",
  cobrosPrestamos: "financiacion",
  pagosPrestamos: "financiacion",
};

// Cálculo de los estados ---------------------------------------------------------------------------

export interface ParametrosEstados {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  /** Fecha de cierre del ejercicio (AAAA-MM-DD). */
  cierre: string;
  /** Con índices, todo se expresa en moneda de cierre (RT 6); sin ellos, en cifras históricas. */
  indices?: Indices | null;
  /** Inventario final por cuenta de bienes de cambio (1.1.05.xxx), a valores de cierre. */
  existenciaFinal?: Record<string, number>;
}

export interface EstadosContables {
  inicio: string;
  cierre: string;
  cierreAnterior: string;
  enMonedaHomogenea: boolean;
  reexpresion: Reexpresion | null;
  /** Saldos al cierre y del cierre anterior (este, reexpresado a moneda de cierre si corresponde). */
  saldos: Saldos;
  saldosAnterior: Saldos;
  rubros: Record<Lado, Renglon[]>;
  totales: {
    activoCorriente: [number, number];
    activoNoCorriente: [number, number];
    activo: [number, number];
    pasivoCorriente: [number, number];
    pasivoNoCorriente: [number, number];
    pasivo: [number, number];
    patrimonioNeto: [number, number];
  };
  resultados: Renglon[];
  gananciaBruta: number;
  resultadoAntesDeImpuesto: number;
  resultado: number;
  patrimonio: {
    inicio: Record<ColumnaPN, number>;
    cierre: Record<ColumnaPN, number>;
  };
  flujo: {
    inicio: number;
    cierre: number;
    filas: Record<FilaFlujo, number>;
    /** Resultado por exposición a la inflación del efectivo (en moneda homogénea). */
    resultadosDelEfectivo: number;
  };
  /** Activo − pasivo − patrimonio neto: debe dar 0. */
  diferencia: number;
  /** Asientos que agrega el cierre (reexpresión, inventario final). */
  asientosDeCierre: Asiento[];
}

function diaSiguiente(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function lineaDe(cuenta: string, importe: number) {
  const i = redondear(importe);
  return {
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: i > 0 ? i : 0,
    haber: i < 0 ? -i : 0,
  };
}

/** Saldos del cierre anterior en moneda de cierre (el capital, a valor nominal). */
function saldosAnteriores(iniciales: SaldosIniciales, k: number): Saldos {
  const s: Saldos = new Map();
  for (const [codigo, importe] of Object.entries(iniciales.saldos)) {
    if (!importe) continue;
    const deudor =
      datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe;
    s.set(codigo, deudor);
  }
  if (k === 1) return s;
  let ajusteCapital = 0;
  for (const [codigo, saldo] of s) {
    if (["3.1.01.001", "3.1.01.003", "3.1.01.005"].includes(codigo))
      ajusteCapital += saldo * (k - 1);
    else s.set(codigo, redondear(saldo * k));
  }
  if (ajusteCapital)
    s.set("3.1.01.002", redondear((s.get("3.1.01.002") ?? 0) + ajusteCapital));
  return s;
}

function resultadoDe(s: Saldos) {
  return redondear(-(sumar(s, ["4"]) + sumar(s, ["5"])));
}

function columnasPN(s: Saldos, resultado: number): Record<ColumnaPN, number> {
  const cols = Object.fromEntries(
    Object.entries(COLUMNAS_PN).map(([c, prefijos]) => [
      c,
      redondear(-sumar(s, [...prefijos])),
    ]),
  ) as Record<ColumnaPN, number>;
  // Los resultados que todavía no se cerraron forman parte de los no asignados.
  cols.noAsignados = redondear(cols.noAsignados + resultado);
  return cols;
}

export function calcularEstados(p: ParametrosEstados): EstadosContables {
  const { iniciales, cierre } = p;
  const inicio = diaSiguiente(iniciales.fecha);
  const delEjercicio = p.asientos.filter(
    (a) => a.fecha > iniciales.fecha && a.fecha <= cierre,
  );
  const asientosDeCierre: Asiento[] = [];

  const reexpresion = p.indices
    ? reexpresar(delEjercicio, iniciales, cierre, p.indices)
    : null;
  if (reexpresion?.asiento.lineas.length)
    asientosDeCierre.push(reexpresion.asiento);

  if (p.existenciaFinal && Object.keys(p.existenciaFinal).length) {
    const previos = mayor(
      [...delEjercicio, ...asientosDeCierre],
      iniciales,
      cierre,
    );
    const lineas = [];
    let total = 0;
    for (const [codigo, valor] of Object.entries(p.existenciaFinal)) {
      const dif = redondear(valor - (previos.get(codigo) ?? 0));
      if (!dif) continue;
      lineas.push(lineaDe(codigo, dif));
      total += dif;
    }
    if (lineas.length) {
      lineas.push(lineaDe(CUENTA_COSTO_EXISTENCIAS, -total));
      asientosDeCierre.push({
        fecha: cierre,
        origen: "Cierre",
        descripcion: "Existencia final de bienes de cambio",
        lineas,
      });
    }
  }

  const todos = [...delEjercicio, ...asientosDeCierre];
  const saldos = mayor(todos, iniciales, cierre);
  const k = reexpresion?.coeficienteInicio ?? 1;
  const anterior = saldosAnteriores(iniciales, k);

  const rubros = { AC: [], ANC: [], PC: [], PNC: [] } as Record<
    Lado,
    Renglon[]
  >;
  for (const r of RUBROS_ESP) {
    const signo = r.lado === "AC" || r.lado === "ANC" ? 1 : -1;
    rubros[r.lado].push(
      renglon(r.clave, r.nombre, saldos, anterior, r.incluye, r.excluye, signo),
    );
  }
  const total = (lado: Lado, i: 0 | 1) =>
    redondear(
      rubros[lado].reduce(
        (s, r) => s + (i === 0 ? r.actual : (r.anterior ?? 0)),
        0,
      ),
    );
  const par = (lado: Lado): [number, number] => [
    total(lado, 0),
    total(lado, 1),
  ];

  const resultado = resultadoDe(saldos);
  const resultadoAnterior = resultadoDe(anterior);
  const pn: [number, number] = [
    redondear(-sumar(saldos, ["3"]) + resultado),
    redondear(-sumar(anterior, ["3"]) + resultadoAnterior),
  ];
  const ac = par("AC");
  const anc = par("ANC");
  const pc = par("PC");
  const pnc = par("PNC");
  const activo: [number, number] = [
    redondear(ac[0] + anc[0]),
    redondear(ac[1] + anc[1]),
  ];
  const pasivo: [number, number] = [
    redondear(pc[0] + pnc[0]),
    redondear(pc[1] + pnc[1]),
  ];

  const resultados = RENGLONES_ER.map((r) =>
    renglon(r.clave, r.nombre, saldos, null, r.incluye, [], -1),
  );
  const valor = (clave: string) =>
    resultados.find((r) => r.clave === clave)?.actual ?? 0;
  const gananciaBruta = redondear(valor("ventas") + valor("costo"));
  const resultadoAntesDeImpuesto = redondear(
    gananciaBruta +
      valor("comercializacion") +
      valor("administracion") +
      valor("financieros") +
      valor("otros"),
  );

  // Flujo de efectivo: cada asiento que mueve caja y bancos, por su causa.
  const filas = Object.fromEntries(
    Object.keys(ACTIVIDAD_FLUJO).map((f) => [f, 0]),
  ) as Record<FilaFlujo, number>;
  const mesCierre = mesDe(cierre);
  const kMes = (fecha: string) =>
    p.indices ? coeficiente(p.indices, mesDe(fecha), mesCierre) : 1;
  for (const a of delEjercicio) {
    let neto = 0;
    const otras: string[] = [];
    for (const l of a.lineas) {
      if (bajo(l.cuenta, "1.1.01")) neto += l.debe - l.haber;
      else otras.push(l.cuenta);
    }
    neto = redondear(neto);
    if (!neto || !otras.length) continue;
    const fila = causaDelFlujo(otras, neto);
    filas[fila] = redondear(filas[fila] + neto * kMes(a.fecha));
  }
  const efectivoInicio = sumar(anterior, ["1.1.01"]);
  const efectivoCierre = sumar(saldos, ["1.1.01"]);
  const sumaFlujos = Object.values(filas).reduce((s, v) => s + v, 0);
  const resultadosDelEfectivo = redondear(
    efectivoCierre - efectivoInicio - sumaFlujos,
  );

  return {
    inicio,
    cierre,
    cierreAnterior: iniciales.fecha,
    enMonedaHomogenea: Boolean(reexpresion),
    reexpresion,
    saldos,
    saldosAnterior: anterior,
    rubros,
    totales: {
      activoCorriente: ac,
      activoNoCorriente: anc,
      activo,
      pasivoCorriente: pc,
      pasivoNoCorriente: pnc,
      pasivo,
      patrimonioNeto: pn,
    },
    resultados,
    gananciaBruta,
    resultadoAntesDeImpuesto,
    resultado,
    patrimonio: {
      inicio: columnasPN(anterior, resultadoAnterior),
      cierre: columnasPN(saldos, 0),
    },
    flujo: {
      inicio: efectivoInicio,
      cierre: efectivoCierre,
      filas,
      resultadosDelEfectivo,
    },
    diferencia: redondear(activo[0] - pasivo[0] - pn[0]),
    asientosDeCierre,
  };
}

/** Saldo de un grupo de cuentas en el cierre y en el anterior, con el signo del rubro. */
export function saldoGrupo(
  e: EstadosContables,
  incluye: string[],
  excluye: string[] = [],
  signo: 1 | -1 = 1,
): [number, number] {
  return [
    redondear(signo * sumar(e.saldos, incluye, excluye)),
    redondear(signo * sumar(e.saldosAnterior, incluye, excluye)),
  ];
}

/** Movimientos del ejercicio de un grupo de cuentas, separados en debe y haber. */
export function movimientosGrupo(
  asientos: Asiento[],
  desde: string,
  hasta: string,
  incluye: string[],
  coef: (fecha: string) => number = () => 1,
) {
  let debe = 0;
  let haber = 0;
  for (const a of asientos) {
    if (a.fecha < desde || a.fecha > hasta || a.origen === "Cierre") continue;
    const k = coef(a.fecha);
    for (const l of a.lineas)
      if (enAlguna(l.cuenta, incluye)) {
        debe += l.debe * k;
        haber += l.haber * k;
      }
  }
  return { debe: redondear(debe), haber: redondear(haber) };
}
