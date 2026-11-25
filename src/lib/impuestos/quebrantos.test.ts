import { describe, expect, it } from "vitest";
import type { DdjjGanancias } from "@/lib/ddjj/leer-ddjj";
import { calcularQuebrantos } from "./quebrantos";

const dj = (cierre: string, resultado: number) =>
  ({ cierre, resultadoImpositivo: resultado }) as DdjjGanancias;
const IPC = { "2023-12": 100, "2024-12": 200, "2025-12": 300, "2026-06": 330 };

describe("quebrantos", () => {
  it("se genera, se actualiza por IPC y vence a los cinco años", () => {
    const q = calcularQuebrantos(
      { "2024-12-31": dj("2024-12-31", -1000) },
      {},
      IPC,
    );
    expect(q.aCierre).toBe("2025-12-31");
    expect(q.lista[0]).toMatchObject({
      original: 1000,
      saldo: 1000,
      saldoActualizado: 1500,
      venceEnPeriodo: 2029,
      vencido: false,
    });
    expect(q.totalActualizado).toBe(1500);
  });

  it("una ganancia posterior consume el más viejo primero (a valores actualizados)", () => {
    const q = calcularQuebrantos(
      {
        "2024-12-31": dj("2024-12-31", -1000),
        "2025-12-31": dj("2025-12-31", 600),
      },
      { "2023-12-31": 100 },
      IPC,
    );
    // 2023: 100 actualizado ×3 = 300 → se usa entero; quedan 300 de ganancia contra 2024 (×1,5).
    expect(q.lista.map((x) => [x.origen, x.saldo])).toEqual([
      ["2023-12-31", 0],
      ["2024-12-31", 800],
    ]);
    expect(q.aCierre).toBe("2026-12-31");
    expect(q.lista[1].saldoActualizado).toBe(1320); // 800 × 330/200 (último IPC cargado)
  });

  it("un quebranto vencido no suma", () => {
    const q = calcularQuebrantos({}, { "2019-12-31": 500 }, IPC, "2025-12-31");
    expect(q.lista[0].vencido).toBe(true);
    expect(q.totalActualizado).toBe(0);
  });
});
