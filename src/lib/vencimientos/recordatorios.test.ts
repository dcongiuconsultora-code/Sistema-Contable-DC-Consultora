import { describe, expect, it } from "vitest";
import { recordatoriosDelDia, textoRecordatorio } from "./recordatorios";

describe("recordatorios automáticos", () => {
  const mono = {
    id: "m",
    razon_social: "Pérez Juan",
    cuit: "20111111112",
    condicion_iva: "Monotributo",
  };
  const plan = {
    id: "p1",
    organismo: "ARCA",
    numero: "K1",
    descripcion: "",
    cuotas: 3,
    primeraCuota: "2026-10",
    importeCuota: 1000,
    diaVencimiento: null,
    cuotasPagadas: [],
    estado: "vigente" as const,
  };

  it("junta lo que vence en 3 días y las cuotas vencidas", () => {
    const r = recordatoriosDelDia([mono], { m: [plan] }, "2026-11-17");
    const lineas = r.get("m")!.map((x) => x.linea);
    expect(lineas.some((l) => l.includes("Monotributo"))).toBe(true); // vence el 20
    expect(lineas.filter((l) => l.includes("VENCIDA")).length).toBe(2); // octubre y noviembre (16)
    expect(new Set(r.get("m")!.map((x) => x.clave)).size).toBe(
      r.get("m")!.length,
    );
    expect(textoRecordatorio("Pérez Juan", lineas)).toContain(
      "vencimientos de Pérez Juan",
    );
  });

  it("no hay nada para recordar fuera de fecha", () => {
    expect(
      recordatoriosDelDia([mono], {}, "2026-11-01").get("m"),
    ).toBeUndefined();
  });
});
