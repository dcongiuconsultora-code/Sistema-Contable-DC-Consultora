// Informe para monotributistas: lo facturado en los últimos 12 meses contra el tope de la
// categoría, la cuota y la próxima recategorización.
import { cuitConGuiones, nombrePeriodo } from "@/lib/formato";
import { $, CLARO_RGB, MARCA_RGB, nuevoExcel, nuevoPdf } from "./pdf-base";

export interface InformeMonotributo {
  empresa: string;
  cuit: string;
  generado: string;
  actividad: "servicios" | "bienes";
  categoria: string | null;
  tope: number | null;
  cuotaMensual: number | null;
  /** Categoría que corresponde por lo facturado (null = supera la última). */
  corresponde: string | null;
  cuotaCorresponde: number | null;
  meses: { mes: string; facturado: number; comprado: number }[];
  totalFacturado: number;
  totalComprado: number;
  recategorizacion: { cierre: string; presentarEn: string };
  vencimientos: { fecha: string; impuesto: string; detalle: string }[];
}

const mesLindo = (m: string) => {
  const n = nombrePeriodo(m);
  return n.charAt(0).toUpperCase() + n.slice(1);
};

/** Frases para explicarle al cliente su situación. */
export function situacionMonotributo(i: InformeMonotributo): string[] {
  const t: string[] = [];
  if (i.tope && i.categoria) {
    const uso = i.totalFacturado / i.tope;
    if (uso > 1)
      t.push(
        `En los últimos 12 meses facturaste ${$(i.totalFacturado)}: superaste en ${$(i.totalFacturado - i.tope)} el límite de la categoría ${i.categoria} (${$(i.tope)}).`,
      );
    else
      t.push(
        `En los últimos 12 meses facturaste ${$(i.totalFacturado)}, el ${Math.round(uso * 100)} % del límite de la categoría ${i.categoria}. Te quedan ${$(i.tope - i.totalFacturado)} para facturar sin cambiar de categoría.`,
      );
  }
  if (i.corresponde === null)
    t.push(
      "Lo facturado supera el límite de la categoría más alta: hay que analizar la exclusión del monotributo. Consultanos.",
    );
  else if (i.categoria && i.corresponde !== i.categoria)
    t.push(
      `Según lo facturado te corresponde la categoría ${i.corresponde}${i.cuotaCorresponde ? `, con una cuota de ${$(i.cuotaCorresponde)} por mes` : ""}.`,
    );
  else if (i.categoria)
    t.push(`Estás bien encuadrado en la categoría ${i.categoria}.`);
  t.push(
    `La próxima recategorización se presenta en ${i.recategorizacion.presentarEn}, con lo facturado en los 12 meses a ${mesLindo(i.recategorizacion.cierre).toLowerCase()}.`,
  );
  return t;
}

