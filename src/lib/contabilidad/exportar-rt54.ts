import type { Cell, Workbook, Worksheet } from "exceljs";
import { coeficiente, type Indices, mesDe } from "@/lib/inflacion/indices";
import { cuitConGuiones } from "@/lib/formato";
import type { Asiento } from "./diario";
import {
  type EstadosContables,
  type FilaFlujo,
  type Lado,
  movimientosGrupo,
  saldoGrupo,
  sumar,
} from "./estados";

export interface DatosEntidad {
  razonSocial: string;
  cuit: string;
  actividad?: string;
  domicilio?: string;
  ejercicioNumero?: string;
}

/** Ruta pública del modelo de estados contables (RT 54, CPCE Jujuy). */
export const PLANTILLA_RT54 = "/modelos/rt54-modelo-eecc.xlsx";

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function poner(ws: Worksheet, celda: string, valor: number | null | undefined) {
  if (valor === null || valor === undefined || valor === 0) return;
  ws.getCell(celda).value = valor;
}

function formula(ws: Worksheet, celda: string, f: string) {
  ws.getCell(celda).value = { formula: f } as Cell["value"];
}

function texto(ws: Worksheet, celda: string, t: string) {
  ws.getCell(celda).value = t;
}

/** Texto de una celda, también si tiene formato enriquecido. */
function textoDe(v: Cell["value"]): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "richText" in v)
    return v.richText.map((r) => r.text).join("");
  return null;
}

/** Fechas y nombre de la entidad en los encabezados de todas las hojas. */
function completarEncabezados(
  wb: Workbook,
  e: EstadosContables,
  entidad: DatosEntidad,
) {
  const cierre = fechaLarga(e.cierre);
  const anterior = fechaLarga(e.cierreAnterior);
  const anio = e.cierre.slice(0, 4);
  const anioAnterior = e.cierreAnterior.slice(0, 4);
  // Celdas con solo la fecha o el año: la columna de la izquierda es la actual.
  const actualesSueltas = new Set([
    "I7",
    "G6",
    "B98",
    "B196",
    "B207",
    "B215",
    "B223",
    "B232",
    "B242",
    "B258",
    "E10",
  ]);
  const anterioresSueltas = new Set([
    "J7",
    "H6",
    "C98",
    "C196",
    "C207",
    "C215",
    "C223",
    "C232",
    "C242",
    "C258",
    "E16",
  ]);
  wb.eachSheet((ws) => {
    ws.eachRow((fila) =>
      fila.eachCell((c) => {
        const original = textoDe(c.value);
        if (original === null) return;
        let t = original;
        if (/^denominaci[oó]n/i.test(t.trim()) && t.trim().endsWith(":")) {
          c.value = `${t.trimEnd()} ${entidad.razonSocial}`;
          return;
        }
        if (/Aprobad/.test(t)) return;
        if (/Iniciado el dd\/mm\/aaaa y finalizado el dd\/mm\/aaaa/.test(t)) {
          c.value = `Iniciado el ${fechaLarga(e.inicio)} y finalizado el ${cierre}`;
          return;
        }
        const comparativo =
          /comparativo\)/.test(t) || anterioresSueltas.has(c.address);
        const fecha = comparativo ? anterior : cierre;
        const año = comparativo ? anioAnterior : anio;
        if (
          !/dd\/mm\/aaaa|DD\/MM\/AAAA|…\/…\/…|\baaaa\b|\bAAAA\b/.test(t) &&
          !actualesSueltas.has(c.address)
        )
          return;
        t = t
          .replace(/dd\/mm\/aaaa|DD\/MM\/AAAA|…\/…\/…/g, fecha)
          .replace(/\baaaa\b|\bAAAA\b/g, año);
        if (!e.enMonedaHomogenea)
          t = t.replace(
            /En moneda homogénea( \(Nota 1\.3\))?/,
            "En cifras históricas (sin reexpresar)",
          );
        c.value = t;
      }),
    );
  });
}

