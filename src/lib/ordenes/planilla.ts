// Lee la planilla Excel "Seguimiento de órdenes de trabajo" (hojas Trabajos, Clientes y Tipo de
// trabajos) para pasarla al sistema, y arma la planilla para descargar con las órdenes cargadas.
import type { CellValue, Workbook, Worksheet } from "exceljs";
import {
  type EstadoOrden,
  type OrdenTrabajo,
  type PagoOrden,
  cobrado,
  manoDeObra,
  saldo,
  sinIva,
} from "./ordenes";

export interface ClientePlanilla {
  nombre: string;
  cuit: string;
  domicilio: string;
  localidad: string;
  telefono: string;
  email: string;
}

export interface PlanillaOrdenes {
  ordenes: OrdenTrabajo[];
  clientes: ClientePlanilla[];
  tipos: string[];
}

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** El valor que se ve en la celda (el resultado, si es una fórmula). */
function valor(v: CellValue): string | number | Date | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v === "number" || typeof v === "string")
    return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") {
    if ("result" in v) return valor((v.result ?? null) as CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if ("formula" in v || "sharedFormula" in v) return null;
  }
  return null;
}

const esFormula = (v: CellValue) =>
  !!v && typeof v === "object" && ("formula" in v || "sharedFormula" in v);

const texto = (v: CellValue) => {
  const x = valor(v);
  if (x === null) return "";
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  return String(x).trim();
};

