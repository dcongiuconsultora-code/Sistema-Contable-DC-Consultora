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
