import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { leerCsv, leerXlsx } from "./leer-archivo";
import { importarMisComprobantes, parsearFecha, parsearImporte } from "./parse";
import { liquidarIva } from "@/lib/iva/liquidacion";

// Formato "simple" de Mis Comprobantes: un solo IVA por comprobante, CSV con ";" y coma decimal.
const CSV_EMITIDOS = `Mis Comprobantes Emitidos - CUIT 30709845123
Fecha;Tipo;Punto de Venta;Número Desde;Número Hasta;Cód. Autorización;Tipo Doc. Receptor;Nro. Doc. Receptor;Denominación Receptor;Tipo Cambio;Moneda;Imp. Neto Gravado;Imp. Neto No Gravado;Imp. Op. Exentas;IVA;Imp. Total
03/09/2026;1 - Factura A;2;1201;1201;76123456789012;CUIT;30718880014;Supermercados Ríos SA;1;$;8.000.000,00;0,00;0,00;1.680.000,00;9.680.000,00
15/09/2026;1 - Factura A;2;1203;1203;76123456789013;CUIT;30699998881;Almacén Central Córdoba;1;$;2.100.000,00;0,00;0,00;220.500,00;2.320.500,00
20/09/2026;3 - Nota de Crédito A;2;45;45;76123456789014;CUIT;30718880014;Supermercados Ríos SA;1;$;100.000,00;0,00;0,00;21.000,00;121.000,00
22/09/2026;1 - Factura A;2;1204;1204;76123456789015;CUIT;30715552220;Distribuidora Litoral SA;1;$;1.000.000,00;0,00;0,00;131.000,00;1.131.000,00
22/09/2026;1 - Factura A;2;1204;1204;76123456789015;CUIT;30715552220;Distribuidora Litoral SA;1;$;1.000.000,00;0,00;0,00;131.000,00;1.131.000,00
`;

describe("parsearImporte / parsearFecha", () => {
  it("entiende formato argentino y anglosajón", () => {
    expect(parsearImporte("1.234.567,89")).toBe(1234567.89);
    expect(parsearImporte("1234.5")).toBe(1234.5);
    expect(parsearImporte("1,234.50")).toBe(1234.5);
    expect(parsearImporte("$ -50,25")).toBe(-50.25);
    expect(parsearImporte(42)).toBe(42);
    expect(parsearImporte("")).toBe(0);
  });
  it("entiende fechas en varios formatos", () => {
    expect(parsearFecha("03/09/2026")).toBe("2026-09-03");
    expect(parsearFecha("2026-09-03")).toBe("2026-09-03");
    expect(parsearFecha(new Date(Date.UTC(2026, 8, 3)))).toBe("2026-09-03");
    expect(parsearFecha(46268)).toBe("2026-09-03");
  });
});

describe("Mis Comprobantes formato simple (CSV)", () => {
  const r = importarMisComprobantes(leerCsv(CSV_EMITIDOS));

  it("detecta emitidos y el CUIT del titular", () => {
    expect(r.operacion).toBe("ventas");
    expect(r.formato).toBe("simple");
    expect(r.cuitTitular).toBe("30709845123");
  });

  it("omite el comprobante repetido", () => {
    expect(r.comprobantes).toHaveLength(4);
    expect(r.errores).toEqual([
      { fila: 7, mensaje: expect.stringContaining("repetido") },
    ]);
  });

  it("deduce la alícuota y pone en negativo las notas de crédito", () => {
    const [fa, fa105, nc, mixta] = r.comprobantes;
    expect(fa.alicuotas).toEqual([{ tasa: 21, neto: 8000000, iva: 1680000 }]);
    expect(fa105.alicuotas).toEqual([
      { tasa: 10.5, neto: 2100000, iva: 220500 },
    ]);
    expect(nc.clase).toBe("nota_credito");
    expect(nc.total).toBe(-121000);
    expect(nc.alicuotas).toEqual([{ tasa: 21, neto: -100000, iva: -21000 }]);
    expect(nc.contraparte).toBe("Supermercados Ríos SA");
    // 131.000 sobre 1.000.000 no es ninguna alícuota: queda marcado para revisar.
    expect(mixta.alicuotas[0].tasa).toBeNull();
    expect(mixta.advertencias[0]).toMatch(/alícuota/);
  });
});