function caratula(wb: Workbook, e: EstadosContables, entidad: DatosEntidad) {
  const ws = wb.getWorksheet("0-C");
  if (!ws) return;
  texto(ws, "A1", entidad.razonSocial.toUpperCase());
  texto(ws, "A3", `ESTADOS CONTABLES AL ${fechaLarga(e.cierre)}`);
  texto(ws, "A6", `Actividad principal: ${entidad.actividad ?? ""}`);
  texto(ws, "A7", `CUIT N°: ${cuitConGuiones(entidad.cuit)}`);
  texto(ws, "A8", `Domicilio legal: ${entidad.domicilio ?? ""}`);
  texto(
    ws,
    "A17",
    `Ejercicio económico Nº ${entidad.ejercicioNumero || "….."}`,
  );
  const [capital] = saldoGrupo(e, ["3.1.01.001"], [], -1);
  const [pendiente] = saldoGrupo(e, ["3.1.01.005"]);
  poner(ws, "E26", capital);
  poner(ws, "F26", capital - pendiente);
}

const FILAS_ESP: Record<Lado, { col: [string, string]; filas: number[] }> = {
  AC: { col: ["B", "C"], filas: [12, 13, 14, 15, 16, 17, 18] },
  ANC: { col: ["B", "C"], filas: [23, 24, 25, 26, 27, 28, 29, 30, 31] },
  PC: { col: ["E", "F"], filas: [12, 13, 14, 15, 16, 17, 18, 19] },
  PNC: { col: ["E", "F"], filas: [23, 24, 25, 26, 27, 28, 29, 30] },
};

function situacionPatrimonial(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("1-ESP");
  if (!ws) return;
  for (const lado of ["AC", "ANC", "PC", "PNC"] as Lado[]) {
    const { col, filas } = FILAS_ESP[lado];
    e.rubros[lado].forEach((r, i) => {
      const fila = filas[i];
      if (!fila) return;
      if (r.clave === "otrasDeudas")
        texto(ws, `D${fila}`, "Otras deudas (Nota…)");
      if (!r.actual && !r.anterior) return;
      poner(ws, `${col[0]}${fila}`, r.actual);
      poner(ws, `${col[1]}${fila}`, r.anterior);
    });
  }
  poner(ws, "E34", e.totales.patrimonioNeto[0]);
  poner(ws, "F34", e.totales.patrimonioNeto[1]);
}

const FILAS_ER: Record<string, number> = {
  ventas: 10,
  costo: 11,
  comercializacion: 13,
  administracion: 14,
  financieros: 17,
  otros: 18,
  impuesto: 21,
};

function estadoResultados(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("2-ER");
  if (!ws) return;
  // El modelo une las celdas de importes de dos renglones: se separan para que cada uno tenga el suyo.
  for (const rango of [
    "C9:C10",
    "D9:D10",
    "C13:C14",
    "D13:D14",
    "C17:C18",
    "D17:D18",
  ])
    ws.unMergeCells(rango);
  for (const r of e.resultados) poner(ws, `C${FILAS_ER[r.clave]}`, r.actual);
}

function evolucionPatrimonio(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("3-EEPN");
  if (!ws) return;
  const { inicio, cierre } = e.patrimonio;
  const cols = {
    B: "capital",
    C: "ajusteCapital",
    D: "aportes",
    G: "reservaLegal",
    H: "otrasReservas",
    I: "noAsignados",
  } as const;
  for (const [col, clave] of Object.entries(cols)) {
    poner(ws, `${col}10`, inicio[clave]);
    const cambio = Math.round((cierre[clave] - inicio[clave]) * 100) / 100;
    const fila = col === "I" ? 16 : col === "G" || col === "H" ? 15 : 13;
    poner(ws, `${col}${fila}`, cambio);
  }
  poner(ws, "I17", e.resultado);
  formula(ws, "F10", "SUM(B10:E10)");
  formula(ws, "J10", "SUM(G10:I10)");
  formula(ws, "K10", "J10+F10");
  // El modelo suma los saldos de cierre sin el saldo de inicio: se corrige.
  for (const col of ["B", "C", "D", "E", "G", "H", "I"])
    formula(ws, `${col}18`, `SUM(${col}12:${col}17)`);
  ws.getCell("L18").value = e.totales.patrimonioNeto[1];
}

