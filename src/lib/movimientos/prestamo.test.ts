import { describe, expect, it } from "vitest";
import { generarAsiento, totalesAsiento, validarMovimiento } from "./asiento";
import type { Movimiento } from "./tipos";

const base: Movimiento = {
  id: "1",
  tipo: "prestamo",
  fecha: "2026-03-10",
  importe: 100000,
  medio: "banco_cc",
  contraparte: "",
  cuitContraparte: "",
  nota: "",
  estado: "aprobado",
};
const lineas = (m: Movimiento) =>
  generarAsiento(m).map((l) => [l.cuenta, l.debe, l.haber]);

describe("préstamos bancarios", () => {
  it("cuota con intereses e IVA separados: el resto es capital", () => {
    const m: Movimiento = {
      ...base,
      cuenta: "cuota",
      desglose: [
        { cuenta: "5.4.01.001", importe: 20000 },
        { cuenta: "1.1.04.004", importe: 4200 },
      ],
    };
    expect(lineas(m)).toEqual([
      ["2.1.02.002", 75800, 0],
      ["5.4.01.001", 20000, 0],
      ["1.1.04.004", 4200, 0],
      ["1.1.01.006", 0, 100000],
    ]);
    expect(totalesAsiento(generarAsiento(m)).balancea).toBe(true);
    expect(validarMovimiento(m)).toEqual([]);
  });

  it("cuota sin separar va toda al préstamo", () => {
    expect(lineas({ ...base, cuenta: "cuota" })).toEqual([
      ["2.1.02.002", 100000, 0],
      ["1.1.01.006", 0, 100000],
    ]);
  });

  it("acreditación del préstamo entra al banco", () => {
    expect(lineas({ ...base, cuenta: "acreditacion" })).toEqual([
      ["1.1.01.006", 100000, 0],
      ["2.1.02.002", 0, 100000],
    ]);
  });

  it("controla que lo separado no supere la cuota y pide el concepto", () => {
    expect(
      validarMovimiento({
        ...base,
        cuenta: "cuota",
        desglose: [{ cuenta: "5.4.01.001", importe: 200000 }],
      }),
    ).toContain("Los intereses, IVA y gastos suman más que la cuota.");
    expect(validarMovimiento({ ...base })).toContain("Elegí el concepto.");
  });
});
