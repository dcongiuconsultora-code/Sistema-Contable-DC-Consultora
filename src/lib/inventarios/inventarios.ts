/** Rubros de bienes de cambio con su cuenta del plan. */
export const RUBROS_STOCK = [
  {
    cuenta: "1.1.05.001",
    nombre: "Mercaderías de reventa",
    claves: ["mercader", "reventa", "kiosco"],
  },
  {
    cuenta: "1.1.05.002",
    nombre: "Materias primas",
    claves: ["materia", "prima", "mp"],
  },
  {
    cuenta: "1.1.05.003",
    nombre: "Productos en proceso",
    claves: ["proceso", "elaboraci"],
  },
  {
    cuenta: "1.1.05.004",
    nombre: "Productos terminados",
    claves: ["terminad"],
  },
  {
    cuenta: "1.1.05.005",
    nombre: "Materiales, insumos y envases",
    claves: ["material", "insumo", "envase"],
  },
] as const;

export interface LineaInventario {
  cuenta: string;
  producto: string;
  cantidad: number;
  medida?: string;
  costo: number;
}

export interface Inventario {
  id?: string;
  fecha: string;
  unidad?: string | null;
  descripcion: string;
  lineas: LineaInventario[];
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export function totalLinea(l: LineaInventario) {
  return redondear(l.cantidad * l.costo);
}

/** Valor total por cuenta de bienes de cambio. */
export function totalesPorCuenta(inv: Inventario): Record<string, number> {
  const t: Record<string, number> = {};
  for (const l of inv.lineas)
    t[l.cuenta] = redondear((t[l.cuenta] ?? 0) + totalLinea(l));
  return t;
}

/** Existencia final a una fecha: suma de los inventarios de esa fecha (todas las unidades). */
export function existenciaAFecha(inventarios: Inventario[], fecha: string) {
  const del = inventarios.filter((i) => i.fecha === fecha);
  if (!del.length) return null;
  const t: Record<string, number> = {};
  for (const inv of del)
    for (const [c, v] of Object.entries(totalesPorCuenta(inv)))
      t[c] = redondear((t[c] ?? 0) + v);
  return t;
}

function normalizar(t: unknown) {
  return String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function numero(v: unknown) {
  if (typeof v === "number") return v;
  const t = String(v ?? "")
    .replace(/\$/g, "")
    .trim();
  if (!t) return NaN;
  // 1.234,56 · 3.100 (miles con punto) · 1234.56
  const limpio = /,\d{1,4}$/.test(t)
    ? t.replace(/\./g, "").replace(",", ".")
    : /^-?\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t.replace(/,/g, "");
  return Number(limpio);
}

/** Rubro por texto ("Materia prima", "MP", "terminados"…); si no se reconoce, el de por defecto. */
export function rubroDeTexto(texto: unknown, porDefecto: string) {
  const t = normalizar(texto);
  if (!t) return porDefecto;
  return (
    RUBROS_STOCK.find((r) => r.claves.some((c) => t.includes(c)))?.cuenta ??
    porDefecto
  );
}

/**
 * Lee una planilla de inventario: busca la fila de títulos (producto/descripción, cantidad,
 * costo/precio, y opcionalmente rubro y unidad de medida) y toma las filas de abajo.
 */
export function inventarioDesdeFilas(
  filas: unknown[][],
  rubroPorDefecto: string,
) {
  const encabezado = filas.findIndex((f) => {
    const t = f.map(normalizar);
    return (
      t.some((x) => /producto|descripcion|articulo|detalle/.test(x)) &&
      t.some((x) => /cantidad|cant\b|stock/.test(x))
    );
  });
  if (encabezado < 0)
    throw new Error(
      "No encontré los títulos: la planilla tiene que tener columnas Producto, Cantidad y Costo.",
    );
  const t = filas[encabezado].map(normalizar);
  const col = (re: RegExp) => t.findIndex((x) => re.test(x));
  const cProducto = col(/producto|descripcion|articulo|detalle/);
  const cCantidad = col(/cantidad|cant\b|stock/);
  const cCosto = col(/costo|precio|valor unit|unitario/);
  const cRubro = col(/rubro|tipo|categoria|etapa/);
  const cMedida = col(/medida|unidad de medida|u\.? ?m/);
  if (cCosto < 0) throw new Error("Falta la columna de costo unitario.");
  const lineas: LineaInventario[] = [];
  const errores: string[] = [];
  for (let i = encabezado + 1; i < filas.length; i++) {
    const f = filas[i];
    const producto = String(f[cProducto] ?? "").trim();
    if (!producto) continue;
    const cantidad = numero(f[cCantidad]);
    const costo = numero(f[cCosto]);
    if (!Number.isFinite(cantidad) || !Number.isFinite(costo)) {
      errores.push(
        `Fila ${i + 1} (${producto}): cantidad o costo no son números.`,
      );
      continue;
    }
    lineas.push({
      cuenta:
        cRubro >= 0
          ? rubroDeTexto(f[cRubro], rubroPorDefecto)
          : rubroPorDefecto,
      producto,
      cantidad,
      medida:
        cMedida >= 0 ? String(f[cMedida] ?? "").trim() || undefined : undefined,
      costo,
    });
  }
  return { lineas, errores };
}

/** Nombres cortos para la lista desplegable del modelo (sin comas). */
export const RUBROS_MODELO = [
  "Mercaderías",
  "Materia prima",
  "En proceso",
  "Terminados",
  "Insumos y envases",
];

/** Modelo de Excel para cargar el inventario: misma planilla para todos los clientes. */
export async function modeloExcelInventario(): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventario");
  ws.columns = [
    { header: "Rubro", key: "rubro", width: 20 },
    { header: "Producto", key: "producto", width: 40 },
    { header: "Cantidad", key: "cantidad", width: 12 },
    { header: "Unidad de medida", key: "medida", width: 18 },
    { header: "Costo unitario", key: "costo", width: 16 },
    { header: "Total", key: "total", width: 16 },
  ];
  const encabezado = ws.getRow(1);
  encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
  encabezado.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF591101" },
  };
  const ejemplos: [string, string, number, string, number][] = [
    [
      "Mercaderías",
      "Gaseosa cola 2,25 l (ejemplo: borrar)",
      48,
      "unidad",
      1850,
    ],
    ["Materia prima", "Harina 000 (ejemplo: borrar)", 250, "kg", 620],
    ["En proceso", "Masa preparada (ejemplo: borrar)", 40, "kg", 1100],
    [
      "Terminados",
      "Tapas de empanadas x 12 (ejemplo: borrar)",
      300,
      "paquete",
      2400,
    ],
  ];
  for (let i = 0; i < 300; i++) {
    const fila = i + 2;
    const e = ejemplos[i];
    if (e) ws.getRow(fila).values = [...e];
    ws.getCell(`F${fila}`).value = {
      formula: `IF(C${fila}="","",C${fila}*E${fila})`,
    };
    ws.getCell(`A${fila}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${RUBROS_MODELO.join(",")}"`],
    };
  }
  for (const c of ["C", "E", "F"]) ws.getColumn(c).numFmt = "#,##0.00";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ayuda = wb.addWorksheet("Cómo completarlo");
  ayuda.getColumn(1).width = 110;
  [
    "MODELO DE INVENTARIO · DC Consultora",
    "",
    "1. Completá la hoja «Inventario»: un renglón por producto. Borrá los renglones de ejemplo.",
    "2. Rubro: elegilo de la lista (Mercaderías, Materia prima, En proceso, Terminados, Insumos y envases).",
    "   Kioscos y comercios: todo va en «Mercaderías». Fábrica: materia prima, en proceso y terminados.",
    "3. Cantidad: lo que hay contado el día del inventario (se pueden usar decimales).",
    "4. Costo unitario: lo que costó cada unidad (la última compra, sin IVA si son responsables inscriptos).",
    "5. Guardalo y subilo en el sistema: Inventarios → Nuevo inventario → Importar de Excel.",
    "",
    "Si tu sistema de caja exporta el stock a Excel, también sirve: el sistema busca solo las columnas",
    "Producto (o Descripción / Artículo), Cantidad (o Stock) y Costo (o Precio de costo).",
  ].forEach((t, i) => {
    const c = ayuda.getCell(`A${i + 1}`);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
  });
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
