// Base común de los PDF del estudio: franja bordó con el logo, títulos, tablas y pie.
import type { jsPDF as JsPdf } from "jspdf";
import type { UserOptions } from "jspdf-autotable";
import { fechaCorta, pesos } from "@/lib/formato";

export const MARCA_RGB: [number, number, number] = [89, 17, 1];
export const CLARO_RGB: [number, number, number] = [217, 162, 143];
const GRIS: [number, number, number] = [120, 113, 108];

export interface PdfEstudio {
  doc: JsPdf;
  ancho: number;
  margen: number;
  y: number;
  titulo: (texto: string, nota?: string) => void;
  tabla: (opciones: UserOptions, derecha?: number[]) => void;
  tarjetas: (lista: [string, string, string?][]) => void;
  barras: (
    datos: { etiqueta: string; valores: number[] }[],
    series: { nombre: string; color: [number, number, number] }[],
  ) => void;
  texto: (t: string) => void;
  /** Pasa de página si no quedan al menos `mm` milímetros. */
  lugar: (mm: number) => void;
  terminar: (generado: string, nota?: string) => Blob;
}

export async function nuevoPdf(o: {
  titulo: string;
  subtitulo: string;
  logo?: string;
  apaisado?: boolean;
}): Promise<PdfEstudio> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({
    unit: "mm",
    format: "a4",
    orientation: o.apaisado ? "landscape" : "portrait",
  });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = () => doc.internal.pageSize.getHeight();
  const M = 16;
  const x0 = M + (o.logo ? 28 : 0);
  doc.setFillColor(...MARCA_RGB);
  doc.rect(0, 0, ancho, 42, "F");
  if (o.logo) doc.addImage(o.logo, "PNG", M, 9, 22, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(o.titulo, x0, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(o.subtitulo, x0, 26);
  doc.setFontSize(9);
  doc.text("DC Consultora · Estudio contable", x0, 32);

  const p: PdfEstudio = {
    doc,
    ancho,
    margen: M,
    y: 50,
    lugar(mm) {
      if (p.y + mm > alto() - 20) {
        doc.addPage();
        p.y = 20;
      }
    },
    titulo(texto, nota) {
      p.lugar(30);
      doc.setTextColor(28, 25, 23);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.text(texto, M, p.y);
      doc.setFont("helvetica", "normal");
      if (nota) {
        doc.setFontSize(8.5);
        doc.setTextColor(...GRIS);
        doc.text(nota, ancho - M, p.y, { align: "right" });
      }
      p.y += 3;
    },
    texto(t) {
      doc.setFontSize(9.5);
      doc.setTextColor(68, 64, 60);
      const lineas = doc.splitTextToSize(t, ancho - 2 * M);
      const alto = lineas.length * 4.4;
      p.lugar(alto + 4);
      doc.text(lineas, M, p.y + 3.5, { lineHeightFactor: 1.25 });
      p.y += alto + 2.5;
    },
    tabla(opciones, derecha = []) {
      const propio = opciones.didParseCell;
      autoTable(doc, {
        startY: p.y,
        margin: { left: M, right: M },
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 2.2, textColor: [41, 37, 36] },
        headStyles: { fillColor: MARCA_RGB, textColor: 255, fontStyle: "bold" },
        footStyles: {
          fillColor: [246, 240, 238],
          textColor: MARCA_RGB,
          fontStyle: "bold",
        },
        alternateRowStyles: { fillColor: [250, 248, 246] },
        showFoot: "lastPage",
        ...opciones,
        didParseCell: (d) => {
          if (derecha.includes(d.column.index)) d.cell.styles.halign = "right";
          propio?.(d);
        },
      });
      p.y =
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 9;
    },
    tarjetas(lista) {
      const gap = 4;
      const w = (ancho - 2 * M - gap * (lista.length - 1)) / lista.length;
      p.lugar(28);
      lista.forEach(([t, v, nota], i) => {
        const x = M + i * (w + gap);
        doc.setFillColor(246, 240, 238);
        doc.roundedRect(x, p.y, w, nota ? 25 : 22, 3, 3, "F");
        doc.setTextColor(...GRIS);
        doc.setFontSize(8.5);
        doc.text(t, x + 4, p.y + 7);
        doc.setTextColor(...MARCA_RGB);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(v, x + 4, p.y + 16);
        doc.setFont("helvetica", "normal");
        if (nota) {
          doc.setFontSize(7.5);
          doc.setTextColor(...GRIS);
          doc.text(nota, x + 4, p.y + 21.5);
        }
      });
      p.y += (lista.some((l) => l[2]) ? 25 : 22) + 9;
    },
    barras(datos, series) {
      const altoG = 38;
      p.lugar(altoG + 24);
      const max = Math.max(1, ...datos.flatMap((d) => d.valores));
      const anchoG = (ancho - 2 * M) / Math.max(1, datos.length);
      const base = p.y + altoG + 4;
      const bw = (anchoG * 0.6) / series.length;
      datos.forEach((d, i) => {
        const x = M + i * anchoG + anchoG * 0.2;
        d.valores.forEach((v, j) => {
          const h = (Math.max(0, v) / max) * altoG;
          doc.setFillColor(...series[j].color);
          doc.rect(x + j * bw, base - h, bw * 0.92, h, "F");
        });
        doc.setFontSize(datos.length > 8 ? 6.5 : 8);
        doc.setTextColor(...GRIS);
        doc.text(d.etiqueta, x + (bw * series.length) / 2, base + 4.5, {
          align: "center",
        });
      });
      let lx = M;
      for (const s of series) {
        doc.setFillColor(...s.color);
        doc.rect(lx, base + 8, 3, 3, "F");
        doc.setFontSize(8);
        doc.text(s.nombre, lx + 5, base + 10.5);
        lx += doc.getTextWidth(s.nombre) + 14;
      }
      p.y = base + 18;
    },
    terminar(generado, nota = "Cifras históricas, sin auditar.") {
      const paginas = doc.getNumberOfPages();
      for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        const h = alto();
        doc.setDrawColor(231, 229, 228);
        doc.line(M, h - 14, ancho - M, h - 14);
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        doc.text(
          `DC Consultora · Preparado el ${fechaCorta(generado)}. ${nota}`,
          M,
          h - 9,
        );
        doc.text(`Página ${i} de ${paginas}`, ancho - M, h - 9, {
          align: "right",
        });
      }
      return doc.output("blob");
    },
  };
  return p;
}

export const $ = (n: number) => `$ ${pesos(n)}`;

/** Encabezado y estilos comunes de las planillas Excel del estudio. */
export async function nuevoExcel(
  titulo: string,
  subtitulo: string,
  logo?: ArrayBuffer,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DC Consultora";
  const portada = (ws: import("exceljs").Worksheet) => {
    if (logo) {
      const id = wb.addImage({ buffer: logo, extension: "png" });
      ws.addImage(id, {
        tl: { col: 1, row: 0.2 },
        ext: { width: 48, height: 48 },
      });
    }
    ws.getCell("B4").value = titulo;
    ws.getCell("B4").font = {
      bold: true,
      size: 16,
      color: { argb: "FF591101" },
    };
    ws.getCell("B5").value = subtitulo;
    ws.getCell("B6").value = "Preparado por DC Consultora";
    ws.getCell("B6").font = { italic: true, color: { argb: "FF78716C" } };
  };
  const encabezado = (ws: import("exceljs").Worksheet, fila: number) => {
    const r = ws.getRow(fila);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF591101" },
      };
    });
  };
  const blob = async () =>
    new Blob([await wb.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  return { wb, portada, encabezado, blob, NUM: "#,##0.00;[Red]-#,##0.00" };
}
