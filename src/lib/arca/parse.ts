import { pesos } from "@/lib/formato";
import { interpretarTipo } from "./tipos-comprobante";
import type {
  Alicuota,
  Celda,
  Comprobante,
  ErrorFila,
  Operacion,
  ResultadoImportacion,
} from "./tipos";

const TASAS_IVA = [27, 21, 10.5, 5, 2.5, 0];

type Campo =
  | "fecha"
  | "tipo"
  | "puntoVenta"
  | "numeroDesde"
  | "numeroHasta"
  | "cae"
  | "nroDoc"
  | "nroDocEmisor"
  | "nroDocReceptor"
  | "denominacion"
  | "denominacionEmisor"
  | "denominacionReceptor"
  | "tipoCambio"
  | "moneda"
  | "netoGravado"
  | "noGravado"
  | "exento"
  | "otrosTributos"
  | "iva"
  | "total";

interface Columnas {
  campos: Partial<Record<Campo, number>>;
  /** Columnas de neto e IVA por alícuota del formato detallado, indexadas por tasa. */
  netoPorTasa: Map<number, number>;
  ivaPorTasa: Map<number, number>;
  operacion: Operacion | null;
}

export function normalizarEncabezado(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // El punto solo se conserva como separador decimal de alícuotas ("10,5%" → "10.5%").
      .replace(/(\d)[,.](\d)/g, "$1_$2")
      .replace(/[^a-z0-9_%]+/g, " ")
      .replace(/_/g, ".")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function tasaDelEncabezado(h: string): number | null {
  const m = h.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function identificarColumnas(encabezados: Celda[]): Columnas {
  const cols: Columnas = {
    campos: {},
    netoPorTasa: new Map(),
    ivaPorTasa: new Map(),
    operacion: null,
  };
  const asignar = (campo: Campo, i: number) => {
    if (cols.campos[campo] === undefined) cols.campos[campo] = i;
  };

  encabezados.forEach((celda, i) => {
    const h = normalizarEncabezado(String(celda ?? ""));
    if (!h) return;
    const tasa = tasaDelEncabezado(h);

    if (h.includes("receptor")) cols.operacion ??= "ventas";
    if (h.includes("emisor")) cols.operacion ??= "compras";

    if (h.startsWith("fecha")) asignar("fecha", i);
    else if (h.startsWith("tipo cambio") || h.startsWith("tipo de cambio"))
      asignar("tipoCambio", i);
    else if (h.startsWith("tipo doc"))
      return; // tipo de documento de la contraparte: no lo usamos
    else if (h.startsWith("tipo")) asignar("tipo", i);
    else if (h.includes("punto de venta") || h === "pto vta" || h === "pv")
      asignar("puntoVenta", i);
    else if (/^(numero|nro) hasta/.test(h)) asignar("numeroHasta", i);
    else if (/^(numero|nro) desde/.test(h) || h === "numero" || h === "nro")
      asignar("numeroDesde", i);
    else if (h.includes("autorizacion") || h === "cae") asignar("cae", i);
    else if (/^(nro|numero) (doc|documento)/.test(h) || h.includes("cuit")) {
      // Los recibidos traen emisor y receptor: la contraparte se elige según la operación.
      asignar(
        h.includes("emisor")
          ? "nroDocEmisor"
          : h.includes("receptor")
            ? "nroDocReceptor"
            : "nroDoc",
        i,
      );
    } else if (h.startsWith("denominacion")) {
      asignar(
        h.includes("emisor")
          ? "denominacionEmisor"
          : h.includes("receptor")
            ? "denominacionReceptor"
            : "denominacion",
        i,
      );
    } else if (h === "moneda") asignar("moneda", i);
    else if (h.includes("no gravado")) asignar("noGravado", i);
    else if (h.includes("exent")) asignar("exento", i);
    else if (h.includes("otros tributos")) asignar("otrosTributos", i);
    else if (h.includes("neto grav")) {
      if (tasa !== null) cols.netoPorTasa.set(tasa, i);
      else asignar("netoGravado", i);
    } else if (/^(imp )?iva\b/.test(h) || /^total iva/.test(h)) {
      if (tasa !== null) cols.ivaPorTasa.set(tasa, i);
      else asignar("iva", i);
    } else if (/^(imp|importe) total$/.test(h) || h === "total")
      asignar("total", i);
  });

  return cols;
}

/** El título del archivo de ARCA dice "Mis Comprobantes Emitidos" o "Recibidos". */
function operacionDelTitulo(filas: Celda[][], hasta: number): Operacion | null {
  for (let i = 0; i < hasta; i++) {
    const texto = normalizarEncabezado(
      filas[i].map((c) => String(c ?? "")).join(" "),
    );
    if (texto.includes("emitidos")) return "ventas";
    if (texto.includes("recibidos")) return "compras";
  }
  return null;
}

/** Busca la fila de encabezados: la primera que tenga columnas de fecha, tipo y total. */
function buscarEncabezados(
  filas: Celda[][],
): { indice: number; columnas: Columnas } | null {
  for (let i = 0; i < Math.min(filas.length, 20); i++) {
    const columnas = identificarColumnas(filas[i]);
    const c = columnas.campos;
    if (
      c.fecha !== undefined &&
      c.tipo !== undefined &&
      c.total !== undefined
    ) {
      return { indice: i, columnas };
    }
  }
  return null;
}

/** Acepta números de Excel, "1.234,56" (formato argentino) o "1234.56". */
export function parsearImporte(valor: Celda): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return valor;
  let s = String(valor).trim().replace(/[$\s]/g, "");
  if (!s) return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()-]/g, "");
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  if (coma > -1 && punto > -1) {
    s =
      coma > punto
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (coma > -1) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`importe inválido: "${valor}"`);
  return negativo ? -n : n;
}

