import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";
import { asientoCompra, asientoVenta, generarDiario } from "./diario";
import {
  balance,
  indicadores,
  mayor,
  resultados,
  type SaldosIniciales,
} from "./indicadores";

function comp(datos: Partial<Comprobante>): Comprobante {
  return {
    fila: 1,
    fecha: "2026-09-10",
    periodo: "2026-09",
    tipoCodigo: 1,
    tipoNombre: "Factura A",
    letra: "A",
    clase: "factura",
    puntoVenta: 2,
    numeroDesde: 1,
    numeroHasta: 1,
    cae: "",
    cuitContraparte: "30711111111",
    contraparte: "Cliente SA",
    moneda: "ARS",
    tipoCambio: 1,
    alicuotas: [],
    netoGravado: 1000000,
    noGravado: 0,
    exento: 0,
    otrosTributos: 0,
    iva: 210000,
    total: 1210000,
    computaIva: true,
    advertencias: [],
    ...datos,
  };
}
const sumas = (l: { debe: number; haber: number }[]) => [
  l.reduce((s, x) => s + x.debe, 0),
  l.reduce((s, x) => s + x.haber, 0),
];

describe("Asientos de comprobantes", () => {
  it("venta y nota de crédito", () => {
    expect(
      asientoVenta(comp({})).lineas.map((l) => [l.cuenta, l.debe, l.haber]),
    ).toEqual([
      ["1.1.03.001", 1210000, 0],
      ["4.1.01.001", 0, 1000000],
      ["2.1.04.001", 0, 210000],
    ]);
    const nc = asientoVenta(
      comp({ netoGravado: -100000, iva: -21000, total: -121000 }),
    );
    expect(nc.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([
      ["1.1.03.001", 0, 121000],
      ["4.1.01.001", 100000, 0],
      ["2.1.04.001", 21000, 0],
    ]);
  });

  it("compra con percepciones balancea", () => {
    const a = asientoCompra(comp({ otrosTributos: 30000, total: 1240000 }));
    const [d, h] = sumas(a.lineas);
    expect(d).toBe(h);
    expect(a.lineas.at(-1)).toMatchObject({
      cuenta: "2.1.01.001",
      haber: 1240000,
    });
  });
});

describe("Balance e índices", () => {
  const iniciales: SaldosIniciales = {
    fecha: "2026-08-31",
    saldos: {
      "1.1.01.006": 500000,
      "1.1.05.001": 2000000,
      "1.2.05.008": 5000000,
      "1.2.05.009": 1000000, // amortización acumulada: acreedora, resta del activo
      "2.1.01.001": 1500000,
      "2.1.02.002": 1000000,
      "3.1.01.001": 3000000,
      "3.2.02.001": 1000000,
    },
  };
  const movimientos: Movimiento[] = [
    {
      id: "1",
      tipo: "cobro",
      fecha: "2026-09-20",
      importe: 1210000,
      medio: "banco_cc",
      contraparte: "Cliente SA",
      cuitContraparte: "",
      nota: "",
      estado: "aprobado",
      retenciones: [],
    },
    {
      id: "2",
      tipo: "gasto",
      fecha: "2026-09-25",
      importe: 100000,
      medio: "banco_cc",
      contraparte: "",
      cuitContraparte: "",
      nota: "",
      estado: "aprobado",
      cuenta: "5.3.01.007",
      conFactura: false,
    },
    {
      id: "3",
      tipo: "gasto",
      fecha: "2026-09-26",
      importe: 999999,
      medio: "banco_cc",
      contraparte: "",
      cuitContraparte: "",
      nota: "",
      estado: "observado",
      cuenta: "5.3.01.007",
      conFactura: false,
    },
  ];
  const diario = generarDiario({
    ventas: [comp({}), comp({ fecha: "2026-08-15" })], // la de agosto ya está en los saldos de inicio
    compras: [
      comp({
        netoGravado: 500000,
        iva: 105000,
        total: 605000,
        contraparte: "Proveedor SA",
      }),
    ],
    movimientos,
    banco: [],
  });
  const b = balance(mayor(diario, iniciales, "2026-09-30"));
  const r = resultados(diario, "2026-09-01", "2026-09-30");

  it("cada asiento balancea", () => {
    for (const a of diario) {
      const [d, h] = sumas(a.lineas);
      expect(Math.round(d * 100)).toBe(Math.round(h * 100));
    }
  });

  it("arma el balance desde los saldos de inicio", () => {
    // Banco 500.000 + 1.210.000 − 100.000; IVA CF 105.000; stock 2.000.000
    expect(b.disponibilidades).toBe(1610000);
    expect(b.activoCorriente).toBe(1610000 + 105000 + 2000000);
    expect(b.activoNoCorriente).toBe(4000000);
    // Proveedores 1.500.000 + 605.000; préstamo 1.000.000; IVA DF 210.000
    expect(b.pasivoCorriente).toBe(2105000 + 1000000 + 210000);
    expect(b.resultado).toBe(1000000 - 500000 - 100000);
    expect(b.patrimonioNeto).toBe(4000000 + 400000);
    expect(b.diferencia).toBe(0);
  });

  it("calcula rentabilidad, liquidez, prueba ácida y endeudamiento", () => {
    expect(r).toMatchObject({
      ventas: 1000000,
      costos: 500000,
      gastos: 100000,
      resultado: 400000,
      margen: 0.4,
    });
    const i = Object.fromEntries(indicadores(b, r).map((x) => [x.id, x]));
    expect(i.rentabilidad.estado).toBe("bien");
    expect(i.liquidez.valor).toBeCloseTo(3715000 / 3315000, 6);
    expect(i.liquidez.estado).toBe("atencion");
    expect(i.acida.valor).toBeCloseTo(1715000 / 3315000, 6);
    expect(i.acida.estado).toBe("critico");
    expect(i.endeudamiento.valor).toBeCloseTo(3315000 / 4400000, 6);
    expect(i.endeudamiento.estado).toBe("bien");
    expect(i.liquidez.lectura).toBe(
      "Por cada $1 que tenés que pagar en el año, tenés $1,12 para hacerlo.",
    );
  });
});
