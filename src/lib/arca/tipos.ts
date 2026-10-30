import type { Clase, Letra } from "./tipos-comprobante";

/** Emitidos = ventas del cliente. Recibidos = compras y gastos del cliente. */
export type Operacion = "ventas" | "compras";

export type Celda = string | number | boolean | Date | null | undefined;

export interface Alicuota {
  /** Porcentaje (21, 10.5, 27...). null si el archivo no trae el desglose y no se pudo deducir. */
  tasa: number | null;
  neto: number;
  iva: number;
}

/** Un comprobante ya normalizado: importes en pesos y con signo (las notas de crédito restan). */
export interface Comprobante {
  /** Fila del archivo original, para poder ubicarlo si hay que corregir algo. */
  fila: number;
  fecha: string; // AAAA-MM-DD
  periodo: string; // AAAA-MM
  tipoCodigo: number;
  tipoNombre: string;
  letra: Letra;
  clase: Clase;
  puntoVenta: number;
  numeroDesde: number;
  numeroHasta: number;
  cae: string;
  cuitContraparte: string;
  contraparte: string;
  moneda: string;
  tipoCambio: number;
  alicuotas: Alicuota[];
  netoGravado: number;
  noGravado: number;
  exento: number;
  otrosTributos: number;
  iva: number;
  total: number;
  /** false para facturas B y C recibidas: no generan crédito fiscal y todo va a no gravado. */
  computaIva: boolean;
  advertencias: string[];
}

export interface ErrorFila {
  fila: number;
  mensaje: string;
}

export interface ResultadoImportacion {
  operacion: Operacion;
  /** "detallado" si el archivo trae neto e IVA por alícuota; "simple" si trae un solo IVA. */
  formato: "detallado" | "simple";
  cuitTitular: string | null;
  comprobantes: Comprobante[];
  errores: ErrorFila[];
  /** Avisos que afectan a todo el archivo. */
  avisos: string[];
}
