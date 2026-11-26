// Informe mensual para el cliente: lo mismo en Excel (para trabajar) y en PDF (para presentar),
// con el logo del estudio.
import type { Comprobante } from "@/lib/arca/tipos";
import {
  cuitConGuiones,
  fechaCorta,
  nombrePeriodo,
  pesos,
} from "@/lib/formato";

export interface InformeMensual {
  empresa: string;
  cuit: string;
  periodo: string;
  /** Unidad de negocio, si el informe es de una sola. */
  unidad?: string | null;
  generado: string;
  resumen: {
    ventas: number;
    ventasMesAnterior: number | null;
    compras: number;
    gastos: number;
    resultado: number;
    margen: number | null;
    cajaYBancos: number;
    teDeben: number;
    debes: number;
  };
  indicadores: {
    nombre: string;
    valor: string;
    estado: "bien" | "atencion" | "critico" | "sin_datos";
    lectura: string;
    formula: string;
  }[];
  meses: {
    periodo: string;
    ventas: number;
    compras: number;
    resultado: number;
  }[];
  vencimientos: { fecha: string; impuesto: string; detalle: string }[];
  pendientes: string[];
  /** Comprobantes del período (solo van en el Excel). */
  ventas?: Comprobante[];
  compras?: Comprobante[];
}

export const ESTADO_TEXTO = {
  bien: "Bien",
  atencion: "Para mirar",
  critico: "Preocupa",
  sin_datos: "Sin datos",
} as const;

const MARCA = "591101";
const MARCA_RGB: [number, number, number] = [89, 17, 1];

function mesCorto(p: string) {
  const n = nombrePeriodo(p);
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export function nombreArchivo(inf: InformeMensual, extension: string) {
  const limpio = inf.empresa
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "_")
    .replace(/^_|_$/g, "");
  return `Informe_${limpio}_${inf.periodo}.${extension}`;
}

/** Filas del resumen, en el orden en que se muestran. */
export function filasResumen(inf: InformeMensual): [string, number, string][] {
  const r = inf.resumen;
  const varVentas =
    r.ventasMesAnterior && r.ventasMesAnterior !== 0
      ? (r.ventas - r.ventasMesAnterior) / Math.abs(r.ventasMesAnterior)
      : null;
  return [
    [
      "Ventas del mes (netas de IVA)",
      r.ventas,
      varVentas === null
        ? ""
        : `${varVentas >= 0 ? "+" : ""}${Math.round(varVentas * 100)} % vs. mes anterior`,
    ],
    ["Compras (costo)", r.compras, ""],
    ["Gastos", r.gastos, "sueldos, servicios y otros"],
    [
      r.resultado >= 0 ? "Ganancia del mes" : "Pérdida del mes",
      r.resultado,
      r.margen === null ? "" : `${Math.round(r.margen * 100)} % de las ventas`,
    ],
    ["Caja y bancos al cierre del mes", r.cajaYBancos, ""],
    ["Te deben tus clientes", r.teDeben, ""],
    ["Debés a proveedores", r.debes, ""],
  ];
}

// ---------------------------------------------------------------------------------- Excel

