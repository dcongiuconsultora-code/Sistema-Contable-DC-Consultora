import { describe, expect, it } from "vitest";
import type { ResumenBancario } from "./tipos";
import { cobertura, consolidar, filtrar, mismoResumen } from "./resumenes";

const mov = (fecha: string, importe: number, descripcion = "X") => ({
  fecha,
  importe,
  descripcion,
  referencia: "",
  saldo: null,
  pagina: 1,
});
const resumen = (
  banco: string,
  numero: string,
  desde: string,
  hasta: string,
  movs: ReturnType<typeof mov>[],
): ResumenBancario => ({
  banco,
  titular: "PRUEBA",
  cuit: "30123456789",
  desde,
  hasta,
  controles: [],
  cuentas: [
    {
      banco,
      tipo: "CUENTA CORRIENTE",
      numero,
      moneda: "ARS",
      saldoInicial: 0,
      saldoFinal: 100,
      movimientos: movs,
      impuestoDebitosCreditos: 10,
    },
  ],
});

describe("varios resúmenes", () => {
  const ene = resumen("Macro", "1", "2026-01-01", "2026-01-31", [
    mov("2026-01-05", 100),
    mov("2026-01-30", -50),
  ]);
  const feb = resumen("Macro", "1", "2026-02-01", "2026-02-28", [
    mov("2026-02-03", 200),
    mov("2026-01-30", -50),
  ]);
  const gal = resumen("Galicia", "9", "2026-02-01", "2026-02-28", [
    mov("2026-02-10", -30),
  ]);
  const lista = [
    { nombre: "feb.pdf", resumen: feb },
    { nombre: "ene.pdf", resumen: ene },
    { nombre: "gal.pdf", resumen: gal },
  ];

  it("junta por cuenta, en orden y sin duplicar", () => {
    const c = consolidar(lista)!;
    expect(
      c.cuentas.map((x) => [x.banco, x.numero, x.movimientos.length]),
    ).toEqual([
      ["Macro", "1", 3],
      ["Galicia", "9", 1],
    ]);
    expect(c.cuentas[0].movimientos.map((m) => m.fecha)).toEqual([
      "2026-01-05",
      "2026-01-30",
      "2026-02-03",
    ]);
    expect(c.cuentas[0].impuestoDebitosCreditos).toBe(20);
    expect([c.desde, c.hasta]).toEqual(["2026-01-01", "2026-02-28"]);
    expect(c.banco).toBe("Macro, Galicia");
  });

  it("cobertura por mes y cuenta", () => {
    const k = cobertura(lista);
    expect(k.meses).toEqual(["2026-01", "2026-02"]);
    expect(k.cuentas.map((x) => [x.banco, [...x.meses].sort()])).toEqual([
      ["Macro", ["2026-01", "2026-02"]],
      ["Galicia", ["2026-02"]],
    ]);
  });

  it("filtra por mes y cuenta", () => {
    const f = filtrar(consolidar(lista)!, { mes: "2026-02", cuenta: "1" });
    expect(f.cuentas).toHaveLength(1);
    expect(f.cuentas[0].movimientos.map((m) => m.importe)).toEqual([200]);
    expect([f.desde, f.hasta]).toEqual(["2026-02-01", "2026-02-28"]);
  });

  it("reconoce el mismo resumen subido dos veces", () => {
    expect(mismoResumen(ene, { ...ene })).toBe(true);
    expect(mismoResumen(ene, feb)).toBe(false);
  });
});

import { conciliarResumen } from "./conciliacion";
import type { Comprobante } from "@/lib/arca/tipos";

describe("conciliar con las facturas cargadas", () => {
  const factura = (
    cuit: string,
    total: number,
    fecha: string,
    numero: number,
  ) =>
    ({
      cuitContraparte: cuit,
      contraparte: `Proveedor ${cuit}`,
      total,
      fecha,
      tipoNombre: "Factura A",
      puntoVenta: 2,
      numeroDesde: numero,
    }) as Comprobante;
  it("un débito del mismo importe que una compra se propone como su pago", () => {
    const r: ResumenBancario = {
      banco: "Macro",
      titular: "",
      cuit: "",
      desde: "2026-03-01",
      hasta: "2026-03-31",
      controles: [],
      cuentas: [
        {
          banco: "Macro",
          tipo: "CUENTA CORRIENTE",
          numero: "1",
          moneda: "ARS",
          saldoInicial: 0,
          saldoFinal: 0,
          impuestoDebitosCreditos: 0,
          movimientos: [
            mov("2026-03-10", -121000, "TRANSFERENCIA A TERCEROS"),
            mov("2026-03-12", -5000, "PAGO VARIOS"),
          ],
        },
      ],
    };
    const c = conciliarResumen(r, [], undefined, {
      ventas: [],
      compras: [
        factura("30711111111", 121000, "2026-02-20", 15),
        factura("30722222222", 7000, "2026-03-01", 3),
      ],
    });
    expect(c.filas[0].estado).toBe("sugerido");
    expect(c.filas[0].sugerencia).toMatchObject({
      tipo: "pago_proveedor",
      cuitContraparte: "30711111111",
    });
    expect(c.filas[0].sugerencia?.nota).toContain(
      "Pago de Factura A 00002-00000015 del 20/02",
    );
    expect(c.filas[1].estado).not.toBe("sugerido");
  });
});
