import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";
import {
  comprobanteAFila,
  deduccionAFila,
  filaAComprobante,
  filaADeduccion,
  filaAMovimiento,
  filasAResumen,
  movimientoAFila,
  resumenAFilas,
} from "./mapeo";

const EMPRESA = "10000000-0000-0000-0000-000000000001";

describe("Ida y vuelta entre la app y la base", () => {
  it("comprobantes (con los numeric que Postgres devuelve como texto)", () => {
    const c: Comprobante = {
      fila: 3,
      fecha: "2026-09-10",
      periodo: "2026-09",
      tipoCodigo: 1,
      tipoNombre: "Factura A",
      letra: "A",
      clase: "factura",
      puntoVenta: 2,
      numeroDesde: 1201,
      numeroHasta: 1201,
      cae: "761",
      cuitContraparte: "30711111111",
      contraparte: "Cliente SA",
      moneda: "ARS",
      tipoCambio: 1,
      alicuotas: [{ tasa: 21, neto: 1000, iva: 210 }],
      netoGravado: 1000,
      noGravado: 0,
      exento: 0,
      otrosTributos: 0,
      iva: 210,
      total: 1210,
      computaIva: true,
      advertencias: [],
    };
    const fila = comprobanteAFila(c, EMPRESA, "ventas", null);
    const comoTexto = JSON.parse(
      JSON.stringify(fila, (_, v) =>
        typeof v === "number" && v !== 1 && v !== 2 ? String(v) : v,
      ),
    );
    expect(filaAComprobante(comoTexto, 3)).toEqual(c);
  });

  it("movimientos", () => {
    const m: Movimiento = {
      id: "6f0c9a2e-0000-4000-8000-000000000001",
      tipo: "cobro",
      fecha: "2026-10-01",
      importe: 950000,
      medio: "banco_cc",
      contraparte: "Cliente SA",
      cuitContraparte: "30711111111",
      nota: "",
      estado: "enviado",
      retenciones: [
        { impuesto: "IIBB", jurisdiccion: "Salta", importe: 20000 },
      ],
      origen: "cliente",
    };
    expect(filaAMovimiento(movimientoAFila(m, EMPRESA))).toEqual(m);
    const gasto: Movimiento = {
      ...m,
      tipo: "gasto",
      retenciones: undefined,
      cuenta: "5.3.01.007",
      conFactura: false,
      origen: "banco",
      estado: "aprobado",
    };
    expect(filaAMovimiento(movimientoAFila(gasto, EMPRESA))).toEqual(gasto);
  });

  it("retenciones y percepciones", () => {
    const d = {
      origen: "SIRCREB" as const,
      impuesto: "IIBB" as const,
      jurisdiccion: "Salta",
      tipo: "retencion" as const,
      fecha: "2026-09-01",
      periodo: "2026-09",
      cuitAgente: "30500010084",
      agente: "CBU 1",
      regimen: "Retención bancaria",
      certificado: "",
      comprobante: "",
      importe: 3025,
    };
    expect(filaADeduccion(deduccionAFila(d, EMPRESA, null))).toEqual(d);
  });

  it("resumen bancario con varias cuentas", () => {
    const r: ResumenBancario = {
      banco: "Banco Macro",
      titular: "EMPRESA SA",
      cuit: "30711111111",
      desde: "2026-09-01",
      hasta: "2026-09-30",
      controles: [],
      cuentas: [
        {
          banco: "Banco Macro",
          tipo: "CUENTA CORRIENTE",
          numero: "3-1",
          moneda: "ARS",
          saldoInicial: 100,
          saldoFinal: 90,
          impuestoDebitosCreditos: 0,
          movimientos: [
            {
              fecha: "2026-09-01",
              descripcion: "A",
              referencia: "1",
              importe: -10,
              saldo: 90,
              pagina: 1,
            },
          ],
        },
        {
          banco: "Banco Macro",
          tipo: "CAJA DE AHORRO",
          numero: "4-2",
          moneda: "ARS",
          saldoInicial: 0,
          saldoFinal: 5,
          impuestoDebitosCreditos: null,
          movimientos: [
            {
              fecha: "2026-09-02",
              descripcion: "B",
              referencia: "",
              importe: 5,
              saldo: null,
              pagina: 2,
            },
          ],
        },
      ],
    };
    const { datos, filas } = resumenAFilas(r, EMPRESA, "archivo");
    expect(filas.map((f) => f.orden)).toEqual([0, 1]);
    expect(filasAResumen(datos, [...filas].reverse())).toEqual(r);
  });
});