function numero(v: CellValue) {
  const x = valor(v);
  if (typeof x === "number") return Number.isFinite(x) ? x : 0;
  if (typeof x === "string") {
    const limpio = x.replace(/[$\s]/g, "");
    const n = Number(
      /,\d{1,2}$/.test(limpio)
        ? limpio.replace(/\./g, "").replace(",", ".")
        : limpio.replace(/,/g, ""),
    );
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function fecha(v: CellValue) {
  const x = valor(v);
  if (x instanceof Date) return x.toISOString().slice(0, 10);
  if (typeof x === "number" && x > 20000 && x < 80000)
    return new Date(Date.UTC(1899, 11, 30) + x * 86400000)
      .toISOString()
      .slice(0, 10);
  if (typeof x === "string") {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(x.trim());
    if (m) {
      const a = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(x)) return x.slice(0, 10);
  }
  return null;
}

function estado(t: string): EstadoOrden {
  const n = normal(t);
  if (n.startsWith("en proceso")) return "En proceso";
  if (n.startsWith("no empezad") || n === "") return "No empezado";
  return "Terminado";
}

/** Busca la fila de títulos (la que tiene todos los nombres pedidos) y devuelve columna por título. */
function titulos(ws: Worksheet, pedidos: string[]) {
  for (let f = 1; f <= Math.min(ws.rowCount, 15); f++) {
    const cols: { col: number; nombre: string }[] = [];
    ws.getRow(f).eachCell((c, col) => {
      const t = normal(texto(c.value));
      if (t) cols.push({ col, nombre: t });
    });
    if (pedidos.every((p) => cols.some((c) => c.nombre.startsWith(p))))
      return { fila: f, cols };
  }
  return null;
}

function leerTrabajos(ws: Worksheet): OrdenTrabajo[] {
  const t = titulos(ws, ["fecha", "cliente", "pedido", "total"]);
  if (!t) return [];
  const col = (inicio: string) =>
    t.cols.find((c) => c.nombre.startsWith(inicio))?.col;
  const c = {
    fecha: col("fecha"),
    cliente: col("cliente"),
    pedido: col("pedido"),
    ot: t.cols.find((x) => x.nombre === "ot")?.col,
    tipo: col("tipo"),
    info: col("informacion"),
    cantidad: col("cantidad"),
    total: col("total"),
    sinIva: col("sin iva"),
    factura: t.cols.find((x) => x.nombre === "factura")?.col,
    iva: t.cols.find((x) => x.nombre === "iva")?.col,
    materia: col("materia"),
    estado: col("estado"),
  };
  // Los pagos: cada "Fecha N" abre uno; "Pago N" es el importe y "Recibo" el comprobante.
  const columnasPago: { fecha?: number; importe?: number; recibo?: number }[] =
    [];
  for (const x of t.cols) {
    if (/^fecha ?\d/.test(x.nombre)) columnasPago.push({ fecha: x.col });
    else if (/^pago ?\d/.test(x.nombre)) {
      const ultimo = columnasPago.at(-1);
      if (ultimo && ultimo.importe === undefined) ultimo.importe = x.col;
      else columnasPago.push({ importe: x.col });
    } else if (/^recibo/.test(x.nombre)) {
      const ultimo = columnasPago.at(-1);
      if (ultimo && ultimo.recibo === undefined) ultimo.recibo = x.col;
    }
  }

  const ordenes: OrdenTrabajo[] = [];
  for (let f = t.fila + 1; f <= ws.rowCount; f++) {
    const fila = ws.getRow(f);
    const v = (n?: number) => (n ? fila.getCell(n).value : null);
    const dia = fecha(v(c.fecha));
    const total = numero(v(c.total));
    const cliente = texto(v(c.cliente));
    if (!dia || (!total && !cliente)) continue;
    let ultimaFecha = dia;
    const pagos: PagoOrden[] = [];
    for (const p of columnasPago) {
      const importe = numero(v(p.importe));
      const cuando = fecha(v(p.fecha));
      if (cuando) ultimaFecha = cuando;
      if (!importe) continue;
      pagos.push({
        fecha: cuando ?? ultimaFecha,
        importe,
        recibo: texto(v(p.recibo)),
      });
    }
    const factura = texto(v(c.factura));
    ordenes.push({
      numero: texto(v(c.pedido)),
      fecha: dia,
      cliente,
      tipo: texto(v(c.tipo)),
      detalle: texto(v(c.info)),
      cantidad: numero(v(c.cantidad)),
      total,
      // Si el IVA es una fórmula (total − sin IVA) ya está dentro del total: no se suma aparte.
      ivaAparte: esFormula(v(c.iva)) ? 0 : numero(v(c.iva)),
      conFactura: !!factura || (c.sinIva ? v(c.sinIva) !== null : false),
      factura,
      materiales: numero(v(c.materia)),
      ot: texto(v(c.ot)),
      estado: estado(texto(v(c.estado))),
      pagos,
    });
  }
  return ordenes;
}

function leerClientes(ws: Worksheet): ClientePlanilla[] {
  const t = titulos(ws, ["cliente"]);
  if (!t) return [];
  const col = (inicio: string) =>
    t.cols.find((c) => c.nombre.startsWith(inicio))?.col;
  const c = {
    nombre: col("cliente"),
    domicilio: col("domicilio"),
    localidad: col("localidad"),
    telefono: col("telefono"),
    email: col("correo") ?? col("mail") ?? col("email"),
  };
  const vistos = new Set<string>();
  const lista: ClientePlanilla[] = [];
  for (let f = t.fila + 1; f <= ws.rowCount; f++) {
    const fila = ws.getRow(f);
    const v = (n?: number) => (n ? texto(fila.getCell(n).value) : "");
    const nombre = v(c.nombre).replace(/\s+/g, " ");
    if (!nombre || vistos.has(nombre.toLowerCase())) continue;
    vistos.add(nombre.toLowerCase());
    let telefono = v(c.telefono);
    // A veces en el teléfono anotaron el CUIT.
    const cuit = /(\d{2})-?(\d{8})-?(\d)/.exec(telefono);
    if (cuit && /cuit/i.test(telefono)) telefono = "";
    lista.push({
      nombre,
      cuit: cuit ? cuit.slice(1).join("") : "",
      domicilio: v(c.domicilio),
      localidad: v(c.localidad),
      telefono,
      email: v(c.email),
    });
  }
  return lista;
}

function leerTipos(ws: Worksheet) {
  const t = titulos(ws, ["tipo"]);
  if (!t) return [];
  const col = t.cols.find((c) => c.nombre.startsWith("tipo"))!.col;
  const tipos = new Set<string>();
  for (let f = t.fila + 1; f <= ws.rowCount; f++) {
    const x = texto(ws.getRow(f).getCell(col).value).replace(/\s+/g, " ");
    if (x) tipos.add(x);
  }
  return [...tipos];
}

export function leerPlanillaOrdenes(wb: Workbook): PlanillaOrdenes {
  const hojas = wb.worksheets;
  const buscar = (re: RegExp) => hojas.find((h) => re.test(normal(h.name)));
  const trabajos =
    buscar(/^trabajos?$/) ??
    hojas.find((h) => titulos(h, ["fecha", "cliente", "pedido", "total"]));
  const clientes = buscar(/^clientes?$/);
  const tipos = buscar(/^tipos? de trabajo/);
  return {
    ordenes: trabajos ? leerTrabajos(trabajos) : [],
    clientes: clientes ? leerClientes(clientes) : [],
    tipos: tipos ? leerTipos(tipos) : [],
  };
}

/**
 * Las planillas con "formato de tabla" de Excel a veces no abren con la librería: se les sacan las
 * definiciones de tabla (los datos quedan igual) y se vuelve a intentar.
 */
async function sinTablas(datos: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(datos);
  for (const nombre of Object.keys(zip.files)) {
    if (/^xl\/tables\//.test(nombre)) zip.remove(nombre);
    else if (/^xl\/worksheets\/_rels\/.*\.rels$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(nombre, xml.replace(/<Relationship [^>]*\/table"[^>]*\/>/g, ""));
    } else if (/^xl\/worksheets\/[^/]+\.xml$/.test(nombre)) {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(
        nombre,
        xml.replace(
          /<tableParts[^>]*\/>|<tableParts[\s\S]*?<\/tableParts>/g,
          "",
        ),
      );
    } else if (nombre === "[Content_Types].xml") {
      const xml = await zip.file(nombre)!.async("string");
      zip.file(
        nombre,
        xml.replace(/<Override [^>]*\/xl\/tables\/[^>]*\/>/g, ""),
      );
    }
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

export async function leerArchivoOrdenes(datos: ArrayBuffer) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(datos);
  } catch {
    const otro = new ExcelJS.Workbook();
    await otro.xlsx.load(await sinTablas(datos));
    return leerPlanillaOrdenes(otro);
  }
  return leerPlanillaOrdenes(wb);
}

/** La planilla para descargar, con las mismas columnas que usa la fábrica. */
export async function excelOrdenes(
  ordenes: OrdenTrabajo[],
  empresa: string,
  unidad: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "DC Consultora";
  const ws = wb.addWorksheet("Trabajos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const maxPagos = Math.max(1, ...ordenes.map((o) => o.pagos.length));
  const columnas: { header: string; width: number; num?: boolean }[] = [
    { header: "Fecha", width: 11 },
    { header: "Pedido Nº", width: 11 },
    { header: "Cliente", width: 26 },
    { header: "Tipo de trabajo", width: 20 },
    { header: "Información adicional", width: 34 },
    { header: "Cantidad", width: 9, num: true },
    { header: "Total", width: 15, num: true },
    { header: "IVA aparte", width: 12, num: true },
    { header: "Factura", width: 10 },
    { header: "Sin IVA", width: 15, num: true },
    { header: "Materiales", width: 15, num: true },
    { header: "Mano de obra", width: 15, num: true },
    { header: "OT", width: 8 },
    { header: "Estado", width: 12 },
  ];
  for (let i = 1; i <= maxPagos; i++)
    columnas.push(
      { header: `Fecha ${i}`, width: 11 },
      { header: `Pago ${i}`, width: 14, num: true },
      { header: `Recibo ${i}`, width: 11 },
    );
  columnas.push(
    { header: "Cobrado", width: 15, num: true },
    { header: "Saldo", width: 15, num: true },
  );
  ws.columns = columnas.map((c) => ({ header: c.header, width: c.width }));
  const encabezado = ws.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.eachCell((c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF591101" },
    };
  });
  const f = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : null);
  const ordenadas = [...ordenes].sort((a, b) =>
    a.fecha === b.fecha
      ? a.numero.localeCompare(b.numero)
      : a.fecha.localeCompare(b.fecha),
  );
  for (const o of ordenadas) {
    const pagos = Array.from({ length: maxPagos }, (_, i) => o.pagos[i]);
    ws.addRow([
      f(o.fecha),
      o.numero,
      o.cliente,
      o.tipo,
      o.detalle,
      o.cantidad,
      o.total,
      o.ivaAparte || null,
      o.conFactura ? o.factura || "Sí" : "",
      o.conFactura ? sinIva(o) : null,
      o.materiales,
      manoDeObra(o),
      o.ot,
      o.estado,
      ...pagos.flatMap((p) =>
        p ? [f(p.fecha), p.importe, p.recibo] : [null, null, null],
      ),
      cobrado(o),
      saldo(o),
    ]);
  }
  columnas.forEach((c, i) => {
    const columna = ws.getColumn(i + 1);
    if (c.num) columna.numFmt = "#,##0.00;[Red]-#,##0.00";
    else if (/^Fecha/.test(c.header)) columna.numFmt = "dd/mm/yyyy";
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columnas.length },
  };
  wb.title = `Órdenes de trabajo ${unidad} — ${empresa}`;
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
