// Pasa a PDF el Excel de los estados contables tal cual el modelo (RT 54): cada hoja es una
// página con sus mismos cuadros, celdas combinadas, negritas y rellenos. Calcula las fórmulas de
// suma del modelo, porque el Excel generado no guarda sus resultados.
import type { Cell, CellValue, Workbook, Worksheet } from "exceljs";
import { pesos } from "@/lib/formato";

// --------------------------------------------------------------------------- fórmulas

function columna(letras: string) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function letras(n: number) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Evalúa las fórmulas de una hoja: números, celdas, rangos dentro de SUM, + - * / y paréntesis. */
export function evaluador(ws: { getCell: (ref: string) => Cell }) {
  const cache = new Map<string, number>();
  const enCurso = new Set<string>();

  const valorCelda = (ref: string): number => {
    const r = ref.replace(/\$/g, "").toUpperCase();
    if (cache.has(r)) return cache.get(r)!;
    if (enCurso.has(r)) return 0; // referencia circular: se corta
    enCurso.add(r);
    const cell = ws.getCell(r);
    // Las fórmulas compartidas del modelo vienen ya trasladadas en cell.formula.
    const f = (cell as Cell).formula;
    const v = f ? calcular(String(f)) : numero(cell.value);
    enCurso.delete(r);
    cache.set(r, v);
    return v;
  };

  const numero = (v: CellValue): number => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "object" && "formula" in v && v.formula)
      return calcular(String(v.formula));
    if (typeof v === "object" && "sharedFormula" in v) return 0;
    if (typeof v === "object" && "result" in v && typeof v.result === "number")
      return v.result;
    return 0;
  };

  const rango = (a: string, b: string) => {
    const [, ca, fa] = a.replace(/\$/g, "").match(/([A-Z]+)(\d+)/i)!;
    const [, cb, fb] = b.replace(/\$/g, "").match(/([A-Z]+)(\d+)/i)!;
    let t = 0;
    for (
      let c = Math.min(columna(ca), columna(cb));
      c <= Math.max(columna(ca), columna(cb));
      c++
    )
      for (let f = Math.min(+fa, +fb); f <= Math.max(+fa, +fb); f++)
        t += valorCelda(`${letras(c)}${f}`);
    return t;
  };

  function calcular(formula: string): number {
    const s = formula.replace(/^=/, "").replace(/\s+/g, "").toUpperCase();
    let i = 0;
    const ver = () => s[i];
    function expresion(): number {
      let v = termino();
      while (ver() === "+" || ver() === "-")
        v = s[i++] === "+" ? v + termino() : v - termino();
      return v;
    }
    function termino(): number {
      let v = factor();
      while (ver() === "*" || ver() === "/") {
        const op = s[i++];
        const w = factor();
        v = op === "*" ? v * w : w === 0 ? 0 : v / w;
      }
      return v;
    }
    function factor(): number {
      if (ver() === "-") {
        i++;
        return -factor();
      }
      if (ver() === "+") {
        i++;
        return factor();
      }
      if (ver() === "(") {
        i++;
        const v = expresion();
        i++;
        return v;
      }
      const m = s.slice(i).match(/^(SUM)\(/);
      if (m) {
        i += m[0].length;
        let t = 0;
        while (i < s.length && ver() !== ")") {
          const r = s.slice(i).match(/^(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/);
          if (r) {
            t += rango(r[1], r[2]);
            i += r[0].length;
          } else t += expresion();
          if (ver() === ",") i++;
        }
        i++;
        return t;
      }
      const ref = s.slice(i).match(/^\$?[A-Z]+\$?\d+/);
      if (ref) {
        i += ref[0].length;
        return valorCelda(ref[0]);
      }
      const n = s.slice(i).match(/^\d+(\.\d+)?/);
      if (n) {
        i += n[0].length;
        return Number(n[0]);
      }
      i = s.length; // algo no soportado: se corta
      return 0;
    }
    try {
      return expresion();
    } catch {
      return 0;
    }
  }

  return { valorCelda, calcular };
}

// --------------------------------------------------------------------------- celdas a texto

function texto(
  cell: Cell,
  calc: ReturnType<typeof evaluador>,
): { t: string; numero: boolean } {
  const v = cell.value;
  if (v === null || v === undefined) return { t: "", numero: false };
  if (v instanceof Date)
    return {
      t: `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`,
      numero: false,
    };
  let n: number | null = null;
  if (typeof v === "number") n = v;
  else if (
    cell.formula ||
    (typeof v === "object" && ("formula" in v || "sharedFormula" in v))
  )
    n = calc.valorCelda(cell.address);
  else if (typeof v === "object" && "richText" in v)
    return { t: v.richText.map((r) => r.text).join(""), numero: false };
  else if (typeof v === "object" && "text" in v)
    return { t: String(v.text), numero: false };
  if (n === null) return { t: String(v), numero: false };
  const fmt = String(cell.numFmt ?? "");
  if (Math.abs(n) < 0.005) return { t: "-", numero: true };
  if (/%/.test(fmt))
    return {
      t: `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`,
      numero: true,
    };
  const decimales = /0\.0/.test(fmt) || !fmt || fmt === "General" ? 2 : 0;
  const base = decimales
    ? pesos(Math.abs(n))
    : Math.abs(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return {
    t: n < 0 ? (/\(/.test(fmt) ? `(${base})` : `-${base}`) : base,
    numero: true,
  };
}

function colorRgb(argb?: string): [number, number, number] | undefined {
  if (!argb || argb.length < 6) return undefined;
  const h = argb.slice(-6);
  const c: [number, number, number] = [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
  return c.every((x) => x >= 250) ? undefined : c;
}

// --------------------------------------------------------------------------- hoja a tabla

export interface OpcionesPdf {
  /** Texto al pie de cada página. */
  pie: string;
  /** Hojas que no van (por nombre). */
  excluir?: (nombre: string) => boolean;
  /** Corta la hoja donde empieza este texto (las aclaraciones del modelo). */
  cortarEn?: RegExp;
}

export async function pdfDesdeExcel(
  buffer: ArrayBuffer,
  o: OpcionesPdf,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb: Workbook = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  let doc: InstanceType<typeof jsPDF> | null = null;

  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    if (o.excluir?.(ws.name)) continue;
    const calc = evaluador(ws);

    // Hasta dónde llega el contenido (sin las aclaraciones del modelo).
    let ultimaFila = 0;
    let ultimaCol = 0;
    let corte = Infinity;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const v = cell.value;
        if (o.cortarEn && typeof v === "string" && o.cortarEn.test(v))
          corte = Math.min(corte, r);
        if (v === null || v === undefined || v === "") return;
        ultimaFila = Math.max(ultimaFila, r);
        ultimaCol = Math.max(ultimaCol, c);
      });
    });
    ultimaFila = Math.min(ultimaFila, corte - 1);
    if (ultimaFila < 1 || ultimaCol < 1) continue;

    // Celdas combinadas: la principal lleva colSpan/rowSpan y las demás se saltean.
    const combinadas = new Map<string, { filas: number; cols: number }>();
    const tapadas = new Set<string>();
    const merges = (ws.model as { merges?: string[] }).merges ?? [];
    for (const m of merges) {
      const [a, b] = m.split(":");
      const ma = a.match(/([A-Z]+)(\d+)/)!;
      const mb = (b ?? a).match(/([A-Z]+)(\d+)/)!;
      const c1 = columna(ma[1]);
      const f1 = +ma[2];
      const c2 = Math.min(columna(mb[1]), ultimaCol);
      const f2 = Math.min(+mb[2], ultimaFila);
      if (f1 > ultimaFila || c1 > ultimaCol) continue;
      combinadas.set(`${f1}:${c1}`, { filas: f2 - f1 + 1, cols: c2 - c1 + 1 });
      for (let f = f1; f <= f2; f++)
        for (let c = c1; c <= c2; c++)
          if (f !== f1 || c !== c1) tapadas.add(`${f}:${c}`);
    }

    // Anchos de columna del Excel, llevados al ancho de la página.
    const anchos = Array.from({ length: ultimaCol }, (_, k) => {
      const w = ws.getColumn(k + 1).width;
      return w && w > 0 ? w : 10;
    });
    const total = anchos.reduce((t, w) => t + w, 0);
    const apaisada = total > 120;
    if (!doc)
      doc = new jsPDF({
        unit: "mm",
        format: "a4",
        orientation: apaisada ? "landscape" : "portrait",
      });
    else doc.addPage("a4", apaisada ? "landscape" : "portrait");
    const anchoPagina = doc.internal.pageSize.getWidth() - 24;
    const escala = anchoPagina / total;
    const letra = Math.max(
      5.5,
      Math.min(8.5, 8.5 * Math.min(1, anchoPagina / total / 1.9)),
    );

    const vacia = (r: number, c: number) => {
      if (tapadas.has(`${r}:${c}`) || combinadas.has(`${r}:${c}`)) return false;
      const v = ws.getCell(r, c).value;
      return v === null || v === undefined || v === "";
    };
    const body: unknown[][] = [];
    for (let r = 1; r <= ultimaFila; r++) {
      const fila: unknown[] = [];
      for (let c = 1; c <= ultimaCol; c++) {
        if (tapadas.has(`${r}:${c}`)) continue;
        const cell = ws.getCell(r, c);
        const { t, numero } = texto(cell, calc);
        let span = combinadas.get(`${r}:${c}`);
        // Como en Excel: un texto sin ajuste se extiende sobre las celdas vacías de la derecha.
        if (!span && t && !numero && !cell.alignment?.wrapText) {
          let extra = 0;
          while (c + extra + 1 <= ultimaCol && vacia(r, c + extra + 1)) extra++;
          if (extra) {
            span = { filas: 1, cols: extra + 1 };
            for (let k = 1; k <= extra; k++) tapadas.add(`${r}:${c + k}`);
          }
        }
        const fill =
          cell.fill && cell.fill.type === "pattern"
            ? colorRgb(
                (cell.fill.fgColor as { argb?: string } | undefined)?.argb,
              )
            : undefined;
        fila.push({
          content: t,
          colSpan: span?.cols,
          rowSpan: span?.filas,
          styles: {
            fontStyle: cell.font?.bold ? "bold" : "normal",
            halign: numero
              ? "right"
              : cell.alignment?.horizontal === "center" ||
                  cell.alignment?.horizontal === "centerContinuous"
                ? "center"
                : "left",
            valign: "middle",
            fillColor: fill,
            textColor: colorRgb(cell.font?.color?.argb) ?? [28, 25, 23],
            fontSize:
              cell.font?.size && cell.font.size > 12 ? letra + 2 : letra,
          },
        });
      }
      body.push(fila);
    }
    autoTable(doc, {
      body: body as never,
      startY: 12,
      margin: { left: 12, right: 12, top: 12, bottom: 16 },
      theme: "plain",
      styles: {
        fontSize: letra,
        cellPadding: { top: 0.8, bottom: 0.8, left: 1, right: 1 },
        overflow: "linebreak",
        lineWidth: 0,
      },
      columnStyles: Object.fromEntries(
        anchos.map((w, k) => [k, { cellWidth: w * escala }]),
      ),
      // Filas vacías del modelo: más bajas.
      didParseCell: (d) => {
        if (d.cell.text.join("").trim() === "") d.cell.styles.minCellHeight = 2;
      },
    });
  }
  if (!doc) throw new Error("El Excel no tiene hojas con contenido.");
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5);
    doc.setTextColor(120, 113, 108);
    doc.text(o.pie, 12, h - 7);
    doc.text(`Página ${i} de ${paginas}`, w - 12, h - 7, { align: "right" });
  }
  return doc.output("blob");
}
