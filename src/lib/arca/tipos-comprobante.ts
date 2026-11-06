// Códigos de tipo de comprobante de ARCA (tabla de comprobantes de facturación electrónica).

export type Letra = "A" | "B" | "C" | "M" | "E" | "";
export type Clase =
  | "factura"
  | "nota_debito"
  | "nota_credito"
  | "recibo"
  | "otro";

export interface TipoComprobante {
  codigo: number;
  nombre: string;
  letra: Letra;
  clase: Clase;
}

const TABLA: [number, string, Letra, Clase][] = [
  [1, "Factura A", "A", "factura"],
  [2, "Nota de Débito A", "A", "nota_debito"],
  [3, "Nota de Crédito A", "A", "nota_credito"],
  [4, "Recibo A", "A", "recibo"],
  [5, "Nota de Venta al Contado A", "A", "factura"],
  [6, "Factura B", "B", "factura"],
  [7, "Nota de Débito B", "B", "nota_debito"],
  [8, "Nota de Crédito B", "B", "nota_credito"],
  [9, "Recibo B", "B", "recibo"],
  [10, "Nota de Venta al Contado B", "B", "factura"],
  [11, "Factura C", "C", "factura"],
  [12, "Nota de Débito C", "C", "nota_debito"],
  [13, "Nota de Crédito C", "C", "nota_credito"],
  [15, "Recibo C", "C", "recibo"],
  [19, "Factura E", "E", "factura"],
  [20, "Nota de Débito E", "E", "nota_debito"],
  [21, "Nota de Crédito E", "E", "nota_credito"],
  [51, "Factura M", "M", "factura"],
  [52, "Nota de Débito M", "M", "nota_debito"],
  [53, "Nota de Crédito M", "M", "nota_credito"],
  [54, "Recibo M", "M", "recibo"],
  [81, "Tique Factura A", "A", "factura"],
  [82, "Tique Factura B", "B", "factura"],
  [83, "Tique", "", "factura"],
  [111, "Tique Factura C", "C", "factura"],
  [112, "Tique Nota de Crédito A", "A", "nota_credito"],
  [113, "Tique Nota de Crédito B", "B", "nota_credito"],
  [114, "Tique Nota de Crédito C", "C", "nota_credito"],
  [115, "Tique Nota de Débito A", "A", "nota_debito"],
  [116, "Tique Nota de Débito B", "B", "nota_debito"],
  [117, "Tique Nota de Débito C", "C", "nota_debito"],
  [118, "Tique Factura M", "M", "factura"],
  [119, "Tique Nota de Crédito M", "M", "nota_credito"],
  [120, "Tique Nota de Débito M", "M", "nota_debito"],
  [201, "Factura de Crédito Electrónica MiPyMEs A", "A", "factura"],
  [202, "Nota de Débito Electrónica MiPyMEs A", "A", "nota_debito"],
  [203, "Nota de Crédito Electrónica MiPyMEs A", "A", "nota_credito"],
  [206, "Factura de Crédito Electrónica MiPyMEs B", "B", "factura"],
  [207, "Nota de Débito Electrónica MiPyMEs B", "B", "nota_debito"],
  [208, "Nota de Crédito Electrónica MiPyMEs B", "B", "nota_credito"],
  [211, "Factura de Crédito Electrónica MiPyMEs C", "C", "factura"],
  [212, "Nota de Débito Electrónica MiPyMEs C", "C", "nota_debito"],
  [213, "Nota de Crédito Electrónica MiPyMEs C", "C", "nota_credito"],
];

const POR_CODIGO = new Map<number, TipoComprobante>(
  TABLA.map(([codigo, nombre, letra, clase]) => [
    codigo,
    { codigo, nombre, letra, clase },
  ]),
);

/**
 * Interpreta la celda "Tipo" de Mis Comprobantes. Puede venir como "1 - Factura A",
 * "1", 1 o solo "Factura A".
 */
export function interpretarTipo(valor: unknown): TipoComprobante | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const texto = String(valor).trim();
  const numero = texto.match(/^(\d+)/);
  if (numero) {
    const conocido = POR_CODIGO.get(Number(numero[1]));
    if (conocido) return conocido;
  }
  const nombre = texto.replace(/^\d+\s*-\s*/, "");
  const sinAcentos = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const porNombre = TABLA.find(
    ([, n]) =>
      n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() === sinAcentos,
  );
  if (porNombre) return POR_CODIGO.get(porNombre[0])!;

  // Código desconocido: deducimos lo que podamos del texto.
  const clase: Clase =
    sinAcentos.includes("credito") && !sinAcentos.includes("factura de credito")
      ? "nota_credito"
      : sinAcentos.includes("debito")
        ? "nota_debito"
        : sinAcentos.includes("recibo")
          ? "recibo"
          : sinAcentos.includes("factura") || sinAcentos.includes("tique")
            ? "factura"
            : "otro";
  const letraTexto = nombre.trim().match(/\b([ABCEM])$/);
  return {
    codigo: numero ? Number(numero[1]) : 0,
    nombre: nombre || texto,
    letra: (letraTexto?.[1] as Letra) ?? "",
    clase,
  };
}