export async function excelInforme(
  inf: InformeMensual,
  logo?: ArrayBuffer,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DC Consultora";
  const titulo = { bold: true, size: 16, color: { argb: `FF${MARCA}` } };
  const encabezado = (ws: import("exceljs").Worksheet, fila: number) => {
    const r = ws.getRow(fila);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: `FF${MARCA}` },
      };
    });
  };
  const NUM = "#,##0.00;[Red]-#,##0.00";

  // Resumen
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 4 }, { width: 42 }, { width: 20 }, { width: 38 }];
  if (logo) {
    const id = wb.addImage({ buffer: logo, extension: "png" });
    ws.addImage(id, {
      tl: { col: 1, row: 0.2 },
      ext: { width: 48, height: 48 },
    });
  }
  ws.getCell("B4").value = `Informe de ${mesCorto(inf.periodo)}`;
  ws.getCell("B4").font = titulo;
  ws.getCell("B5").value =
    `${inf.empresa} · CUIT ${cuitConGuiones(inf.cuit)}${inf.unidad ? ` · ${inf.unidad}` : ""}`;
  ws.getCell("B6").value =
    `Preparado por DC Consultora el ${fechaCorta(inf.generado)}`;
  ws.getCell("B6").font = { italic: true, color: { argb: "FF78716C" } };
  let f = 8;
  ws.getRow(f).values = ["", "Resumen del mes", "Importe", ""];
  encabezado(ws, f);
  for (const [n, v, nota] of filasResumen(inf)) {
    f++;
    ws.getRow(f).values = ["", n, v, nota];
    ws.getCell(`C${f}`).numFmt = NUM;
  }
  f += 2;
  ws.getRow(f).values = ["", "Indicador", "Valor", "Qué significa"];
  encabezado(ws, f);
  for (const i of inf.indicadores) {
    f++;
    ws.getRow(f).values = [
      "",
      `${i.nombre} (${ESTADO_TEXTO[i.estado]})`,
      i.valor,
      i.lectura,
    ];
    ws.getCell(`D${f}`).alignment = { wrapText: true, vertical: "top" };
  }
  if (inf.pendientes.length) {
    f += 2;
    ws.getRow(f).values = ["", "Para atender", "", ""];
    encabezado(ws, f);
    for (const p of inf.pendientes) ws.getRow(++f).values = ["", p];
  }
  if (inf.vencimientos.length) {
    f += 2;
    ws.getRow(f).values = ["", "Próximos vencimientos", "Fecha", "Impuesto"];
    encabezado(ws, f);
    for (const v of inf.vencimientos)
      ws.getRow(++f).values = ["", v.detalle, fechaCorta(v.fecha), v.impuesto];
  }

  // Evolución
  const ev = wb.addWorksheet("Mes a mes");
  ev.columns = [
    { header: "Mes", width: 18 },
    { header: "Ventas", width: 18, style: { numFmt: NUM } },
    { header: "Compras", width: 18, style: { numFmt: NUM } },
    { header: "Resultado", width: 18, style: { numFmt: NUM } },
  ];
  encabezado(ev, 1);
  for (const m of inf.meses)
    ev.addRow([mesCorto(m.periodo), m.ventas, m.compras, m.resultado]);

  // Libros IVA del período
  for (const [nombre, lista] of [
    ["Ventas del mes", inf.ventas],
    ["Compras del mes", inf.compras],
  ] as const) {
    if (!lista?.length) continue;
    const h = wb.addWorksheet(nombre);
    h.columns = [
      { header: "Fecha", width: 12 },
      { header: "Comprobante", width: 22 },
      { header: "Número", width: 16 },
      { header: "CUIT", width: 15 },
      { header: "Razón social", width: 34 },
      { header: "Neto gravado", width: 15, style: { numFmt: NUM } },
      { header: "No gravado / exento", width: 15, style: { numFmt: NUM } },
      { header: "IVA", width: 14, style: { numFmt: NUM } },
      { header: "Otros tributos", width: 14, style: { numFmt: NUM } },
      { header: "Total", width: 16, style: { numFmt: NUM } },
    ];
    encabezado(h, 1);
    for (const c of [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha)))
      h.addRow([
        fechaCorta(c.fecha),
        c.tipoNombre,
        `${String(c.puntoVenta).padStart(5, "0")}-${String(c.numeroDesde).padStart(8, "0")}`,
        cuitConGuiones(c.cuitContraparte),
        c.contraparte,
        c.netoGravado,
        c.noGravado + c.exento,
        c.iva,
        c.otrosTributos,
        c.total,
      ]);
    const n = lista.length + 1;
    const t = h.addRow([
      "Totales",
      "",
      "",
      "",
      "",
      ...["F", "G", "H", "I", "J"].map((col) => ({
        formula: `SUM(${col}2:${col}${n})`,
      })),
    ]);
    t.font = { bold: true };
    h.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ------------------------------------------------------------------------------------ PDF

const COLOR_ESTADO: Record<
  InformeMensual["indicadores"][number]["estado"],
  [number, number, number]
> = {
  bien: [12, 140, 12],
  atencion: [176, 120, 0],
  critico: [208, 59, 59],
  sin_datos: [120, 113, 108],
};

