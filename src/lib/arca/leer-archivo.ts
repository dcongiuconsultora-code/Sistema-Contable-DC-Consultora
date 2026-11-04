import ExcelJS from "exceljs";
import { leerXls } from "./leer-xls";
import type { Celda } from "./tipos";

/** Separa una línea CSV respetando comillas. */
function dividirLineaCsv(linea: string, separador: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === separador && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  celdas.push(actual);
  return celdas.map((s) => s.trim());
}

export function leerCsv(texto: string): Celda[][] {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) return [];
  // ARCA exporta con ";" pero aceptamos también "," y tabulaciones.
  const muestra = lineas.slice(0, 5).join("\n");
  const separador = [";", "\t", ","].reduce((mejor, s) =>
    muestra.split(s).length > muestra.split(mejor).length ? s : mejor,
  );
  return lineas.map((l) => dividirLineaCsv(l, separador));
}

function valorCelda(v: ExcelJS.CellValue): Celda {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    if ("result" in v) return valorCelda(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
    return null;
  }
  return v as Celda;
}

export async function leerXlsx(datos: ArrayBuffer): Promise<Celda[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(datos);
  const hoja = libro.worksheets[0];
  if (!hoja) return [];
  const filas: Celda[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, numero) => {
    const valores = (fila.values as ExcelJS.CellValue[]).slice(1).map(valorCelda);
    filas[numero - 1] = valores;
  });
  return Array.from(filas, (f) => f ?? []);
}

/** ARCA suele exportar en Latin-1; si no es UTF-8 válido, lo leemos así. */
export async function leerTexto(archivo: File): Promise<string> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Lee un archivo descargado de ARCA (.xlsx, .xls o .csv) y devuelve sus filas. */
export async function leerArchivo(archivo: File): Promise<Celda[][]> {
  const nombre = archivo.name.toLowerCase();
  if (nombre.endsWith(".csv") || nombre.endsWith(".txt")) {
    return leerCsv(await leerTexto(archivo));
  }
  if (nombre.endsWith(".xlsx")) {
    return leerXlsx(await archivo.arrayBuffer());
  }
  if (nombre.endsWith(".xls")) {
    return leerXls(await archivo.arrayBuffer());
  }
  throw new Error("Formato no soportado. Subí el archivo .xlsx, .xls o .csv que descargás de ARCA.");
}