function dosDigitos(n: number) {
  return String(n).padStart(2, "0");
}

/** Devuelve la fecha como AAAA-MM-DD. Acepta Date, número de serie de Excel, dd/mm/aaaa o aaaa-mm-dd. */
export function parsearFecha(valor: Celda): string {
  if (valor instanceof Date) {
    return `${valor.getUTCFullYear()}-${dosDigitos(valor.getUTCMonth() + 1)}-${dosDigitos(valor.getUTCDate())}`;
  }
  if (typeof valor === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86400000);
    return parsearFecha(d);
  }
  const s = String(valor ?? "").trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m)
    return `${m[3]}-${dosDigitos(Number(m[2]))}-${dosDigitos(Number(m[1]))}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  throw new Error(`fecha inválida: "${s}"`);
}

function soloDigitos(valor: Celda): string {
  return String(valor ?? "").replace(/\D/g, "");
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

/** Con un solo IVA, intenta deducir la alícuota comparando IVA contra neto. */
function deducirAlicuota(neto: number, iva: number): Alicuota[] {
  if (neto === 0 && iva === 0) return [];
  if (iva === 0) return [{ tasa: 0, neto, iva: 0 }];
  const tolerancia = Math.max(1, Math.abs(iva) * 0.005);
  const tasa = TASAS_IVA.find(
    (t) => t > 0 && Math.abs((neto * t) / 100 - iva) <= tolerancia,
  );
  return [{ tasa: tasa ?? null, neto, iva }];
}

function buscarCuitTitular(filas: Celda[][], hasta: number): string | null {
  for (let i = 0; i < hasta; i++) {
    for (const celda of filas[i]) {
      const m = String(celda ?? "").match(/\b(\d{2}-?\d{8}-?\d)\b/);
      if (m) return m[1].replace(/-/g, "");
    }
  }
  return null;
}

export interface OpcionesImportacion {
  /** Si se indica, se usa en vez de la detección automática por encabezados. */
  operacion?: Operacion;
}

/**
 * Convierte las filas de un archivo de "Mis Comprobantes" de ARCA (emitidos o recibidos)
 * en comprobantes normalizados.
 */
export function importarMisComprobantes(
  filas: Celda[][],
  opciones: OpcionesImportacion = {},
): ResultadoImportacion {
  const encontrados = buscarEncabezados(filas);
  if (!encontrados) {
    throw new Error(
      "No se encontraron los encabezados de Mis Comprobantes (Fecha, Tipo, Imp. Total). ¿Es el archivo que descargaste de ARCA?",
    );
  }
  const { indice, columnas } = encontrados;
  const { campos, netoPorTasa, ivaPorTasa } = columnas;
  const avisos: string[] = [];
  columnas.operacion = operacionDelTitulo(filas, indice) ?? columnas.operacion;

  let operacion: Operacion;
  if (opciones.operacion) {
    operacion = opciones.operacion;
    if (columnas.operacion && columnas.operacion !== opciones.operacion) {
      avisos.push(
        `El archivo parece de comprobantes ${columnas.operacion === "ventas" ? "emitidos" : "recibidos"}, pero se cargó como ${opciones.operacion === "ventas" ? "emitidos" : "recibidos"}.`,
      );
    }
  } else if (columnas.operacion) {
    operacion = columnas.operacion;
  } else {
    throw new Error(
      "No se pudo saber si el archivo es de comprobantes emitidos o recibidos. Indicalo al importarlo.",
    );
  }

  const formato =
    netoPorTasa.size > 0 || ivaPorTasa.size > 0 ? "detallado" : "simple";
  if (formato === "simple") {
    avisos.push(
      "El archivo trae un solo importe de IVA por comprobante: la alícuota se deduce del cálculo y los casos dudosos quedan marcados.",
    );
  }
  const comprobantes: Comprobante[] = [];
  const errores: ErrorFila[] = [];
  const vistos = new Map<string, number>();
  const leer = (fila: Celda[], campo: Campo) =>
    campos[campo] === undefined ? undefined : fila[campos[campo]!];
  // La contraparte de una venta es el receptor; la de una compra, el emisor.
  const lado = operacion === "ventas" ? "Receptor" : "Emisor";
  const campoCuit: Campo =
    campos[`nroDoc${lado}`] !== undefined ? `nroDoc${lado}` : "nroDoc";
  const campoNombre: Campo =
    campos[`denominacion${lado}`] !== undefined
      ? `denominacion${lado}`
      : "denominacion";

  for (let i = indice + 1; i < filas.length; i++) {
    const fila = filas[i];
    const numeroFila = i + 1;
    if (
      !fila ||
      fila.every(
        (c) => c === null || c === undefined || String(c).trim() === "",
      )
    )
      continue;

    try {
      const tipo = interpretarTipo(leer(fila, "tipo"));
      if (!tipo) throw new Error("falta el tipo de comprobante");
      const fecha = parsearFecha(leer(fila, "fecha"));
      const advertencias: string[] = [];

      const monedaTexto = String(leer(fila, "moneda") ?? "$").trim();
      const esPesos =
        monedaTexto === "" ||
        monedaTexto === "$" ||
        /^(pes|ars)$/i.test(monedaTexto);
      let tipoCambio = esPesos ? 1 : parsearImporte(leer(fila, "tipoCambio"));
      if (!esPesos && !tipoCambio) {
        advertencias.push(
          `Comprobante en ${monedaTexto} sin tipo de cambio: se tomó 1.`,
        );
        tipoCambio = 1;
      }

      // ARCA informa las notas de crédito en positivo: el signo lo pone el tipo de comprobante.
      const signo = tipo.clase === "nota_credito" ? -1 : 1;
      const importe = (v: Celda) =>
        redondear(Math.abs(parsearImporte(v)) * tipoCambio * signo);

      let alicuotas: Alicuota[] = [];
      if (formato === "detallado") {
        const tasas = new Set([...netoPorTasa.keys(), ...ivaPorTasa.keys()]);
        for (const tasa of [...tasas].sort((a, b) => b - a)) {
          const neto = netoPorTasa.has(tasa)
            ? importe(fila[netoPorTasa.get(tasa)!])
            : 0;
          const iva = ivaPorTasa.has(tasa)
            ? importe(fila[ivaPorTasa.get(tasa)!])
            : 0;
          if (neto !== 0 || iva !== 0) alicuotas.push({ tasa, neto, iva });
        }
      }

      let netoGravado =
        campos.netoGravado !== undefined
          ? importe(leer(fila, "netoGravado"))
          : redondear(alicuotas.reduce((s, a) => s + a.neto, 0));
      let iva =
        campos.iva !== undefined
          ? importe(leer(fila, "iva"))
          : redondear(alicuotas.reduce((s, a) => s + a.iva, 0));
      let noGravado = importe(leer(fila, "noGravado"));
      const exento = importe(leer(fila, "exento"));
      const otrosTributos = importe(leer(fila, "otrosTributos"));
      const total = importe(leer(fila, "total"));

      if (formato === "simple") {
        alicuotas = deducirAlicuota(netoGravado, iva);
        if (alicuotas.some((a) => a.tasa === null)) {
          advertencias.push(
            "No se pudo deducir la alícuota de IVA (puede tener varias): revisar.",
          );
        }
      } else {
        const sumaNetos = redondear(alicuotas.reduce((s, a) => s + a.neto, 0));
        if (Math.abs(sumaNetos - netoGravado) > 1) {
          advertencias.push(
            `La suma de netos por alícuota (${sumaNetos}) no coincide con el neto gravado (${netoGravado}).`,
          );
        }
      }

      // Factura B o C recibida: no genera crédito fiscal, todo el importe va a no gravado.
      const computaIva =
        operacion === "ventas" || tipo.letra === "A" || tipo.letra === "M";
      if (!computaIva) {
        noGravado = redondear(total - exento - otrosTributos);
        netoGravado = 0;
        iva = 0;
        alicuotas = [];
      } else if (
        netoGravado === 0 &&
        iva === 0 &&
        noGravado === 0 &&
        exento === 0 &&
        otrosTributos === 0
      ) {
        // Las facturas C emitidas solo informan el total.
        noGravado = total;
      }

      const diferencia = redondear(
        total - (netoGravado + noGravado + exento + iva + otrosTributos),
      );
      if (Math.abs(diferencia) > 1) {
        advertencias.push(
          `Hay ${pesos(diferencia)} del total que no figuran en ninguna columna (puede ser impuesto a los combustibles o impuestos internos): revisar.`,
        );
      }

      const puntoVenta = Number(soloDigitos(leer(fila, "puntoVenta"))) || 0;
      const numeroDesde = Number(soloDigitos(leer(fila, "numeroDesde"))) || 0;
      const numeroHasta =
        Number(soloDigitos(leer(fila, "numeroHasta"))) || numeroDesde;
      const cuitContraparte = soloDigitos(leer(fila, campoCuit));

      const clave = `${tipo.codigo}-${puntoVenta}-${numeroDesde}-${cuitContraparte}`;
      if (vistos.has(clave)) {
        errores.push({
          fila: numeroFila,
          mensaje: `Comprobante repetido (ya figura en la fila ${vistos.get(clave)}): se omitió.`,
        });
        continue;
      }
      vistos.set(clave, numeroFila);

      comprobantes.push({
        fila: numeroFila,
        fecha,
        periodo: fecha.slice(0, 7),
        tipoCodigo: tipo.codigo,
        tipoNombre: tipo.nombre,
        letra: tipo.letra,
        clase: tipo.clase,
        puntoVenta,
        numeroDesde,
        numeroHasta,
        cae: soloDigitos(leer(fila, "cae")),
        cuitContraparte,
        contraparte: String(leer(fila, campoNombre) ?? "").trim(),
        moneda: esPesos ? "ARS" : monedaTexto,
        tipoCambio,
        alicuotas,
        netoGravado,
        noGravado,
        exento,
        otrosTributos,
        iva,
        total,
        computaIva,
        advertencias,
      });
    } catch (e) {
      errores.push({
        fila: numeroFila,
        mensaje: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (comprobantes.some((c) => c.otrosTributos !== 0)) {
    avisos.push(
      'ARCA informa las percepciones juntas en "Otros tributos": hay que clasificarlas (IVA, IIBB, etc.) antes de liquidar.',
    );
  }

  return {
    operacion,
    formato,
    cuitTitular: buscarCuitTitular(filas, indice),
    comprobantes,
    errores,
    avisos,
  };
}
