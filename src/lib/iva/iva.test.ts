import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import { encadenarIva } from "./liquidacion";

function comp(fecha: string, iva: number, computaIva = true): Comprobante {
  return {
    fecha,
    iva,
    netoGravado: iva / 0.21,
    alicuotas: [{ tasa: 21, neto: iva / 0.21, iva }],
    noGravado: 0,
    exento: 0,
    otrosTributos: 0,
    total: iva / 0.21 + iva,
    computaIva,
  } as unknown as Comprobante;
}

describe("liquidación de IVA encadenada", () => {
  const ventas: Record<string, Comprobante[]> = {
    "2026-07": [comp("2026-07-10", 100)],
    "2026-09": [comp("2026-09-10", 500)],
  };
  const compras: Record<string, Comprobante[]> = {
    "2026-07": [comp("2026-07-05", 300)],
    "2026-08": [comp("2026-08-05", 50)],
  };
  const datosDe = (p: string) => ({
    ventas: ventas[p] ?? [],
    compras: compras[p] ?? [],
    desdeArchivos: null,
  });

  it("arrastra el saldo técnico a favor mes a mes (también en meses sin movimiento)", () => {
    const r = encadenarIva(["2026-07", "2026-09"], datosDe, {});
    expect([...r.keys()]).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(r.get("2026-07")!.liquidacion.saldoTecnicoAFavor).toBe(200);
    expect(r.get("2026-08")!.manual.saldoTecnicoAnterior).toBe(200);
    expect(r.get("2026-08")!.liquidacion.saldoTecnicoAFavor).toBe(250);
    expect(r.get("2026-09")!.arrastradoDe).toBe("2026-08");
    expect(r.get("2026-09")!.liquidacion.saldoAPagar).toBe(250);
  });

  it("lo corregido a mano manda y se arrastra", () => {
    const r = encadenarIva(["2026-07", "2026-09"], datosDe, {
      "2026-07": { manual: { saldoTecnicoAnterior: 1000 } },
      "2026-08": { manual: { retenciones: 0 } },
    });
    expect(r.get("2026-07")!.liquidacion.saldoTecnicoAFavor).toBe(1200);
    expect(r.get("2026-09")!.manual.saldoTecnicoAnterior).toBe(1250);
  });

  it("un mes presentado arrastra lo que se presentó", () => {
    const r = encadenarIva(["2026-07", "2026-09"], datosDe, {
      "2026-08": {
        manual: {},
        presentada: true,
        resultado: {
          saldoTecnicoAFavor: 10,
          saldoLibreDisponibilidad: 5,
          saldoAPagar: 0,
        },
      },
    });
    expect(r.get("2026-09")!.manual).toMatchObject({
      saldoTecnicoAnterior: 10,
      saldoLibreDisponibilidadAnterior: 5,
    });
    expect(r.get("2026-08")!.presentada).toBe(true);
  });
});
