import { describe, expect, it } from "vitest";
import type { LineaPdf } from "@/lib/pdf/lineas";
import { agruparPorConcepto, clasificarMovimiento } from "./clasificar";
import { importarResumenMacro } from "./macro";

// Líneas con las posiciones reales del PDF de Banco Macro (columnas de débitos, créditos y saldo)
// y datos ficticios.
function linea(y: number, ...fragmentos: [number, string, number?][]): LineaPdf {
  const f = fragmentos.map(([x, texto, ancho]) => ({ x, fin: x + (ancho ?? texto.length * 4.2), texto }));
  return { pagina: 1, y, fragmentos: f, texto: f.map((x) => x.texto).join(" ") };
}
const debito = (texto: string) => [386 - texto.length * 4.2, texto] as [number, string];
const credito = (texto: string) => [466 - texto.length * 4.2, texto] as [number, string];
const saldo = (texto: string) => [554 - texto.length * 4.2, texto] as [number, string];

const encabezadoColumnas = (y: number) =>
  linea(y, [37, "FECHA", 21], [138, "DESCRIPCION", 46], [264, "REFERENCIA", 42], [340, "DEBITOS", 29], [419, "CREDITOS", 34], [516, "SALDO", 21]);

const LINEAS: LineaPdf[] = [
  linea(769, [72, "EMPRESA"], [110, "FICTICIA"], [150, "SA"], [360, "C.U.I.T 30711111118"]),
  linea(669, [26, "Resumen General"], [268, "Periodo del Extracto: 01/09/2026 al 30/09/2026"]),
  linea(491, [29, "CUENTA"], [58, "CORRIENTE"], [100, "BANCARIA NRO.: 3-152-0000000001-9"]),
  encabezadoColumnas(455),
  linea(443, [96, "SALDO"], [121, "ULTIMO EXTRACTO AL 31/08/2026"], saldo("100.000,00")),
  linea(431, [33, "01/09/26"], [71, "TRANSF"], [100, "PEREZ JUAN 20111111112 VAR VARIOS"], [264, "192927"], credito("1.700,00"), saldo("101.700,00")),
  linea(419, [33, "01/09/26"], [71, "N/D RET. ING. BRUTOS SIRCREB SUC.: 811"], [264, "0"], debito("10,20"), saldo("101.689,80")),
  linea(407, [33, "01/09/26"], [71, "N/D RET IIBB TUCUMAN SUC.: 140"], [264, "0"], debito("2,04"), saldo("101.687,76")),
  linea(395, [33, "02/09/26"], [71, "N/D DBCR 25413 S/CR TASA GRAL"], [264, "0"], debito("10,20"), saldo("101.677,56")),
  // Descripción con la referencia pegada al final, como pasa en algunos renglones del Macro.
  linea(383, [33, "02/09/26"], [71, "TRANSF"], [100, "GOMEZ ANA 27222222223 VAR VARIOS TRANS 371688"], credito("4.700,00"), saldo("106.377,56")),
  linea(371, [33, "03/09/26"], [71, "YPF"], [90, "ESTACION FICTICIA"], [264, "660096"], debito("87.177,02"), saldo("19.200,54")),
  // Corte de hoja: el encabezado de la cuenta y de las columnas se repite.
  { ...linea(551, [29, "CUENTA"], [58, "CORRIENTE"], [100, "BANCARIA NRO.: 3-152-0000000001-9"]), pagina: 2 },
  { ...encabezadoColumnas(515), pagina: 2 },
  { ...linea(496, [33, "04/09/26"], [71, "10 Liq.Susc 13867754 615058 SUC.: 811"], [264, "21121920"], debito("10.000,00"), saldo("9.200,54")), pagina: 2 },
  { ...linea(484, [96, "SALDO"], [121, "FINAL AL DIA 30/09/2026"], saldo("9.200,54")), pagina: 2 },
  { ...linea(472, [29, "TOTAL COBRADO DEL IMP.S/CREDS. Y DEBS. EN CTAS. BANCARIAS DEL PERIODO"], [537, "10,20", 17]), pagina: 2 },
];

describe("Resumen de Banco Macro", () => {
  const r = importarResumenMacro(LINEAS);
  const cuenta = r.cuentas[0];

  it("lee titular, período y saldos", () => {
    expect(r).toMatchObject({ titular: "EMPRESA FICTICIA SA", cuit: "30711111118", desde: "2026-09-01", hasta: "2026-09-30" });
    expect(r.cuentas).toHaveLength(1);
    expect(cuenta).toMatchObject({ tipo: "CUENTA CORRIENTE BANCARIA", moneda: "ARS", saldoInicial: 100000, saldoFinal: 9200.54, impuestoDebitosCreditos: 10.2 });
  });

  it("distingue débitos y créditos por columna y cierra contra los saldos", () => {
    expect(cuenta.movimientos.map((m) => m.importe)).toEqual([1700, -10.2, -2.04, -10.2, 4700, -87177.02, -10000]);
    expect(r.controles).toEqual([]);
  });

  it("separa la referencia aunque venga pegada a la descripción", () => {
    expect(cuenta.movimientos[4]).toMatchObject({ descripcion: "TRANSF GOMEZ ANA 27222222223 VAR VARIOS TRANS", referencia: "371688" });
    expect(cuenta.movimientos[1].referencia).toBe("");
  });

  it("avisa si un saldo no cierra", () => {
    const mal = LINEAS.map((l) => (l.texto.includes("YPF") ? linea(l.y, [33, "03/09/26"], [71, "YPF"], debito("87.000,00"), saldo("19.200,54")) : l));
    expect(importarResumenMacro(mal).controles[0]).toMatch(/debería ser 19200.54/);
  });

  it("clasifica los movimientos con las cuentas del plan", () => {
    const c = cuenta.movimientos.map(clasificarMovimiento);
    expect(c.map((x) => [x.concepto, x.cuenta, x.automatica])).toEqual([
      ["Cobro por transferencia", "1.1.03.001", true],
      ["Retención IIBB SIRCREB", "1.1.04.014", true],
      ["Retención IIBB Tucuman", "1.1.04.014", true],
      ["Impuesto a los débitos y créditos", "1.1.04.017", true],
      ["Cobro por transferencia", "1.1.03.001", true],
      ["Compra con tarjeta de débito", "2.1.01.001", false],
      ["Suscripción de fondo común de inversión", "1.1.02.003", true],
    ]);
    expect(c[0].cuitContraparte).toBe("20111111112");
    expect(c[2].jurisdiccion).toBe("Tucuman");
  });

  it("agrupa por concepto", () => {
    const g = agruparPorConcepto(cuenta.movimientos);
    expect(g.find((x) => x.concepto === "Cobro por transferencia")).toMatchObject({ cantidad: 2, creditos: 6400, debitos: 0 });
  });
});

describe("PDF de ejemplo leído con pdf.js (de punta a punta)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { extraerLineas } = await import("@/lib/pdf/lineas");
  const datos = new Uint8Array(fs.readFileSync(path.join(__dirname, "../../../public/ejemplos/resumen-macro-ejemplo.pdf")));
  const doc = await getDocument({ data: datos, verbosity: 0 }).promise;
  const r = importarResumenMacro(await extraerLineas(doc as never));

  it("lee los 53 movimientos y cierra con el saldo final", () => {
    expect(r.cuit).toBe("30711111118");
    expect(r.cuentas[0].movimientos).toHaveLength(53);
    expect(r.cuentas[0]).toMatchObject({ saldoInicial: 450000, saldoFinal: 1227336.99, impuestoDebitosCreditos: 1770.15 });
    expect(r.controles).toEqual([]);
  });
});
