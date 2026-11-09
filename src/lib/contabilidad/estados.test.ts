import { describe, expect, it } from "vitest";
import type { Asiento } from "./diario";
import { calcularEstados } from "./estados";

const iniciales = {
  fecha: "2025-12-31",
  saldos: {
    "1.1.01.001": 1000, // caja
    "1.1.05.001": 500, // mercaderías
    "3.1.01.001": 1200, // capital
    "3.2.02.001": 300, // resultados no asignados
  },
};

function asiento(fecha: string, lineas: [string, number][]): Asiento {
  return {
    fecha,
    origen: "Cliente",
    descripcion: "",
    lineas: lineas.map(([cuenta, i]) => ({
      cuenta,
      nombre: cuenta,
      debe: i > 0 ? i : 0,
      haber: i < 0 ? -i : 0,
    })),
  };
}

const asientos = [
  // Venta de contado: 1.000 + IVA
  asiento("2026-03-15", [
    ["1.1.01.001", 1210],
    ["4.1.01.001", -1000],
    ["2.1.04.001", -210],
  ]),
  // Compra de contado: 400 + IVA
  asiento("2026-06-10", [
    ["5.1.01.004", 400],
    ["1.1.04.004", 84],
    ["1.1.01.001", -484],
  ]),
];

const indices = {
  "2025-12": 100,
  "2026-03": 110,
  "2026-06": 120,
  "2026-12": 150,
};

describe("estados contables en cifras históricas", () => {
  const e = calcularEstados({ asientos, iniciales, cierre: "2026-12-31" });

  it("arma el estado de situación patrimonial por rubro y cierra", () => {
    const caja = e.rubros.AC.find((r) => r.clave === "caja");
    expect(caja?.actual).toBe(1726);
    expect(caja?.anterior).toBe(1000);
    expect(e.totales.activo).toEqual([2310, 1500]);
    expect(e.totales.pasivo).toEqual([210, 0]);
    expect(e.totales.patrimonioNeto).toEqual([2100, 1500]);
    expect(e.diferencia).toBe(0);
  });

  it("arma el estado de resultados", () => {
    expect(e.gananciaBruta).toBe(600);
    expect(e.resultado).toBe(600);
  });

  it("explica la variación del efectivo por sus causas", () => {
    expect(e.flujo.filas.cobrosVentas).toBe(1210);
    expect(e.flujo.filas.pagosProveedores).toBe(-484);
    expect(e.flujo.resultadosDelEfectivo).toBe(0);
  });

  it("evolución del patrimonio neto", () => {
    expect(e.patrimonio.inicio.capital).toBe(1200);
    expect(e.patrimonio.inicio.noAsignados).toBe(300);
    expect(e.patrimonio.cierre.noAsignados).toBe(300);
  });

  it("con la existencia final ajusta el costo", () => {
    const conInventario = calcularEstados({
      asientos,
      iniciales,
      cierre: "2026-12-31",
      existenciaFinal: { "1.1.05.001": 700 },
    });
    expect(conInventario.resultado).toBe(800);
    expect(conInventario.diferencia).toBe(0);
  });
});

describe("en moneda homogénea (RT 6)", () => {
  const e = calcularEstados({
    asientos,
    iniciales,
    cierre: "2026-12-31",
    indices,
  });

  it("reexpresa las partidas no monetarias y calcula el RECPAM", () => {
    // Pérdida por la posición monetaria: 1.000 × 50 % + 1.000 × 36,36 % − 400 × 25 %
    expect(e.reexpresion?.recpam).toBe(-763.64);
    const bienes = e.rubros.AC.find((r) => r.clave === "bienesCambio");
    expect(bienes?.actual).toBe(750);
    expect(bienes?.anterior).toBe(750);
    expect(e.diferencia).toBe(0);
  });

  it("deja el capital nominal y la reexpresión en el ajuste de capital", () => {
    expect(e.patrimonio.cierre.capital).toBe(1200);
    expect(e.patrimonio.cierre.ajusteCapital).toBe(600);
    expect(e.patrimonio.inicio.ajusteCapital).toBe(600);
  });

  it("el resultado reexpresado incluye el RECPAM", () => {
    // ventas 1.363,64 − compras 500 − RECPAM 763,64
    expect(e.resultado).toBe(100);
    const comparativo = e.totales.patrimonioNeto[1];
    expect(comparativo).toBe(2250);
    expect(e.totales.patrimonioNeto[0]).toBe(2350);
  });

  it("el efectivo muestra su pérdida por inflación", () => {
    expect(e.flujo.inicio).toBe(1500);
    expect(e.flujo.cierre).toBe(1726);
    // Flujos reexpresados: 1.210 × 1,3636 y −484 × 1,25
    expect(e.flujo.filas.cobrosVentas).toBe(1650);
    expect(e.flujo.filas.pagosProveedores).toBe(-605);
    expect(e.flujo.resultadosDelEfectivo).toBe(-819);
  });
});