async function xlsxDetallado(): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Recibidos");
  hoja.addRow(["Mis Comprobantes Recibidos - CUIT 30-70984512-3"]);
  hoja.addRow([
    "Fecha de Emisión",
    "Tipo de Comprobante",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Cód. Autorización",
    "Tipo Doc. Emisor",
    "Nro. Doc. Emisor",
    "Denominación Emisor",
    "Tipo Cambio",
    "Moneda",
    "Imp. Neto Gravado IVA 21%",
    "IVA 21%",
    "Imp. Neto Gravado IVA 10,5%",
    "IVA 10,5%",
    "Imp. Neto Gravado Total",
    "Imp. Neto No Gravado",
    "Imp. Op. Exentas",
    "Otros Tributos",
    "Total IVA",
    "Imp. Total",
  ]);
  const d = (dia: number) => new Date(Date.UTC(2026, 8, dia));
  hoja.addRow([
    d(5),
    "1 - Factura A",
    4,
    38811,
    38811,
    "7612",
    "CUIT",
    30712345678,
    "Molinos del Sur SA",
    1,
    "$",
    9000000,
    1890000,
    1500000,
    157500,
    10500000,
    0,
    0,
    276400,
    2047500,
    12823900,
  ]);
  hoja.addRow([
    d(10),
    "6 - Factura B",
    1,
    900,
    900,
    "7613",
    "CUIT",
    30711112223,
    "Librería Centro",
    1,
    "$",
    10000,
    2100,
    0,
    0,
    10000,
    0,
    0,
    0,
    2100,
    12100,
  ]);
  hoja.addRow([
    d(12),
    "1 - Factura A",
    7,
    55,
    55,
    "7614",
    "CUIT",
    30700000001,
    "Proveedor Exterior",
    "1000",
    "DOL",
    100,
    21,
    0,
    0,
    100,
    0,
    0,
    0,
    21,
    121,
  ]);
  return (await libro.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("Mis Comprobantes formato detallado (XLSX)", async () => {
  const r = importarMisComprobantes(await leerXlsx(await xlsxDetallado()));

  it("detecta recibidos con desglose por alícuota", () => {
    expect(r.operacion).toBe("compras");
    expect(r.formato).toBe("detallado");
    expect(r.cuitTitular).toBe("30709845123");
    expect(r.errores).toEqual([]);
  });

  it("separa las alícuotas", () => {
    const fa = r.comprobantes[0];
    expect(fa.alicuotas).toEqual([
      { tasa: 21, neto: 9000000, iva: 1890000 },
      { tasa: 10.5, neto: 1500000, iva: 157500 },
    ]);
    expect(fa.otrosTributos).toBe(276400);
    expect(fa.advertencias).toEqual([]);
  });

  it("factura B recibida va toda a no gravado", () => {
    const fb = r.comprobantes[1];
    expect(fb.computaIva).toBe(false);
    expect(fb.iva).toBe(0);
    expect(fb.noGravado).toBe(12100);
  });

  it("convierte moneda extranjera con el tipo de cambio", () => {
    const usd = r.comprobantes[2];
    expect(usd.moneda).toBe("DOL");
    expect(usd.total).toBe(121000);
    expect(usd.alicuotas).toEqual([{ tasa: 21, neto: 100000, iva: 21000 }]);
  });

  it("liquida IVA como la planilla", () => {
    const ventas = importarMisComprobantes(leerCsv(CSV_EMITIDOS)).comprobantes;
    const liq = liquidarIva(ventas, r.comprobantes, {
      saldoTecnicoAnterior: 0,
      saldoLibreDisponibilidadAnterior: 0,
      percepciones: 186400,
      retenciones: 0,
    });
    // Débito: 1.680.000 + 220.500 - 21.000 + 131.000 = 2.010.500
    expect(liq.debitoFiscal).toBe(2010500);
    // Crédito: 1.890.000 + 157.500 + 21.000 (la factura B no computa)
    expect(liq.creditoFiscal).toBe(2068500);
    expect(liq.saldoTecnico).toBe(-58000);
    expect(liq.saldoTecnicoAFavor).toBe(58000);
    expect(liq.saldoAPagar).toBe(0);
    expect(liq.saldoLibreDisponibilidad).toBe(186400);
  });
});

// Encabezados tal cual los exporta ARCA hoy ("Neto Grav. IVA 21%"), con datos ficticios.
describe("Mis Comprobantes formato ARCA actual (encabezados abreviados)", async () => {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Sheet1");
  hoja.addRow(["Mis Comprobantes Emitidos - CUIT 30711111118"]);
  hoja.addRow([
    "Fecha",
    "Tipo",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Cód. Autorización",
    "Tipo Doc. Receptor",
    "Nro. Doc. Receptor",
    "Denominación Receptor",
    "Tipo Cambio",
    "Moneda",
    "Neto Grav. IVA 0%",
    "IVA 2,5%",
    "Neto Grav. IVA 2,5%",
    "IVA 5%",
    "Neto Grav. IVA 5%",
    "IVA 10,5%",
    "Neto Grav. IVA 10,5%",
    "IVA 21%",
    "Neto Grav. IVA 21%",
    "IVA 27%",
    "Neto Grav. IVA 27%",
    "Neto Gravado Total",
    "Neto No Gravado",
    "Op. Exentas",
    "Otros Tributos",
    "Total IVA",
    "Imp. Total",
  ]);
  const vacio = Array(10).fill(null);
  hoja.addRow([
    "15/10/2026",
    "6 - Factura B",
    2,
    260,
    260,
    86400000000001,
    null,
    null,
    null,
    1,
    "$",
    ...vacio.slice(0, 7),
    39575.63,
    188455.38,
    null,
    null,
    188455.38,
    0,
    0,
    0,
    39575.63,
    228031,
  ]);
  hoja.addRow([
    "22/10/2026",
    "1 - Factura A",
    1,
    54,
    54,
    86400000000002,
    "CUIT",
    30722222229,
    "Cliente Ficticio SRL",
    1,
    "$",
    ...vacio.slice(0, 7),
    731383.38,
    3482778,
    null,
    null,
    3482778,
    0,
    0,
    0,
    731383.38,
    4214161.38,
  ]);
  const r = importarMisComprobantes(
    await leerXlsx((await libro.xlsx.writeBuffer()) as ArrayBuffer),
  );

  it("lee neto e IVA por alícuota", () => {
    expect(r.operacion).toBe("ventas");
    expect(r.formato).toBe("detallado");
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([]);
    expect(r.comprobantes.map((c) => c.alicuotas)).toEqual([
      [{ tasa: 21, neto: 188455.38, iva: 39575.63 }],
      [{ tasa: 21, neto: 3482778, iva: 731383.38 }],
    ]);
    expect(r.comprobantes.every((c) => c.advertencias.length === 0)).toBe(true);
  });

  it("factura B a consumidor final queda sin CUIT", () => {
    expect(r.comprobantes[0].cuitContraparte).toBe("");
    expect(r.comprobantes[0].contraparte).toBe("");
  });
});

// Recibidos tal cual los exporta ARCA: traen emisor y receptor. Datos ficticios.
describe("Mis Comprobantes recibidos formato ARCA actual", async () => {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Sheet1");
  hoja.addRow(["Mis Comprobantes Recibidos - CUIT 30711111118"]);
  hoja.addRow([
    "Fecha",
    "Tipo",
    "Punto de Venta",
    "Número Desde",
    "Número Hasta",
    "Cód. Autorización",
    "Tipo Doc. Emisor",
    "Nro. Doc. Emisor",
    "Denominación Emisor",
    "Tipo Doc. Receptor",
    "Nro. Doc. Receptor",
    "Tipo Cambio",
    "Moneda",
    "Neto Grav. IVA 0%",
    "IVA 2,5%",
    "Neto Grav. IVA 2,5%",
    "IVA 5%",
    "Neto Grav. IVA 5%",
    "IVA 10,5%",
    "Neto Grav. IVA 10,5%",
    "IVA 21%",
    "Neto Grav. IVA 21%",
    "IVA 27%",
    "Neto Grav. IVA 27%",
    "Neto Gravado Total",
    "Neto No Gravado",
    "Op. Exentas",
    "Otros Tributos",
    "Total IVA",
    "Imp. Total",
  ]);
  const vacio = (n: number) => Array(n).fill(null);
  const receptor = ["CUIT", 30711111118, 1, "$"];
  hoja.addRow([
    "01/10/2026",
    "1 - Factura A",
    7,
    746401,
    746401,
    86400000000003,
    "CUIT",
    30733333331,
    "Proveedor Uno SA",
    ...receptor,
    ...vacio(7),
    8334.38,
    39687.54,
    null,
    null,
    39687.54,
    0,
    0,
    1428.75,
    8334.38,
    49450.67,
  ]);
  hoja.addRow([
    "03/10/2026",
    "3 - Nota de Crédito A",
    7,
    120,
    120,
    86400000000004,
    "CUIT",
    30733333331,
    "Proveedor Uno SA",
    ...receptor,
    ...vacio(7),
    2100,
    10000,
    null,
    null,
    10000,
    0,
    0,
    0,
    2100,
    12100,
  ]);
  hoja.addRow([
    "05/10/2026",
    "11 - Factura C",
    2,
    201,
    201,
    86400000000005,
    "CUIT",
    27344444445,
    "Monotributista Ficticia",
    ...receptor,
    ...vacio(14),
    0,
    null,
    385000,
  ]);
  hoja.addRow([
    "11/10/2026",
    "81 - Tique Factura A",
    193,
    41856,
    41856,
    null,
    "CUIT",
    30755555557,
    "Estación Ficticia SRL",
    ...receptor,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    15429.78,
    73475.14,
    0,
    0,
    73475.14,
    0,
    0,
    0,
    15429.78,
    100000.01,
  ]);
  const r = importarMisComprobantes(
    await leerXlsx((await libro.xlsx.writeBuffer()) as ArrayBuffer),
  );
  const [fa, nc, fc, tique] = r.comprobantes;

  it("toma al emisor como contraparte, no al receptor", () => {
    expect(r.operacion).toBe("compras");
    expect(fa.cuitContraparte).toBe("30733333331");
    expect(fa.contraparte).toBe("Proveedor Uno SA");
  });

  it("nota de crédito en negativo", () => {
    expect(nc.alicuotas).toEqual([{ tasa: 21, neto: -10000, iva: -2100 }]);
    expect(nc.total).toBe(-12100);
  });

  it("factura C que solo trae el total va entera a no gravado", () => {
    expect(fc.computaIva).toBe(false);
    expect(fc.noGravado).toBe(385000);
    expect(fc.advertencias).toEqual([]);
  });

  it("marca la diferencia que no figura en ninguna columna", () => {
    expect(tique.computaIva).toBe(true);
    expect(tique.advertencias).toEqual([expect.stringContaining("11.095,09")]);
  });
});
