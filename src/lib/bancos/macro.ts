import type { Fragmento, LineaPdf } from "@/lib/pdf/lineas";
import { parsearImporte } from "@/lib/arca/parse";
import type { CuentaBancaria, ResumenBancario } from "./tipos";

const IMPORTE = /^-?\d{1,3}(\.\d{3})*,\d{2}-?$/;
const FECHA_CORTA = /^(\d{2})\/(\d{2})\/(\d{2})$/;

function fechaIso(dd: string, mm: string, aa: string) {
  return `${aa.length === 2 ? `20${aa}` : aa}-${mm}-${dd}`;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

interface Columnas {
  referencia: number;
  debitos: number;
  creditos: number;
  saldo: number;
}

/** Ubica cada importe en la columna cuyo borde derecho está más cerca. */
function columnaDe(f: Fragmento, c: Columnas): "debitos" | "creditos" | "saldo" {
  const candidatas = (["debitos", "creditos", "saldo"] as const).map((k) => [k, Math.abs(f.fin - c[k])] as const);
  return candidatas.sort((a, b) => a[1] - b[1])[0][0];
}

function ultimoImporte(linea: LineaPdf): number | null {
  const f = [...linea.fragmentos].reverse().find((x) => IMPORTE.test(x.texto));
  return f ? parsearImporte(f.texto) : null;
}

export function esResumenMacro(lineas: LineaPdf[]) {
  return lineas.some((l) => /Banco Macro S\.A\./i.test(l.texto));
}

/** Lee el resumen de cuenta de Banco Macro (PDF), con todas las cuentas que trae. */
export function importarResumenMacro(lineas: LineaPdf[]): ResumenBancario {
  const resumen: ResumenBancario = { banco: "Banco Macro", titular: "", cuit: "", desde: null, hasta: null, cuentas: [], controles: [] };
  const cuentas = new Map<string, CuentaBancaria>();
  let actual: CuentaBancaria | null = null;
  let columnas: Columnas | null = null;

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const t = linea.texto;

    if (!resumen.cuit) {
      const cuit = t.match(/C\.U\.I\.T\.?\s*(\d{11})/);
      if (cuit) {
        resumen.cuit = cuit[1];
        // El nombre del titular está en la misma línea, a la izquierda.
        resumen.titular = linea.fragmentos.filter((f) => f.x < 300).map((f) => f.texto).join(" ").trim();
      }
    }
    if (!resumen.desde) {
      const periodo = t.match(/Periodo del Extracto:\s*(\d{2})\/(\d{2})\/(\d{4})\s*al\s*(\d{2})\/(\d{2})\/(\d{4})/);
      if (periodo) {
        resumen.desde = fechaIso(periodo[1], periodo[2], periodo[3]);
        resumen.hasta = fechaIso(periodo[4], periodo[5], periodo[6]);
      }
    }

    // Cada cuenta empieza con "CUENTA ... NRO.: x-xxx-xxxxxxxxxx-x"; se repite al inicio de cada hoja.
    const encabezado = t.match(/^(.*?)\s+NRO\.:\s*([\d-]+)/);
    if (encabezado) {
      const numero = encabezado[2];
      actual = cuentas.get(numero) ?? null;
      if (!actual) {
        actual = {
          banco: "Banco Macro",
          tipo: encabezado[1].trim(),
          numero,
          moneda: /DOLAR/i.test(encabezado[1]) ? "USD" : "ARS",
          saldoInicial: null,
          saldoFinal: null,
          movimientos: [],
          impuestoDebitosCreditos: null,
        };
        cuentas.set(numero, actual);
      }
      continue;
    }
    if (!actual) continue;

    if (/^FECHA\b/.test(t) && /DEBITOS/.test(t) && /CREDITOS/.test(t)) {
      const fin = (nombre: string) => linea.fragmentos.find((f) => f.texto === nombre)?.fin ?? 0;
      const ref = linea.fragmentos.find((f) => f.texto === "REFERENCIA");
      // Los importes terminan un poco a la derecha del título de su columna.
      columnas = { referencia: ref?.x ?? 0, debitos: fin("DEBITOS") + 17, creditos: fin("CREDITOS") + 13, saldo: fin("SALDO") + 17 };
      continue;
    }
    if (/SALDO ULTIMO EXTRACTO/.test(t)) {
      actual.saldoInicial ??= ultimoImporte(linea);
      continue;
    }
    if (/SALDO FINAL AL DIA/.test(t)) {
      actual.saldoFinal = ultimoImporte(linea);
      continue;
    }
    if (/TOTAL COBRADO DEL IMP\.S\/CREDS/.test(t)) {
      actual.impuestoDebitosCreditos = ultimoImporte(linea);
      continue;
    }

    const fecha = linea.fragmentos[0]?.texto.match(FECHA_CORTA);
    if (!fecha || !columnas) continue;

    let debito = 0;
    let credito = 0;
    let saldo: number | null = null;
    const texto: Fragmento[] = [];
    for (const f of linea.fragmentos.slice(1)) {
      if (IMPORTE.test(f.texto) && f.x > columnas.referencia + 40) {
        const col = columnaDe(f, columnas);
        const valor = parsearImporte(f.texto);
        if (col === "debitos") debito += valor;
        else if (col === "creditos") credito += valor;
        else saldo = valor;
      } else {
        texto.push(f);
      }
    }
    // La referencia es el número en su columna; a veces viene pegada al final de la descripción.
    const enColumna = texto.filter((f) => f.x >= columnas!.referencia - 2);
    const descripcion = texto.filter((f) => f.x < columnas!.referencia - 2).map((f) => f.texto).join(" ");
    let referencia = enColumna.map((f) => f.texto).join(" ");
    let desc = descripcion;
    if (!referencia) {
      const pegada = desc.match(/^(.*\S)\s+(\d{3,})$/);
      if (pegada) [, desc, referencia] = pegada;
    }

    actual.movimientos.push({
      fecha: fechaIso(fecha[1], fecha[2], fecha[3]),
      descripcion: desc.replace(/\s+/g, " ").trim(),
      referencia: referencia === "0" ? "" : referencia,
      importe: redondear(credito - debito),
      saldo,
      pagina: linea.pagina,
    });
  }

  resumen.cuentas = [...cuentas.values()];
  resumen.controles = controlar(resumen.cuentas);
  return resumen;
}

/** Verifica que saldo inicial + movimientos = saldo final, y el saldo de cada línea. */
export function controlar(cuentas: CuentaBancaria[]): string[] {
  const problemas: string[] = [];
  for (const c of cuentas) {
    let saldo = c.saldoInicial ?? 0;
    for (const m of c.movimientos) {
      saldo = redondear(saldo + m.importe);
      if (m.saldo !== null && Math.abs(m.saldo - saldo) > 0.005) {
        problemas.push(`${c.numero}: el saldo después de "${m.descripcion}" del ${m.fecha} debería ser ${m.saldo} y da ${saldo}.`);
        saldo = m.saldo; // seguimos desde el saldo del banco para no arrastrar el error
      }
    }
    if (c.saldoFinal !== null && Math.abs(c.saldoFinal - saldo) > 0.005) {
      problemas.push(`${c.numero}: el saldo final del banco es ${c.saldoFinal} y los movimientos dan ${saldo}.`);
    }
  }
  return problemas;
}
