import { describe, expect, it } from "vitest";
import type { Asiento } from "@/lib/contabilidad/diario";
import { INDICES_FACPCE } from "@/lib/inflacion/indices";
import { calcularAxi } from "./axi";

const iniciales = {
  fecha: "2024-12-31",
  saldos: {
    "1.1.01.006": 1_000_000, // banco
    "1.1.05.001": 500_000, // mercaderías (computable)
    "1.2.05.006": 2_000_000, // maquinarias (no computable)
    "2.1.01.001": 300_000, // proveedores
    "3.1.01.001": 3_200_000,
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
  asiento("2025-03-10", [
    ["1.1.01.006", 50_000],
    ["3.1.01.003", -50_000],
  ]), // aporte
  asiento("2025-06-20", [
    ["1.1.04.024", 100_000],
    ["1.1.01.006", -100_000],
  ]), // retiro
];

describe("ajuste por inflación impositivo", () => {
  const axi = calcularAxi({
    asientos,
    iniciales,
    cierre: "2025-12-31",
    indices: INDICES_FACPCE,
  });

  it("usa el IPC de diciembre a diciembre, redondeado como la planilla", () => {
    expect(axi.coeficiente).toBe(0.3155);
    expect(axi.meses).toHaveLength(12);
    expect(axi.meses[0]).toBe("2025-01");
  });

  it("ajuste estático sobre el activo computable menos el pasivo", () => {
    expect(axi.estatico.activo).toBe(3_500_000);
    expect(axi.estatico.activoComputable).toBe(1_500_000);
    expect(axi.estatico.pasivoComputable).toBe(300_000);
    expect(axi.estatico.ajuste).toBe(-378_600);
  });

  it("ajuste dinámico: retiros suman, aportes restan", () => {
    expect(axi.dinamico.ajustes[5]).toBe(14_290); // junio: 100.000 × 14,29 %
    expect(axi.dinamico.ajustes[2]).toBe(-10_585); // marzo: −50.000 × 21,17 %
    expect(axi.dinamico.ajuste).toBe(3_705);
    expect(axi.total).toBe(-374_895);
  });

  it("acepta correcciones del estudio", () => {
    const corregido = calcularAxi({
      asientos,
      iniciales,
      cierre: "2025-12-31",
      indices: INDICES_FACPCE,
      correcciones: {
        computables: { maquinarias: true },
        importes: { proveedores: 0 },
      },
    });
    expect(corregido.estatico.capitalExpuesto).toBe(3_500_000);
  });

  it("informa la variación de 36 meses", () => {
    expect(axi.variacion36).toBeGreaterThan(1);
  });
});

describe("papel de trabajo en Excel", () => {
  it("arma las cuatro hojas", async () => {
    const { armarExcelAxi } = await import("./exportar-axi");
    const ExcelJS = (await import("exceljs")).default;
    const axi = calcularAxi({
      asientos,
      iniciales,
      cierre: "2025-12-31",
      indices: INDICES_FACPCE,
    });
    const salida = await armarExcelAxi(axi, "Prueba SA");
    if (process.env.GUARDAR_EXCEL) {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(process.env.GUARDAR_EXCEL, Buffer.from(salida));
    }
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(salida);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "IPC",
      "Ajuste Estático",
      "Ajuste Dinámico",
      "Resumen",
    ]);
  });
});
