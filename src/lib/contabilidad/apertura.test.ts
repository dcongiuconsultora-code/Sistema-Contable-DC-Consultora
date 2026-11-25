import { describe, expect, it } from "vitest";
import {
  asientoApertura,
  leerBalanceCerrado,
  saldosDeApertura,
  totalesApertura,
} from "./apertura";

// Misma forma que el modelo RT 54 del estudio, con importes inventados.
const RT54 = {
  "0-C": [
    [null, null, "EMPRESA DEMO S.A.S."],
    [null, null, "ESTADOS CONTABLES AL 31/12/2025"],
  ],
  "1-ESP": [
    ["Total del activo", 1300, "Total del pasivo y patrimonio neto", 1300],
  ],
  NOTAS: [
    ["Nota 3.1 - Caja y Bancos"],
    ["Cuenta Contable", new Date("2025-12-31")],
    ["Efectivo ", 100],
    ["Depósitos en cuentas bancarias", 200],
    [null, 300],
    ["Nota 3.3 -\tCréditos impositivos"],
    ["Saldo a favor iva", 50],
    ["Total ", 50],
    ["Nota 3.6 - Deudas fiscales"],
    ["Impuesto a las ganancias a pagar", 150],
    ["Impuesto al valor agregado a pagar", 0],
    ["Nota 3.7- Ingresos netos por la venta de bienes"],
    ["Ventas de bienes y prestación de servicios", 999999],
  ],
  "7-A B.Uso": [
    [
      "Rubros",
      "Al inicio",
      "Altas",
      "Bajas",
      "Al cierre",
      "Al inicio",
      "Del ejercicio",
      "Al cierre",
    ],
    ["Rodados", 0, 1000, 0, 1000, 0, 50, 50],
    ["Total al 31/12/2025", 0, 1000, 0, 1000, 0, 50, 50],
  ],
  "3-EEPN": [
    [
      "Rubros",
      "Capital suscripto",
      "Ajuste del capital",
      null,
      null,
      null,
      "Ganancias reservadas",
      null,
      "Resultados no asignados",
    ],
    [null, null, null, null, null, null, "Reserva legal", "Otras reservas"],
    ["Saldos al cierre del ejercicio", 1000, 0, 0, 0, 1000, 0, 0, 150],
  ],
};

describe("importar el balance cerrado", () => {
  const b = leerBalanceCerrado(RT54)!;

  it("lee el modelo RT 54: notas, bienes de uso y patrimonio neto", () => {
    expect(b).toMatchObject({
      formato: "RT 54",
      fechaCierre: "2025-12-31",
      totalActivo: 1300,
    });
    expect(
      b.renglones.map((r) => [r.concepto, r.lado, r.importe, r.cuenta]),
    ).toEqual([
      ["Efectivo", "deudor", 100, "1.1.01.001"],
      ["Depósitos en cuentas bancarias", "deudor", 200, "1.1.01.006"],
      ["Saldo a favor iva", "deudor", 50, "1.1.04.005"],
      ["Impuesto a las ganancias a pagar", "acreedor", 150, "2.1.04.005"],
      ["Rodados", "deudor", 1000, "1.2.05.008"],
      ["Amortización acumulada rodados", "acreedor", 50, "1.2.05.009"],
      ["Capital suscripto", "acreedor", 1000, "3.1.01.001"],
      ["Resultados no asignados", "acreedor", 150, "3.2.02.001"],
    ]);
    expect(totalesApertura(b.renglones).diferencia).toBe(0);
  });

  it("arma los saldos de inicio y el asiento de apertura", () => {
    const ini = saldosDeApertura(b.renglones, "2025-12-31");
    expect(ini.saldos["1.2.05.009"]).toBe(50); // amortización: saldo acreedor en su lado natural
    expect(ini.saldos["3.1.01.001"]).toBe(1000);
    const a = asientoApertura(ini)!;
    expect(a.fecha).toBe("2026-01-01");
    const debe = a.lineas.reduce((s, l) => s + l.debe, 0);
    const haber = a.lineas.reduce((s, l) => s + l.haber, 0);
    expect(debe).toBe(1350);
    expect(haber).toBe(1350);
  });

  it("lee un Excel de sumas y saldos", () => {
    const s = leerBalanceCerrado({
      Hoja1: [
        ["Balance de sumas y saldos al 31/12/2025"],
        ["Código", "Cuenta", "Saldo deudor", "Saldo acreedor"],
        ["1.1.01.001", "Caja", 500, null],
        ["", "Proveedores", null, 200],
        ["", "Capital social", null, 300],
        ["", "Totales", 500, 500],
      ],
    })!;
    expect(s.formato).toBe("Sumas y saldos");
    expect(s.fechaCierre).toBe("2025-12-31");
    expect(s.renglones.map((r) => [r.lado, r.importe, r.cuenta])).toEqual([
      ["deudor", 500, "1.1.01.001"],
      ["acreedor", 200, "2.1.01.001"],
      ["acreedor", 300, "3.1.01.001"],
    ]);
  });
});