describe("Excel con el modelo RT 54", () => {
  it("completa el modelo y lo deja abrir", async () => {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { armarExcelRT54 } = await import("./exportar-rt54");
    const ExcelJS = (await import("exceljs")).default;
    const e = calcularEstados({
      asientos,
      iniciales,
      cierre: "2026-12-31",
      indices,
    });
    const plantilla = await readFile("public/modelos/rt54-modelo-eecc.xlsx");
    const salida = await armarExcelRT54(
      plantilla.buffer.slice(
        plantilla.byteOffset,
        plantilla.byteOffset + plantilla.byteLength,
      ),
      e,
      { razonSocial: "Prueba SA", cuit: "30711111111", actividad: "Comercio" },
      asientos,
      indices,
    );
    if (process.env.GUARDAR_EXCEL)
      await writeFile(process.env.GUARDAR_EXCEL, Buffer.from(salida));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(salida);
    const esp = wb.getWorksheet("1-ESP");
    expect(esp?.getCell("A2").value).toBe(
      "Denominación de la entidad: Prueba SA",
    );
    expect(esp?.getCell("B7").value).toContain("31/12/2026");
    expect(esp?.getCell("C7").value).toContain("31/12/2025");
    expect(esp?.getCell("B12").value).toBe(1726);
    expect(esp?.getCell("E34").value).toBe(2350);
    expect(wb.getWorksheet("4C-EFE (INDIRECTO)")).toBeUndefined();
    expect(wb.getWorksheet("Ajuste por inflación")).toBeDefined();
  });
});

describe("sumas y saldos", () => {
  it("separa el saldo anterior de las sumas del período y balancea", async () => {
    const { sumasYSaldos } = await import("./sumas-saldos");
    const ss = sumasYSaldos(asientos, iniciales, "2026-04-01", "2026-12-31");
    const caja = ss.filas.find((f) => f.codigo === "1.1.01.001");
    expect(caja).toMatchObject({
      anterior: 2210,
      debe: 0,
      haber: 484,
      saldo: 1726,
    });
    expect(ss.totales.deudor).toBe(ss.totales.acreedor);
  });

  it("revisa los asientos manuales y arma la refundición de IVA", async () => {
    const { revisarAsiento, asientoRefundicionIva } =
      await import("./sumas-saldos");
    expect(
      revisarAsiento({
        fecha: "2026-12-31",
        lineas: [
          { cuenta: "5.3.01.019", nombre: "", debe: 100, haber: 0 },
          { cuenta: "1.2.05.011", nombre: "", debe: 0, haber: 90 },
        ],
      }),
    ).toEqual(["No balancea: debe 100.00 y haber 90.00."]);
    const iva = asientoRefundicionIva(
      new Map([
        ["2.1.04.001", -210],
        ["1.1.04.004", 84],
      ]),
    );
    expect(iva?.lineas.map((l) => [l.cuenta, l.debe, l.haber])).toEqual([
      ["2.1.04.001", 210, 0],
      ["1.1.04.004", 0, 84],
      ["2.1.04.002", 0, 126],
    ]);
  });
});

describe("mayor y resultados mensuales", () => {
  it("mayor de una cuenta con saldo acumulado", async () => {
    const { mayorDeCuenta } = await import("./sumas-saldos");
    const m = mayorDeCuenta(
      asientos,
      iniciales,
      "1.1.01.001",
      "2026-01-01",
      "2026-12-31",
    );
    expect(m.anterior).toBe(1000);
    expect(m.renglones.map((r) => r.saldo)).toEqual([2210, 1726]);
  });

  it("resultados por mes", async () => {
    const { resultadosMensuales } = await import("./sumas-saldos");
    const r = resultadosMensuales(asientos, "2026-01-01", "2026-12-31");
    expect(r.meses).toHaveLength(12);
    const resultado = r.filas.find((f) => f.clave === "resultado")!;
    expect(resultado.valores[2]).toBe(1000);
    expect(resultado.valores[5]).toBe(-400);
    expect(resultado.total).toBe(600);
  });
});
