import { describe, expect, it } from "vitest";
import type { TicketExtraido } from "./esquema";
import { interpretarQrArca } from "./qr";
import {
  claveComprobante,
  combinarConQr,
  cuitValido,
  revisarTicket,
  ticketAComprobante,
} from "./validar";

// Datos ficticios con CUIT de dígito verificador válido.
const CLIENTE = "30711111111";
const base: TicketExtraido = {
  legible: true,
  tipoCodigo: 81,
  tipoTexto: "TIQUE FACTURA A",
  cuitEmisor: "30755555556",
  razonSocialEmisor: "Estación Ficticia SRL",
  cuitReceptor: CLIENTE,
  puntoVenta: 193,
  numero: 41856,
  fecha: "2026-10-11",
  netoGravado21: 73475.14,
  netoGravado105: 0,
  netoGravado27: 0,
  iva21: 15429.78,
  iva105: 0,
  iva27: 0,
  noGravado: 0,
  percepcionIva: 0,
  percepcionIibb: 0,
  otrosTributos: 11095.09,
  total: 100000.01,
  cae: "",
  dudas: [],
};
const HOY = new Date("2026-11-06T12:00:00Z");

describe("CUIT", () => {
  it("verifica el dígito", () => {
    expect(cuitValido("30711111111")).toBe(true);
    expect(cuitValido("30-71111111-1")).toBe(true);
    expect(cuitValido("30711111112")).toBe(false);
    expect(cuitValido("123")).toBe(false);
  });
});

describe("QR de ARCA", () => {
  const json = {
    ver: 1,
    fecha: "2026-10-11",
    cuit: 30755555556,
    ptoVta: 193,
    tipoCmp: 1,
    nroCmp: 41856,
    importe: 100000.01,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: 30711111111,
    tipoCodAut: "E",
    codAut: 76123456789012,
  };
  const url = `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify(json))}`;

  it("lee los datos del comprobante", () => {
    expect(interpretarQrArca(url)).toMatchObject({
      cuitEmisor: "30755555556",
      puntoVenta: 193,
      tipoCodigo: 1,
      numero: 41856,
      total: 100000.01,
      cuitReceptor: CLIENTE,
      codigoAutorizacion: "76123456789012",
    });
    expect(interpretarQrArca(url.replace("arca", "afip"))).not.toBeNull();
  });

  it("ignora QR que no son de ARCA", () => {
    expect(
      interpretarQrArca("https://ejemplo.com/?p=" + btoa("{}")),
    ).toBeNull();
    expect(interpretarQrArca("hola")).toBeNull();
  });

  it("los datos del QR mandan sobre lo leído en la foto", () => {
    const leido = { ...base, numero: 41858, cuitEmisor: "30755555564" };
    expect(combinarConQr(leido, interpretarQrArca(url))).toMatchObject({
      numero: 41856,
      cuitEmisor: "30755555556",
      tipoCodigo: 1,
    });
  });
});

describe("Revisión de un ticket", () => {
  it("un tique factura A a nombre del cliente computa IVA y cierra", () => {
    const r = revisarTicket(base, CLIENTE, HOY);
    expect(r.computaIva).toBe(true);
    expect(r.observaciones).toEqual([]);
  });

  it("si está a nombre de otro CUIT no computa", () => {
    const r = revisarTicket(
      { ...base, cuitReceptor: "20111111112" },
      CLIENTE,
      HOY,
    );
    expect(r.computaIva).toBe(false);
    expect(r.observaciones[0]).toMatchObject({
      gravedad: "error",
      mensaje: expect.stringContaining("otro CUIT"),
    });
  });

  it("un tique a consumidor final va como gasto sin crédito fiscal", () => {
    const r = revisarTicket(
      {
        ...base,
        tipoCodigo: 83,
        tipoTexto: "TIQUE",
        cuitReceptor: "",
        netoGravado21: 0,
        iva21: 0,
        otrosTributos: 0,
      },
      CLIENTE,
      HOY,
    );
    expect(r.computaIva).toBe(false);
    expect(r.observaciones.map((o) => o.gravedad)).toEqual(["aviso"]);
  });

  it("marca CUIT inválido, fecha futura, IVA que no corresponde y sumas que no cierran", () => {
    const r = revisarTicket(
      {
        ...base,
        cuitEmisor: "30755555557",
        fecha: "2026-12-01",
        iva21: 15000,
        dudas: ["el número de comprobante está borroso"],
      },
      CLIENTE,
      HOY,
    );
    const mensajes = r.observaciones.map((o) => o.mensaje).join(" | ");
    expect(mensajes).toMatch(/CUIT del emisor no es válido/);
    expect(mensajes).toMatch(/posterior a hoy/);
    expect(mensajes).toMatch(/IVA 21%/);
    expect(mensajes).toMatch(/suman/);
    expect(mensajes).toMatch(/borroso/);
  });
});

describe("Conversión a comprobante de compra", () => {
  it("tique factura A: neto e IVA por alícuota y otros tributos aparte", () => {
    const c = ticketAComprobante(revisarTicket(base, CLIENTE, HOY), 1);
    expect(c).toMatchObject({
      tipoNombre: "Tique Factura A",
      letra: "A",
      periodo: "2026-10",
      computaIva: true,
      iva: 15429.78,
      otrosTributos: 11095.09,
      total: 100000.01,
    });
    expect(c.alicuotas).toEqual([{ tasa: 21, neto: 73475.14, iva: 15429.78 }]);
  });

  it("sin crédito fiscal todo va a no gravado", () => {
    const c = ticketAComprobante(
      revisarTicket(
        { ...base, tipoCodigo: 82, tipoTexto: "TIQUE FACTURA B" },
        CLIENTE,
        HOY,
      ),
      1,
    );
    expect(c).toMatchObject({
      computaIva: false,
      iva: 0,
      alicuotas: [],
      noGravado: 88904.92,
      otrosTributos: 11095.09,
    });
  });

  it("se cruza con el mismo comprobante de ARCA por CUIT, punto de venta y número", () => {
    const c = ticketAComprobante(revisarTicket(base, CLIENTE, HOY), 1);
    expect(claveComprobante(c)).toBe("30755555556-193-41856");
  });
});
