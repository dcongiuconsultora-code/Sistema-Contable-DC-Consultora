import type { Comprobante } from "@/lib/arca/tipos";

export interface Categoria {
  letra: string;
  /** Tope de ingresos brutos de los últimos 12 meses. */
  tope: number;
  /** Cuota mensual total para servicios y para venta de bienes. */
  cuotaServicios: number;
  cuotaBienes: number;
}

export type Actividad = "servicios" | "bienes";

function numero(t: string) {
  const s = t.replace(/\$/g, "").trim();
  if (!s) return NaN;
  const limpio = /,\d{1,2}$/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s.replace(/,/g, "");
  return Number(limpio);
}

/**
 * Lee la tabla de categorías pegada desde ARCA o desde un Excel: cada renglón con la letra, el tope
 * de ingresos y, si están, la cuota de servicios y la de bienes (las últimas columnas numéricas).
 */
export function categoriasDesdeTexto(texto: string): Categoria[] {
  const categorias: Categoria[] = [];
  for (const renglon of texto.split(/\r?\n/)) {
    const partes = renglon
      .split(/\t|;|\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    const letra = partes[0]?.toUpperCase();
    if (!letra || !/^[A-K]$/.test(letra)) continue;
    const numeros = partes
      .slice(1)
      .map(numero)
      .filter((n) => Number.isFinite(n));
    if (!numeros.length) continue;
    categorias.push({
      letra,
      tope: numeros[0],
      cuotaServicios:
        numeros.length >= 3 ? numeros[numeros.length - 2] : (numeros[1] ?? 0),
      cuotaBienes:
        numeros.length >= 3 ? numeros[numeros.length - 1] : (numeros[1] ?? 0),
    });
  }
  return categorias.sort((a, b) => a.letra.localeCompare(b.letra));
}

function mesesHasta(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const total = a * 12 + (m - 1) - (n - 1 - i);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
  });
}

/** Lo facturado y lo comprado mes a mes en los 12 meses que terminan en `mes` (AAAA-MM). */
export function ultimos12Meses(
  ventas: Comprobante[],
  compras: Comprobante[],
  mes: string,
  /** Entradas de plata en el banco (créditos del resumen), para compararlas con lo facturado. */
  acreditaciones: { fecha: string; importe: number }[] = [],
) {
  const meses = mesesHasta(mes, 12);
  const suma = (lista: Comprobante[]) =>
    meses.map(
      (m) =>
        Math.round(
          lista
            .filter((c) => c.fecha.startsWith(m))
            .reduce((s, c) => s + c.total, 0) * 100,
        ) / 100,
    );
  const facturado = suma(ventas);
  const comprado = suma(compras);
  const banco = meses.map(
    (m) =>
      Math.round(
        acreditaciones
          .filter((a) => a.fecha.startsWith(m) && a.importe > 0)
          .reduce((s, a) => s + a.importe, 0) * 100,
      ) / 100,
  );
  return {
    meses,
    facturado,
    comprado,
    banco,
    totalBanco: Math.round(banco.reduce((s, v) => s + v, 0) * 100) / 100,
    /** Meses con datos del banco (para comparar solo esos). */
    mesesConBanco: meses.filter((m) =>
      acreditaciones.some((a) => a.fecha.startsWith(m)),
    ),
    totalFacturado:
      Math.round(facturado.reduce((s, v) => s + v, 0) * 100) / 100,
    totalComprado: Math.round(comprado.reduce((s, v) => s + v, 0) * 100) / 100,
  };
}

/** La categoría más baja cuyo tope cubre lo facturado; null si supera la última (exclusión). */
export function categoriaQueCorresponde(facturado: number, tabla: Categoria[]) {
  return tabla.find((c) => facturado <= c.tope) ?? null;
}

/**
 * Próxima recategorización semestral: en enero (sobre los 12 meses a diciembre) y en julio (a
 * junio). Durante enero y julio se muestra la que se está presentando.
 */
export function proximaRecategorizacion(hoy: string) {
  const [a, m] = hoy.split("-").map(Number);
  if (m === 1) return { cierre: `${a - 1}-12`, presentarEn: `enero de ${a}` };
  if (m <= 7) return { cierre: `${a}-06`, presentarEn: `julio de ${a}` };
  return { cierre: `${a}-12`, presentarEn: `enero de ${a + 1}` };
}

export function esMonotributo(condicion: string) {
  return /monotributo/i.test(condicion);
}

/** Nivel de alerta según cuánto del tope ya se usó. */
export function alertaTope(facturado: number, tope: number) {
  if (!tope) return null;
  const uso = facturado / tope;
  return uso > 1 ? "excedido" : uso >= 0.8 ? "cerca" : null;
}
