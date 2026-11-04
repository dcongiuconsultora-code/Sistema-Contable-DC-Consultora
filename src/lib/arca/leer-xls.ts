import CFB from "cfb";
import type { Celda } from "./tipos";

// Lector mínimo de Excel 97-2003 (.xls, formato BIFF8): solo lo necesario para leer la primera
// hoja de los archivos que exporta ARCA (textos y números). No interpreta formatos ni fórmulas.

const BOF = 0x0809;
const EOF = 0x000a;
const SST = 0x00fc;
const CONTINUE = 0x003c;
const LABELSST = 0x00fd;
const LABEL = 0x0204;
const NUMBER = 0x0203;
const RK = 0x027e;
const MULRK = 0x00bd;
const FORMULA = 0x0006;
const BOOLERR = 0x0205;

interface Registro {
  tipo: number;
  datos: Uint8Array;
}

function leerRegistros(flujo: Uint8Array): Registro[] {
  const registros: Registro[] = [];
  const vista = new DataView(flujo.buffer, flujo.byteOffset, flujo.byteLength);
  let pos = 0;
  while (pos + 4 <= flujo.length) {
    const tipo = vista.getUint16(pos, true);
    const largo = vista.getUint16(pos + 2, true);
    registros.push({ tipo, datos: flujo.subarray(pos + 4, pos + 4 + largo) });
    pos += 4 + largo;
  }
  return registros;
}

/** Recorre un registro SST y sus CONTINUE como si fueran un solo bloque de bytes. */
class LectorSegmentos {
  private seg = 0;
  private pos = 0;
  constructor(private segmentos: Uint8Array[]) {}

  private asegurar() {
    while (this.seg < this.segmentos.length && this.pos >= this.segmentos[this.seg].length) {
      this.seg++;
      this.pos = 0;
    }
    if (this.seg >= this.segmentos.length) throw new Error("archivo .xls incompleto");
  }

  u8() {
    this.asegurar();
    return this.segmentos[this.seg][this.pos++];
  }
  u16() {
    return this.u8() | (this.u8() << 8);
  }
  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  saltar(n: number) {
    for (let i = 0; i < n; i++) this.u8();
  }

  /** Lee caracteres; si el texto sigue en un CONTINUE, ese registro empieza con un byte de opciones. */
  caracteres(cantidad: number, dobleByte: boolean) {
    let texto = "";
    for (let i = 0; i < cantidad; i++) {
      if (this.seg < this.segmentos.length && this.pos >= this.segmentos[this.seg].length) {
        this.seg++;
        this.pos = 0;
        dobleByte = (this.u8() & 0x01) === 1;
      }
      texto += String.fromCharCode(dobleByte ? this.u16() : this.u8());
    }
    return texto;
  }

  texto() {
    const cantidad = this.u16();
    const opciones = this.u8();
    const rico = opciones & 0x08 ? this.u16() : 0;
    const extendido = opciones & 0x04 ? this.u32() : 0;
    const valor = this.caracteres(cantidad, (opciones & 0x01) === 1);
    this.saltar(rico * 4 + extendido);
    return valor;
  }
}

function leerSst(registros: Registro[], indice: number): string[] {
  const segmentos = [registros[indice].datos];
  for (let i = indice + 1; i < registros.length && registros[i].tipo === CONTINUE; i++) {
    segmentos.push(registros[i].datos);
  }
  const lector = new LectorSegmentos(segmentos);
  lector.u32(); // total de usos
  const unicos = lector.u32();
  const textos: string[] = [];
  for (let i = 0; i < unicos; i++) textos.push(lector.texto());
  return textos;
}

function numeroRk(rk: number): number {
  let valor: number;
  if (rk & 0x02) {
    valor = rk >> 2;
  } else {
    const vista = new DataView(new ArrayBuffer(8));
    vista.setUint32(4, rk & 0xfffffffc, true);
    valor = vista.getFloat64(0, true);
  }
  return rk & 0x01 ? valor / 100 : valor;
}

export function leerXls(datos: ArrayBuffer): Celda[][] {
  const contenedor = CFB.read(new Uint8Array(datos), { type: "array" });
  const libro = CFB.find(contenedor, "Workbook") ?? CFB.find(contenedor, "Book");
  if (!libro?.content) throw new Error("No se pudo abrir el archivo .xls");
  const contenido = libro.content as Uint8Array | number[];
  const registros = leerRegistros(contenido instanceof Uint8Array ? contenido : Uint8Array.from(contenido));

  let textos: string[] = [];
  const filas: Celda[][] = [];
  let bloque = 0; // 0 = datos generales del libro, 1 = primera hoja
  const poner = (fila: number, col: number, valor: Celda) => {
    (filas[fila] ??= [])[col] = valor;
  };

  for (let i = 0; i < registros.length; i++) {
    const { tipo, datos } = registros[i];
    const vista = new DataView(datos.buffer, datos.byteOffset, datos.byteLength);
    if (tipo === BOF && i > 0) bloque++;
    if (bloque > 1) break;
    if (tipo === EOF && bloque === 1) break;
    if (tipo === SST) textos = leerSst(registros, i);
    if (bloque !== 1) continue;

    const fila = datos.length >= 4 ? vista.getUint16(0, true) : 0;
    const col = datos.length >= 4 ? vista.getUint16(2, true) : 0;
    switch (tipo) {
      case LABELSST:
        poner(fila, col, textos[vista.getUint32(6, true)] ?? "");
        break;
      case LABEL:
        poner(fila, col, new LectorSegmentos([datos.subarray(6)]).texto());
        break;
      case NUMBER:
        poner(fila, col, vista.getFloat64(6, true));
        break;
      case RK:
        poner(fila, col, numeroRk(vista.getUint32(6, true)));
        break;
      case MULRK: {
        const ultima = vista.getUint16(datos.length - 2, true);
        for (let c = col; c <= ultima; c++) {
          poner(fila, c, numeroRk(vista.getUint32(4 + (c - col) * 6 + 2, true)));
        }
        break;
      }
      case FORMULA:
        // Solo el resultado numérico; los resultados de texto vienen en otro registro y no los usamos.
        if (vista.getUint16(12, true) !== 0xffff) poner(fila, col, vista.getFloat64(6, true));
        break;
      case BOOLERR:
        if (datos[7] === 0) poner(fila, col, datos[6] === 1);
        break;
    }
  }
  return Array.from(filas, (f) => Array.from(f ?? [], (c) => c ?? null));
}
