import { describe, expect, it } from "vitest";
import { existenciaAFecha, inventarioDesdeFilas } from "./inventarios";

describe("inventarios", () => {
  it("lee una planilla con rubros y números en formato argentino", () => {
    const { lineas, errores } = inventarioDesdeFilas(
      [
        ["Inventario Fabriestant"],
        ["Rubro", "Producto", "Cantidad", "U. medida", "Costo unitario"],
        ["Materia prima", "Harina 000", "120", "kg", "1.250,50"],
        ["En proceso", "Masa", 30, "kg", 2000],
        ["Terminados", "Tapas x 12", 400, "paq", "3.100"],
        ["", "Fila rota", "abc", "", 1],
      ],
      "1.1.05.001",
    );
    expect(lineas.map((l) => [l.cuenta, l.cantidad, l.costo])).toEqual([
      ["1.1.05.002", 120, 1250.5],
      ["1.1.05.003", 30, 2000],
      ["1.1.05.004", 400, 3100],
    ]);
    expect(errores).toHaveLength(1);
  });

  it("suma los inventarios de todas las unidades a una fecha", () => {
    const linea = (cuenta: string, cantidad: number, costo: number) => ({
      cuenta,
      producto: "x",
      cantidad,
      costo,
    });
    const t = existenciaAFecha(
      [
        {
          fecha: "2026-12-31",
          unidad: "a",
          descripcion: "",
          lineas: [linea("1.1.05.001", 10, 100)],
        },
        {
          fecha: "2026-12-31",
          unidad: "b",
          descripcion: "",
          lineas: [linea("1.1.05.001", 5, 100), linea("1.1.05.002", 1, 50)],
        },
        {
          fecha: "2026-11-30",
          descripcion: "",
          lineas: [linea("1.1.05.001", 99, 1)],
        },
      ],
      "2026-12-31",
    );
    expect(t).toEqual({ "1.1.05.001": 1500, "1.1.05.002": 50 });
  });
});

describe("modelo de Excel", () => {
  it("el modelo se puede volver a leer", async () => {
    const { modeloExcelInventario } = await import("./inventarios");
    const { leerXlsx } = await import("@/lib/arca/leer-archivo");
    const filas = await leerXlsx(await modeloExcelInventario());
    const { lineas } = inventarioDesdeFilas(filas, "1.1.05.001");
    expect(lineas.map((l) => l.cuenta)).toEqual([
      "1.1.05.001",
      "1.1.05.002",
      "1.1.05.003",
      "1.1.05.004",
    ]);
    expect(lineas[0]).toMatchObject({
      cantidad: 48,
      costo: 1850,
      medida: "unidad",
    });
  });
});