export async function pdfMonotributo(
  i: InformeMonotributo,
  logo?: string,
): Promise<Blob> {
  const ultimo = i.meses.at(-1)?.mes;
  const p = await nuevoPdf({
    titulo: "Tu monotributo",
    subtitulo: `${i.empresa} · CUIT ${cuitConGuiones(i.cuit)}`,
    logo,
  });
  const uso = i.tope ? i.totalFacturado / i.tope : null;
  p.tarjetas([
    [
      "Categoría actual",
      i.categoria ?? "—",
      i.tope ? `límite ${$(i.tope)}` : undefined,
    ],
    [
      "Facturado en 12 meses",
      $(i.totalFacturado),
      ultimo ? `hasta ${mesLindo(ultimo).toLowerCase()}` : undefined,
    ],
    [
      uso !== null && uso > 1 ? "Te pasaste por" : "Te queda para facturar",
      i.tope ? $(Math.abs(i.tope - i.totalFacturado)) : "—",
      uso !== null ? `${Math.round(uso * 100)} % del límite` : undefined,
    ],
    [
      "Cuota mensual",
      i.cuotaMensual ? $(i.cuotaMensual) : "—",
      i.actividad === "bienes" ? "venta de bienes" : "servicios",
    ],
  ]);
  p.titulo("Tu situación");
  for (const t of situacionMonotributo(i)) p.texto(`•  ${t}`);
  p.y += 6;
  p.titulo("Facturado mes a mes");
  p.barras(
    i.meses.map((m) => ({
      etiqueta: `${mesLindo(m.mes).slice(0, 3)} ${m.mes.slice(2, 4)}`,
      valores: [m.facturado, m.comprado],
    })),
    [
      { nombre: "Facturado", color: MARCA_RGB },
      { nombre: "Compras y gastos", color: CLARO_RGB },
    ],
  );
  let acumulado = 0;
  p.tabla(
    {
      head: [["Mes", "Facturado", "Compras y gastos", "Acumulado"]],
      body: i.meses.map((m) => {
        acumulado += m.facturado;
        return [mesLindo(m.mes), $(m.facturado), $(m.comprado), $(acumulado)];
      }),
      foot: [["Total 12 meses", $(i.totalFacturado), $(i.totalComprado), ""]],
    },
    [1, 2, 3],
  );
  if (i.vencimientos.length) {
    p.titulo("Próximos vencimientos");
    p.tabla({
      head: [["Fecha", "Impuesto", "Detalle"]],
      body: i.vencimientos.map((v) => [
        `${v.fecha.slice(8)}/${v.fecha.slice(5, 7)}/${v.fecha.slice(0, 4)}`,
        v.impuesto,
        v.detalle,
      ]),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 36 } },
    });
  }
  return p.terminar(
    i.generado,
    "Según las facturas de ARCA cargadas en el sistema.",
  );
}

export async function excelMonotributo(
  i: InformeMonotributo,
  logo?: ArrayBuffer,
): Promise<Blob> {
  const x = await nuevoExcel(
    "Tu monotributo",
    `${i.empresa} · CUIT ${cuitConGuiones(i.cuit)}`,
    logo,
  );
  const ws = x.wb.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 4 },
    { width: 34 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
  ];
  x.portada(ws);
  const filas: [string, string | number][] = [
    ["Categoría actual", i.categoria ?? "—"],
    ["Límite anual de la categoría", i.tope ?? "—"],
    ["Facturado en los últimos 12 meses", i.totalFacturado],
    ["Te queda para facturar", i.tope ? i.tope - i.totalFacturado : "—"],
    ["Cuota mensual", i.cuotaMensual ?? "—"],
    ["Categoría que corresponde", i.corresponde ?? "Exclusión"],
    ["Próxima recategorización", i.recategorizacion.presentarEn],
  ];
  ws.getRow(8).values = ["", "Concepto", "Valor"];
  x.encabezado(ws, 8);
  filas.forEach(([n, v], k) => {
    ws.getRow(9 + k).values = ["", n, v];
    if (typeof v === "number") ws.getCell(`C${9 + k}`).numFmt = x.NUM;
  });
  let f = 9 + filas.length + 1;
  for (const t of situacionMonotributo(i)) {
    ws.getCell(`B${f}`).value = t;
    ws.mergeCells(`B${f}:E${f}`);
    ws.getCell(`B${f}`).alignment = { wrapText: true };
    ws.getRow(f).height = 30;
    f++;
  }
  ws.getRow(++f).values = [
    "",
    "Mes",
    "Facturado",
    "Compras y gastos",
    "Acumulado",
  ];
  x.encabezado(ws, f);
  const desde = f + 1;
  for (const m of i.meses) {
    f++;
    ws.getRow(f).values = [
      "",
      mesLindo(m.mes),
      m.facturado,
      m.comprado,
      { formula: `SUM(C${desde}:C${f})` },
    ];
    for (const c of ["C", "D", "E"]) ws.getCell(`${c}${f}`).numFmt = x.NUM;
  }
  f++;
  ws.getRow(f).values = [
    "",
    "Total 12 meses",
    { formula: `SUM(C${desde}:C${f - 1})` },
    { formula: `SUM(D${desde}:D${f - 1})` },
  ];
  ws.getRow(f).font = { bold: true };
  for (const c of ["C", "D"]) ws.getCell(`${c}${f}`).numFmt = x.NUM;
  return x.blob();
}