const FILAS_DIRECTO: Partial<Record<FilaFlujo, number>> = {
  cobrosVentas: 17,
  pagosProveedores: 18,
  pagosPersonal: 19,
  pagosImpuestos: 20,
  pagosDividendos: 22,
  cobrosIntereses: 23,
  pagosIntereses: 24,
  pagosGanancias: 27,
  otrosOperativos: 28,
  pagosBienesUso: 32,
  pagosIntangibles: 33,
  pagosInversiones: 34,
  cobrosBienesUso: 35,
  cobrosIntangibles: 36,
  cobrosInversiones: 37,
  aportes: 44,
  cobrosPrestamos: 45,
  pagosPrestamos: 46,
};

function variacionEfectivo(ws: Worksheet, e: EstadosContables) {
  poner(ws, "C9", e.flujo.inicio);
  texto(ws, "A11", "Efectivo y sus equivalentes al inicio modificado");
  formula(ws, "C11", "C9+C10");
  poner(ws, "C12", e.flujo.cierre);
  formula(ws, "C13", "C12-C11");
  poner(ws, "D12", e.flujo.inicio);
}

function flujoEfectivo(wb: Workbook, e: EstadosContables) {
  const directo = wb.getWorksheet("4B-EFE (DIRECTO)");
  if (directo) {
    variacionEfectivo(directo, e);
    for (const [fila, n] of Object.entries(FILAS_DIRECTO))
      poner(directo, `C${n}`, e.flujo.filas[fila as FilaFlujo]);
    texto(directo, "A28", "Otros cobros y pagos operativos");
    formula(directo, "C29", "SUM(C17:C28)");
    formula(directo, "C42", "SUM(C32:C41)");
    formula(directo, "C49", "SUM(C44:C48)");
    poner(directo, "C50", e.flujo.resultadosDelEfectivo);
  }
  const sintetico = wb.getWorksheet("4-EFE (Sintetico)");
  if (sintetico) {
    variacionEfectivo(sintetico, e);
    const por = (actividad: string) =>
      Object.entries(e.flujo.filas)
        .filter(([f]) => actividadDe(f as FilaFlujo) === actividad)
        .reduce((s, [, v]) => s + v, 0);
    poner(sintetico, "C18", round(por("operativas")));
    poner(sintetico, "C22", round(por("inversion")));
    poner(sintetico, "C25", round(por("financiacion")));
    texto(
      sintetico,
      "A26",
      "Resultados financieros y por tenencia generados por el efectivo (incluido el RECPAM)",
    );
    poner(sintetico, "C26", e.flujo.resultadosDelEfectivo);
    formula(sintetico, "C27", "C25+C22+C18+C26");
  }
  const indirecto = wb.getWorksheet("4C-EFE (INDIRECTO)");
  if (indirecto) wb.removeWorksheet(indirecto.id);
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function actividadDe(f: FilaFlujo) {
  const n = FILAS_DIRECTO[f] ?? 28;
  return n < 30 ? "operativas" : n < 43 ? "inversion" : "financiacion";
}

interface Contexto {
  e: EstadosContables;
  asientos: Asiento[];
  coef: (fecha: string) => number;
}

/** Anexos de bienes de uso, propiedades de inversión e intangibles. */
function anexoBienes(
  ws: Worksheet | undefined,
  ctx: Contexto,
  filas: [number, string[], string[]][],
) {
  if (!ws) return;
  const { e } = ctx;
  for (const [fila, origen, amortizacion] of filas) {
    const [cierre, inicio] = saldoGrupo(e, origen);
    const [amCierre, amInicio] = saldoGrupo(e, amortizacion, [], -1);
    if (!cierre && !inicio && !amCierre && !amInicio) continue;
    const { debe } = movimientosGrupo(
      ctx.asientos,
      e.inicio,
      e.cierre,
      origen,
      ctx.coef,
    );
    let altas = debe;
    let bajas = round(inicio + altas - cierre);
    if (bajas < 0) {
      altas = round(altas - bajas);
      bajas = 0;
    }
    poner(ws, `B${fila}`, inicio);
    poner(ws, `C${fila}`, altas);
    poner(ws, `D${fila}`, bajas);
    formula(ws, `E${fila}`, `B${fila}+C${fila}-D${fila}`);
    poner(ws, `F${fila}`, amInicio);
    poner(ws, `G${fila}`, round(amCierre - amInicio));
    formula(ws, `H${fila}`, `F${fila}+G${fila}`);
    formula(ws, `I${fila}`, `E${fila}-H${fila}`);
    formula(ws, `J${fila}`, `B${fila}-F${fila}`);
  }
}

function anexoPrevisiones(wb: Workbook, ctx: Contexto) {
  const ws = wb.getWorksheet("10-A Prev");
  if (!ws) return;
  const filas: [number, string[], string?][] = [
    [12, ["1.1.03.009"]],
    [14, ["1.1.04.027"]],
    [15, ["1.1.05.007"]],
    [25, ["2.1.08.001"]],
    [26, ["2.1.08.002", "2.1.08.003"], "Otras previsiones"],
    [28, ["2.2.05.001"]],
    [29, ["2.2.05.002"], "Otras previsiones"],
  ];
  for (const [fila, cuentas, nombre] of filas) {
    const [cierre, inicio] = saldoGrupo(ctx.e, cuentas, [], -1);
    if (!cierre && !inicio) continue;
    if (nombre) texto(ws, `A${fila}`, nombre);
    const m = movimientosGrupo(
      ctx.asientos,
      ctx.e.inicio,
      ctx.e.cierre,
      cuentas,
      ctx.coef,
    );
    poner(ws, `B${fila}`, inicio);
    poner(ws, `D${fila}`, m.haber);
    poner(ws, `E${fila}`, m.debe);
    // Lo que no explican los movimientos es el efecto de la inflación sobre la previsión.
    poner(ws, `F${fila}`, round(inicio + m.haber - m.debe - cierre));
    formula(ws, `G${fila}`, `B${fila}+C${fila}+D${fila}-E${fila}-F${fila}`);
    poner(ws, `H${fila}`, inicio);
  }
}

function anexoCostoVentas(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("11-A CV");
  if (!ws) return;
  const existencias: [number, number, string[]][] = [
    [10, 28, ["1.1.05.001", "1.1.05.006"]],
    [11, 29, ["1.1.05.004"]],
    [12, 30, ["1.1.05.003"]],
    [13, 31, ["1.1.05.002", "1.1.05.005", "1.1.05.007"]],
  ];
  let ei = 0;
  let ef = 0;
  for (const [filaInicio, filaFinal, cuentas] of existencias) {
    const [final, inicial] = saldoGrupo(e, cuentas);
    poner(ws, `B${filaInicio}`, inicial);
    poner(ws, `B${filaFinal}`, final);
    ei += inicial;
    ef += final;
  }
  const comprasMercaderias = sumar(e.saldos, [
    "5.1.01.004",
    "5.1.01.006",
    "5.1.01.007",
    "5.1.01.008",
  ]);
  const comprasMP = sumar(e.saldos, ["5.1.01.005"]);
  const produccion = sumar(e.saldos, [
    "5.1.01.009",
    "5.1.01.010",
    "5.1.01.011",
  ]);
  const costo = sumar(e.saldos, ["5.1"]);
  poner(ws, "B18", comprasMercaderias);
  poner(ws, "B19", comprasMP);
  poner(ws, "B21", produccion);
  texto(
    ws,
    "A23",
    "-        Resultado por tenencia y otros conceptos del costo",
  );
  poner(
    ws,
    "B23",
    round(costo - (ei + comprasMercaderias + comprasMP + produccion - ef)),
  );
}

const GASTOS: [number, string[]][] = [
  [7, ["5.2.01.006", "5.2.01.007", "5.3.01.021", "5.3.01.022", "5.3.01.023"]],
  [8, ["5.3.01.006"]],
  [9, ["5.3.01.005"]],
  [10, ["5.2.01.003", "5.2.01.008"]],
  [11, ["5.1.01.009", "5.2.01.001", "5.3.01.001", "5.3.01.003", "5.3.01.004"]],
  [12, ["5.1.01.010", "5.2.01.002", "5.3.01.002"]],
  [13, ["5.3.01.013"]],
  [14, ["5.3.01.009", "5.3.01.010", "5.3.01.011"]],
  [15, ["5.2.01.004"]],
  [16, ["5.3.01.024"]],
  [17, ["5.3.01.016"]],
  [18, ["5.3.01.019", "5.3.01.020"]],
  [19, ["5.3.01.007", "5.3.01.008"]],
  [20, ["5.3.01.015"]],
];

function anexoGastos(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("12-A CP y Gtos");
  if (!ws) return;
  const asignadas = GASTOS.flatMap(([, c]) => c);
  const columnas: [string, string[]][] = [
    ["B", ["5.1.01.009", "5.1.01.010", "5.1.01.011"]],
    ["D", ["5.2"]],
    ["E", ["5.3"]],
  ];
  const filas: [number, string[], string[]][] = [
    ...GASTOS.map(([f, c]) => [f, c, []] as [number, string[], string[]]),
    [21, ["5.1.01.011", "5.2", "5.3"], asignadas],
  ];
  for (const [fila, cuentas, excluir] of filas) {
    let hay = false;
    for (const [col, grupo] of columnas) {
      const codigos = [...e.saldos.keys()].filter(
        (c) =>
          cuentas.some((p) => c === p || c.startsWith(`${p}.`)) &&
          grupo.some((p) => c === p || c.startsWith(`${p}.`)) &&
          !excluir.includes(c),
      );
      const v = round(codigos.reduce((s, c) => s + (e.saldos.get(c) ?? 0), 0));
      if (v) hay = true;
      poner(ws, `${col}${fila}`, v);
    }
    if (hay) formula(ws, `F${fila}`, `SUM(B${fila}:E${fila})`);
  }
}

/** Composición de rubros: [fila, cuentas, signo, nombre nuevo]. */
type FilaNota = [number, string[], (1 | -1)?, string?];

const NOTAS: { filas: FilaNota[]; formulas?: [string, string][] }[] = [
  {
    filas: [
      [99, ["1.1.01.001", "1.1.01.002"]],
      [100, ["1.1.01.003"]],
      [101, ["1.1.01.006", "1.1.01.007", "1.1.01.008", "1.1.01.009"]],
      [102, ["1.1.01.004", "1.1.01.005"]],
    ],
  },
  {
    filas: [
      [110, ["1.1.02.003"]],
      [111, ["1.1.02.001", "1.1.02.002"]],
      [112, ["1.1.02.004", "1.1.02.005", "1.1.02.006", "1.1.02.007"]],
      [117, ["1.2.03.001"]],
      [118, ["1.2.03.004", "1.2.04"]],
    ],
    formulas: [
      ["113", "SUM(#110:#112)"],
      ["119", "SUM(#116:#118)"],
    ],
  },
  {
    filas: [
      [125, ["1.1.03.003"]],
      [
        126,
        ["1.1.03.001", "1.1.03.002", "1.1.03.004", "1.1.03.005", "1.1.03.008"],
      ],
      [127, ["1.1.03.006", "1.1.03.007"]],
      [132, ["1.1.03.009"]],
      [137, ["1.2.01"]],
    ],
    formulas: [
      ["129", "SUM(#125:#128)"],
      ["133", "#129+#132"],
      ["140", "SUM(#136:#139)"],
      ["144", "#140+#143"],
    ],
  },
  {
    filas: [
      [151, ["1.1.04.009", "1.1.04.010", "1.1.04.011", "1.1.04.012"]],
      [152, ["1.1.04.013", "1.1.04.014", "1.1.04.015", "1.1.04.016"]],
      [
        153,
        ["1.1.04.004", "1.1.04.005", "1.1.04.006", "1.1.04.007", "1.1.04.008"],
        1,
        "Saldo a favor de IVA",
      ],
      [154, ["1.1.04.017", "1.1.04.018"]],
      [166, ["1.2.02.001", "1.2.02.004"]],
    ],
    formulas: [
      ["155", "SUM(#151:#154)"],
      ["159", "#155+#158"],
      ["167", "SUM(#163:#166)"],
      ["171", "#167+#170"],
    ],
  },
  {
    filas: [
      [176, ["1.1.04.023", "1.1.04.024"]],
      [177, ["1.1.04.025"], 1, "Créditos con sociedades relacionadas"],
    ],
    formulas: [["178", "SUM(#176:#177)"]],
  },
  {
    filas: [
      [185, ["1.1.04.019", "1.1.04.020", "1.1.04.021"]],
      [187, ["1.1.04.002", "1.1.04.003"]],
      [188, ["1.1.04.001", "1.1.04.022", "1.1.04.026", "1.1.06"]],
      [192, ["1.1.04.027"]],
    ],
    formulas: [
      ["189", "SUM(#185:#188)"],
      ["193", "#189+#192"],
    ],
  },
  {
    filas: [
      [197, ["1.1.05.001"]],
      [198, ["1.1.05.004"]],
      [199, ["1.1.05.003"]],
      [200, ["1.1.05.006"]],
      [201, ["1.1.05.002", "1.1.05.005"]],
      [203, ["1.1.05.007"]],
    ],
  },
  {
    filas: [
      [209, ["2.1.01.001", "2.1.01.005", "2.1.01.006", "2.1.01.007"], -1],
      [210, ["2.1.01.003"], -1],
      [211, ["2.1.01.002", "2.1.01.004"], -1],
    ],
  },
  {
    filas: [
      [216, ["2.1.02.002", "2.1.02.005"], -1],
      [217, ["2.1.02.001"], -1],
      [218, ["2.1.02.003", "2.1.02.006", "2.1.02.007"], -1],
    ],
  },
  {
    filas: [
      [224, ["2.1.04.001", "2.1.04.002", "2.1.04.003", "2.1.04.004"], -1],
      [225, ["2.1.04.007", "2.1.04.008", "2.1.04.009"], -1],
      [226, ["2.1.04.013", "2.1.04.014"], -1],
      [227, ["2.1.04.005", "2.1.04.006"], -1],
      [228, ["2.1.04.010", "2.1.04.011", "2.1.04.012", "2.1.04.015"], -1],
    ],
  },
  {
    filas: [
      [233, ["2.1.03.004"], -1],
      [234, ["2.1.03.002", "2.1.03.003"], -1],
      [235, ["2.1.03.001"], -1],
      [
        236,
        [
          "2.1.03.005",
          "2.1.03.006",
          "2.1.03.007",
          "2.1.03.008",
          "2.1.03.009",
          "2.1.03.011",
        ],
        -1,
      ],
      [237, ["2.1.03.010"], -1],
    ],
  },
  {
    filas: [[243, ["2.1.05"], -1]],
  },
  {
    filas: [
      [250, ["2.1.07.002", "2.1.02.004"], -1],
      [251, ["2.1.07.001", "2.1.07.003", "2.1.06"], -1],
    ],
    formulas: [["252", "SUM(#250:#251)"]],
  },
  {
    filas: [
      [
        259,
        [
          "4.1.01.001",
          "4.1.01.002",
          "4.1.01.003",
          "4.1.01.004",
          "4.1.01.005",
          "4.1.01.006",
        ],
        -1,
      ],
      [261, ["4.1.01.007", "4.1.01.008"], -1, "Devoluciones y bonificaciones"],
    ],
    formulas: [["262", "SUM(#259:#261)"]],
  },
  {
    filas: [
      [
        268,
        ["4.2.02.002", "4.2.02.003", "4.2.02.004", "4.2.02.005", "4.2.02.006"],
        -1,
        "       Alquileres, recuperos e ingresos varios",
      ],
      [269, ["4.2.02.001"], -1],
      [272, ["5.5"], -1, "       Siniestros, multas y egresos varios"],
    ],
    formulas: [
      ["270", "SUM(#268:#269)"],
      ["273", "SUM(#272:#272)"],
      ["274", "#270+#273"],
    ],
  },
];

function notas(wb: Workbook, e: EstadosContables) {
  const ws = wb.getWorksheet("NOTAS");
  if (!ws) return;
  for (const nota of NOTAS) {
    for (const [fila, cuentas, signo = 1, nombre] of nota.filas) {
      const [actual, anterior] = saldoGrupo(e, cuentas, [], signo);
      if (nombre) texto(ws, `A${fila}`, nombre);
      poner(ws, `B${fila}`, actual);
      // Los resultados no tienen comparativo cargado.
      if (fila < 256) poner(ws, `C${fila}`, anterior);
    }
    for (const [fila, f] of nota.formulas ?? [])
      for (const col of ["B", "C"])
        formula(ws, `${col}${fila}`, f.replaceAll("#", col));
  }
}

/** Hoja adicional con el detalle del ajuste por inflación y los asientos de cierre. */
function hojaAjuste(wb: Workbook, e: EstadosContables) {
  const ws = wb.addWorksheet("Ajuste por inflación");
  ws.columns = [{ width: 60 }, { width: 18 }, { width: 18 }];
  const filas: (string | number | null)[][] = [];
  if (e.reexpresion) {
    const r = e.reexpresion;
    filas.push(
      ["REEXPRESIÓN EN MONEDA HOMOGÉNEA (RT 6)"],
      [],
      [
        "Índice FACPCE (Res. JG 539/18) del cierre anterior",
        r.indiceInicio.valor,
        r.indiceInicio.mes,
      ],
      [
        `Índice del cierre${r.indiceCierre.estimado ? " (último publicado)" : ""}`,
        r.indiceCierre.valor,
        r.indiceCierre.mes,
      ],
      [
        "Coeficiente de reexpresión de los saldos de inicio",
        r.coeficienteInicio,
      ],
      ["RECPAM del ejercicio (ganancia + / pérdida −)", r.recpam],
      [],
    );
  } else {
    filas.push(["Estados en cifras históricas: no se aplicó la RT 6."], []);
  }
  for (const a of e.asientosDeCierre) {
    filas.push([a.descripcion.toUpperCase(), "Debe", "Haber"]);
    for (const l of a.lineas)
      filas.push([`${l.cuenta} ${l.nombre}`, l.debe || null, l.haber || null]);
    filas.push([]);
  }
  for (const f of filas) ws.addRow(f);
  ws.getColumn(2).numFmt = "#,##0.00";
  ws.getColumn(3).numFmt = "#,##0.00";
  ws.getRow(1).font = { bold: true };
}

/** Completa el modelo RT 54 con los estados calculados y devuelve el archivo Excel. */
export async function armarExcelRT54(
  plantilla: ArrayBuffer,
  e: EstadosContables,
  entidad: DatosEntidad,
  asientos: Asiento[],
  /** Los mismos índices con que se calcularon los estados (null = cifras históricas). */
  indices: Indices | null,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(plantilla);
  const ctx: Contexto = {
    e,
    asientos,
    coef: (fecha) =>
      indices && e.enMonedaHomogenea
        ? coeficiente(indices, mesDe(fecha), mesDe(e.cierre))
        : 1,
  };
  completarEncabezados(wb, e, entidad);
  caratula(wb, e, entidad);
  situacionPatrimonial(wb, e);
  estadoResultados(wb, e);
  evolucionPatrimonio(wb, e);
  flujoEfectivo(wb, e);
  anexoBienes(wb.getWorksheet("7-A B.Uso"), ctx, [
    [9, ["1.2.05.001"], []],
    [10, ["1.2.05.002"], ["1.2.05.003"]],
    [11, ["1.2.05.006"], ["1.2.05.007"]],
    [12, ["1.2.05.008"], ["1.2.05.009"]],
    [13, ["1.2.05.004"], ["1.2.05.005"]],
    [14, ["1.2.05.010"], ["1.2.05.011"]],
    [15, ["1.2.05.018"], []],
    [16, ["1.2.05.019"], []],
    [
      17,
      ["1.2.05.012", "1.2.05.014", "1.2.05.016"],
      ["1.2.05.013", "1.2.05.015", "1.2.05.017"],
    ],
  ]);
  anexoBienes(wb.getWorksheet("8-A PdI"), ctx, [
    [10, ["1.2.03.002"], ["1.2.03.003"]],
  ]);
  anexoBienes(wb.getWorksheet("9-A A Int"), ctx, [
    [9, ["1.2.06.001"], ["1.2.06.002"]],
    [11, ["1.2.06.003"], ["1.2.06.004"]],
    [12, ["1.2.06.007"], ["1.2.06.008"]],
    [13, ["1.2.06.005"], ["1.2.06.006"]],
    [17, ["1.2.07.001"], ["1.2.07.002"]],
  ]);
  anexoPrevisiones(wb, ctx);
  anexoCostoVentas(wb, e);
  anexoGastos(wb, e);
  notas(wb, e);
  hojaAjuste(wb, e);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