/** PDF para presentar: portada con el logo, el resumen, la salud de la empresa y la evolución. */
export async function pdfInforme(
  inf: InformeMensual,
  logoDataUrl?: string,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = doc.internal.pageSize.getWidth();
  const M = 16;

  // Franja superior con el logo y el título.
  doc.setFillColor(...MARCA_RGB);
  doc.rect(0, 0, ancho, 42, "F");
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", M, 9, 22, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(
    `Informe de ${mesCorto(inf.periodo)}`,
    M + (logoDataUrl ? 28 : 0),
    19,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(
    `${inf.empresa} · CUIT ${cuitConGuiones(inf.cuit)}${inf.unidad ? ` · ${inf.unidad}` : ""}`,
    M + (logoDataUrl ? 28 : 0),
    26,
  );
  doc.setFontSize(9);
  doc.text("DC Consultora · Estudio contable", M + (logoDataUrl ? 28 : 0), 32);

  // Tarjetas con los números principales.
  const r = inf.resumen;
  const tarjetas: [string, number][] = [
    [
      r.resultado >= 0 ? "Ganancia del mes" : "Pérdida del mes",
      Math.abs(r.resultado),
    ],
    ["Ventas", r.ventas],
    ["Caja y bancos", r.cajaYBancos],
    ["Te deben", r.teDeben],
  ];
  const gap = 4;
  const w = (ancho - 2 * M - gap * 3) / 4;
  let y = 50;
  tarjetas.forEach(([t, v], i) => {
    const x = M + i * (w + gap);
    doc.setFillColor(246, 240, 238);
    doc.roundedRect(x, y, w, 22, 3, 3, "F");
    doc.setTextColor(120, 113, 108);
    doc.setFontSize(8.5);
    doc.text(t, x + 4, y + 7);
    doc.setTextColor(...MARCA_RGB);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`$ ${pesos(v)}`, x + 4, y + 16);
    doc.setFont("helvetica", "normal");
  });
  y += 30;

  const titulo = (texto: string) => {
    doc.setTextColor(28, 25, 23);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(texto, M, y);
    doc.setFont("helvetica", "normal");
    y += 3;
  };
  const tabla = (
    opciones: Parameters<typeof autoTable>[1],
    derecha: number[] = [],
  ) => {
    const propio = opciones.didParseCell;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: "plain",
      styles: { fontSize: 9, cellPadding: 2.2, textColor: [41, 37, 36] },
      headStyles: { fillColor: MARCA_RGB, textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 248, 246] },
      ...opciones,
    });
    y =
      (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
        .finalY + 9;
  };

  titulo("Resumen del mes");
  tabla({
    head: [["Concepto", "Importe", ""]],
    body: filasResumen(inf).map(([n, v, nota]) => [n, `$ ${pesos(v)}`, nota]),
    columnStyles: {
      1: { halign: "right", fontStyle: "bold" },
      2: { textColor: [120, 113, 108] },
    },
  });

  titulo("¿Cómo está la salud de la empresa?");
  tabla(
    {
      head: [["Indicador", "Valor", "Estado", "Qué significa"]],
      body: inf.indicadores.map((i) => [
        i.nombre,
        i.valor,
        ESTADO_TEXTO[i.estado],
        i.lectura,
      ]),
      columnStyles: {
        1: { fontStyle: "bold", cellWidth: 22 },
        2: { cellWidth: 24 },
        0: { cellWidth: 40 },
      },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 2) {
          const estado = inf.indicadores[d.row.index].estado;
          d.cell.styles.textColor = COLOR_ESTADO[estado];
          d.cell.styles.fontStyle = "bold";
        }
      },
    },
    [1],
  );

  if (inf.meses.length) {
    if (y > 200) {
      doc.addPage();
      y = 20;
    }
    titulo("Ventas y compras de los últimos meses");
    // Gráfico de barras simple.
    const alto = 38;
    const max = Math.max(1, ...inf.meses.flatMap((m) => [m.ventas, m.compras]));
    const ancho1 = (ancho - 2 * M) / inf.meses.length;
    const base = y + alto + 4;
    inf.meses.forEach((m, i) => {
      const x = M + i * ancho1 + ancho1 * 0.2;
      const bw = ancho1 * 0.28;
      const hv = (m.ventas / max) * alto;
      const hc = (m.compras / max) * alto;
      doc.setFillColor(...MARCA_RGB);
      doc.rect(x, base - hv, bw, hv, "F");
      doc.setFillColor(217, 162, 143);
      doc.rect(x + bw + 1, base - hc, bw, hc, "F");
      doc.setFontSize(8);
      doc.setTextColor(120, 113, 108);
      doc.text(mesCorto(m.periodo).slice(0, 3), x + bw, base + 4.5, {
        align: "center",
      });
    });
    doc.setFillColor(...MARCA_RGB);
    doc.rect(M, base + 8, 3, 3, "F");
    doc.text("Ventas", M + 5, base + 10.5);
    doc.setFillColor(217, 162, 143);
    doc.rect(M + 22, base + 8, 3, 3, "F");
    doc.text("Compras (netas de IVA)", M + 27, base + 10.5);
    y = base + 18;
    tabla({
      head: [["Mes", "Ventas", "Compras", "Resultado"]],
      body: inf.meses.map((m) => [
        mesCorto(m.periodo),
        `$ ${pesos(m.ventas)}`,
        `$ ${pesos(m.compras)}`,
        `$ ${pesos(m.resultado)}`,
      ]),
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
    });
  }

  if (inf.vencimientos.length || inf.pendientes.length) {
    if (y > 230) {
      doc.addPage();
      y = 20;
    }
    if (inf.vencimientos.length) {
      titulo("Próximos vencimientos");
      tabla({
        head: [["Fecha", "Impuesto", "Detalle"]],
        body: inf.vencimientos.map((v) => [
          fechaCorta(v.fecha),
          v.impuesto,
          v.detalle,
        ]),
        columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 36 } },
      });
    }
    if (inf.pendientes.length) {
      titulo("Para atender");
      tabla({ body: inf.pendientes.map((p) => [`•  ${p}`]) });
    }
  }

  // Pie en todas las páginas.
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const alto = doc.internal.pageSize.getHeight();
    doc.setDrawColor(231, 229, 228);
    doc.line(M, alto - 14, ancho - M, alto - 14);
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text(
      `DC Consultora · Informe preparado el ${fechaCorta(inf.generado)}. Cifras históricas, sin auditar.`,
      M,
      alto - 9,
    );
    doc.text(`Página ${i} de ${paginas}`, ancho - M, alto - 9, {
      align: "right",
    });
  }
  return doc.output("blob");
}

/** Descarga un archivo generado en el navegador. */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
