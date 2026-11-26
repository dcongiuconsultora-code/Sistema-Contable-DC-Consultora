// Informes para presentar al cliente: el estado de resultados mes a mes y el balance (anual o
// intermedio), con el logo del estudio.
import type { EstadosContables, Renglon } from "@/lib/contabilidad/estados";
import {
  cuitConGuiones,
  fechaCorta,
  nombrePeriodo,
  pesos,
} from "@/lib/formato";
import { $, CLARO_RGB, MARCA_RGB, nuevoExcel, nuevoPdf } from "./pdf-base";

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
const mesCorto = (m: string) =>
  `${MESES[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;
const num = (n: number) => (n ? pesos(n) : "—");

export interface DatosResultados {
  empresa: string;
  cuit: string;
  desde: string;
  hasta: string;
  generado: string;
  meses: string[];
  filas: {
    nombre: string;
    valores: number[];
    total: number;
    esTotal: boolean;
  }[];
  indicadores: { nombre: string; valores: string[] }[];
}

export async function pdfResultados(
  d: DatosResultados,
  logo?: string,
): Promise<Blob> {
  const p = await nuevoPdf({
    titulo: "Estado de resultados mes a mes",
    subtitulo: `${d.empresa} · CUIT ${cuitConGuiones(d.cuit)} · ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`,
    logo,
    apaisado: true,
  });
  const ventas = d.filas[0];
  const resultado = d.filas.at(-1)!;
  p.tarjetas([
    ["Ventas del período", $(ventas?.total ?? 0)],
    [
      resultado.total >= 0 ? "Ganancia del período" : "Pérdida del período",
      $(Math.abs(resultado.total)),
    ],
    [
      "Margen sobre ventas",
      ventas?.total
        ? `${Math.round((resultado.total / ventas.total) * 1000) / 10} %`
        : "—",
    ],
    ["Meses", String(d.meses.length)],
  ]);
  const chico = d.meses.length > 8;
  p.tabla(
    {
      head: [["Concepto", ...d.meses.map(mesCorto), "Total"]],
      body: d.filas.map((f) => [
        f.nombre,
        ...f.valores.map(num),
        pesos(f.total),
      ]),
      styles: {
        fontSize: chico ? 7 : 8.5,
        cellPadding: chico ? 1.4 : 2,
        textColor: [41, 37, 36],
      },
      columnStyles: { 0: { cellWidth: chico ? 44 : 58 } },
      didParseCell: (c) => {
        if (c.section !== "body") return;
        const f = d.filas[c.row.index];
        if (f?.esTotal) {
          c.cell.styles.fontStyle = "bold";
          c.cell.styles.fillColor = [246, 240, 238];
        }
        const v =
          c.column.index === 0
            ? 0
            : c.column.index <= d.meses.length
              ? f?.valores[c.column.index - 1]
              : f?.total;
        if ((v ?? 0) < 0) c.cell.styles.textColor = [185, 28, 28];
      },
    },
    d.meses.map((_, i) => i + 1).concat(d.meses.length + 1),
  );
  p.titulo("Ventas y resultado de cada mes");
  p.barras(
    d.meses.map((m, i) => ({
      etiqueta: mesCorto(m),
      valores: [ventas?.valores[i] ?? 0, Math.max(0, resultado.valores[i])],
    })),
    [
      { nombre: "Ventas", color: MARCA_RGB },
      { nombre: "Ganancia del mes", color: CLARO_RGB },
    ],
  );
  if (d.indicadores.length) {
    p.titulo("Rentabilidad y liquidez");
    p.tabla(
      {
        head: [["Indicador", ...d.meses.map(mesCorto)]],
        body: d.indicadores.map((i) => [i.nombre, ...i.valores]),
        styles: {
          fontSize: chico ? 7 : 8.5,
          cellPadding: chico ? 1.4 : 2,
          textColor: [41, 37, 36],
        },
        columnStyles: { 0: { cellWidth: chico ? 44 : 58 } },
      },
      d.meses.map((_, i) => i + 1),
    );
  }
  return p.terminar(d.generado);
}

export async function excelResultados(
  d: DatosResultados,
  logo?: ArrayBuffer,
): Promise<Blob> {
  const x = await nuevoExcel(
    "Estado de resultados mes a mes",
    `${d.empresa} · CUIT ${cuitConGuiones(d.cuit)} · ${fechaCorta(d.desde)} al ${fechaCorta(d.hasta)}`,
    logo,
  );
  const ws = x.wb.addWorksheet("Resultados", {
    views: [{ showGridLines: false, state: "frozen", xSplit: 2, ySplit: 8 }],
  });
  ws.columns = [
    { width: 3 },
    { width: 38 },
    ...d.meses.map(() => ({ width: 15 })),
    { width: 16 },
  ];
  x.portada(ws);
  ws.getRow(8).values = ["", "Concepto", ...d.meses.map(mesCorto), "Total"];
  x.encabezado(ws, 8);
  d.filas.forEach((f, i) => {
    const r = ws.getRow(9 + i);
    r.values = ["", f.nombre, ...f.valores, f.total];
    if (f.esTotal) r.font = { bold: true };
    for (let c = 3; c <= d.meses.length + 3; c++) r.getCell(c).numFmt = x.NUM;
  });
  let f = 9 + d.filas.length + 1;
  if (d.indicadores.length) {
    ws.getRow(f).values = ["", "Indicador", ...d.meses.map(mesCorto)];
    x.encabezado(ws, f);
    for (const i of d.indicadores)
      ws.getRow(++f).values = ["", i.nombre, ...i.valores];
  }
  return x.blob();
}

// Balance para presentar ------------------------------------------------------------------------

export interface DatosBalance {
  empresa: string;
  cuit: string;
  generado: string;
  e: EstadosContables;
  /** Intermedio si el cierre no es el del ejercicio. */
  intermedio: boolean;
}

export async function pdfBalance(
  d: DatosBalance,
  logo?: string,
): Promise<Blob> {
  const { e } = d;
  const t = e.totales;
  const p = await nuevoPdf({
    titulo: d.intermedio
      ? `Balance al ${fechaCorta(e.cierre)}`
      : `Estados contables al ${fechaCorta(e.cierre)}`,
    subtitulo: `${d.empresa} · CUIT ${cuitConGuiones(d.cuit)} · ejercicio desde el ${fechaCorta(e.inicio)}`,
    logo,
  });
  const ventas = e.resultados.find((r) => r.clave === "ventas")?.actual ?? 0;
  p.tarjetas([
    [
      e.resultado >= 0 ? "Ganancia del período" : "Pérdida del período",
      $(Math.abs(e.resultado)),
    ],
    ["Ventas", $(ventas)],
    ["Total del activo", $(t.activo[0])],
    ["Patrimonio neto", $(t.patrimonioNeto[0])],
  ]);
  const anterior = `al ${fechaCorta(e.cierreAnterior)}`;
  const bloque = (
    titulo: string,
    renglones: Renglon[],
    total: [string, number, number],
  ) => [
    [
      {
        content: titulo,
        colSpan: 3,
        styles: { fontStyle: "bold" as const, textColor: MARCA_RGB },
      },
    ],
    ...renglones
      .filter((r) => r.actual || r.anterior)
      .map((r) => [`   ${r.nombre}`, num(r.actual), num(r.anterior ?? 0)]),
    [
      { content: total[0], styles: { fontStyle: "bold" as const } },
      { content: pesos(total[1]), styles: { fontStyle: "bold" as const } },
      { content: pesos(total[2]), styles: { fontStyle: "bold" as const } },
    ],
  ];
  p.titulo("Estado de situación patrimonial");
  p.tabla(
    {
      head: [["", `Al ${fechaCorta(e.cierre)}`, anterior]],
      body: [
        ...bloque("Activo corriente", e.rubros.AC, [
          "Total activo corriente",
          ...t.activoCorriente,
        ]),
        ...bloque("Activo no corriente", e.rubros.ANC, [
          "Total activo no corriente",
          ...t.activoNoCorriente,
        ]),
        [
          {
            content: "TOTAL DEL ACTIVO",
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.activo[0]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.activo[1]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
        ],
        ...bloque("Pasivo corriente", e.rubros.PC, [
          "Total pasivo corriente",
          ...t.pasivoCorriente,
        ]),
        ...bloque("Pasivo no corriente", e.rubros.PNC, [
          "Total pasivo no corriente",
          ...t.pasivoNoCorriente,
        ]),
        [
          {
            content: "TOTAL DEL PASIVO",
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.pasivo[0]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.pasivo[1]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
        ],
        [
          {
            content: "PATRIMONIO NETO",
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.patrimonioNeto[0]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
          {
            content: pesos(t.patrimonioNeto[1]),
            styles: { fontStyle: "bold", fillColor: [246, 240, 238] },
          },
        ],
      ],
      alternateRowStyles: {},
    },
    [1, 2],
  );
  p.titulo(
    "Estado de resultados",
    `${fechaCorta(e.inicio)} al ${fechaCorta(e.cierre)}`,
  );
  p.tabla(
    {
      head: [["Concepto", "Importe"]],
      body: [
        ...e.resultados
          .filter((r) => r.actual)
          .map((r) => [r.nombre, num(r.actual)]),
        [
          { content: "Ganancia bruta", styles: { textColor: [120, 113, 108] } },
          {
            content: pesos(e.gananciaBruta),
            styles: { textColor: [120, 113, 108] },
          },
        ],
      ],
      foot: [
        [
          e.resultado >= 0 ? "Ganancia del período" : "Pérdida del período",
          pesos(e.resultado),
        ],
      ],
    },
    [1],
  );
  // Indicadores principales.
  const div = (a: number, b: number) => (Math.abs(b) < 0.005 ? null : a / b);
  const ind: [string, number | null, string, string][] = [
    [
      "Liquidez corriente",
      div(t.activoCorriente[0], t.pasivoCorriente[0]),
      "veces",
      "Activo corriente / pasivo corriente. Más de 1: alcanza para las deudas del año.",
    ],
    [
      "Endeudamiento",
      div(t.pasivo[0], t.patrimonioNeto[0]),
      "veces",
      "Pasivo / patrimonio neto. Cuánto se debe por cada $1 propio.",
    ],
    [
      "Rentabilidad sobre ventas",
      div(e.resultado, ventas),
      "%",
      "Resultado / ventas. Cuánto queda de cada $100 vendidos.",
    ],
    [
      "Rentabilidad del patrimonio",
      div(e.resultado, t.patrimonioNeto[0] - e.resultado),
      "%",
      "Resultado / patrimonio al inicio.",
    ],
  ];
  p.titulo("Indicadores");
  p.tabla(
    {
      head: [["Indicador", "Valor", "Qué mide"]],
      body: ind.map(([n, v, u, q]) => [
        n,
        v === null
          ? "—"
          : u === "%"
            ? `${(v * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`
            : v.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
        q,
      ]),
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 24, fontStyle: "bold" },
      },
    },
    [1],
  );
  if (e.diferencia !== 0)
    p.texto(
      `Nota: el activo no iguala al pasivo más el patrimonio neto por ${$(e.diferencia)}; hay saldos de inicio por revisar.`,
    );
  return p.terminar(
    d.generado,
    `${d.intermedio ? "Balance intermedio" : "Estados contables"} ${e.enMonedaHomogenea ? "en moneda homogénea" : "en cifras históricas"}, sin auditar.`,
  );
}
