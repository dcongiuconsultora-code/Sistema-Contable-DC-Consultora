import { describe, expect, it } from "vitest";
import { impuestosDe, vencimientos } from "./vencimientos";

const sociedad = {
  id: "1",
  razon_social: "Grupo Prueba SAS",
  cuit: "30711111116", // termina en 6
  condicion_iva: "Responsable inscripto",
  mes_cierre: 12,
};
const mono = {
  id: "2",
  razon_social: "Pérez Juan",
  cuit: "20111111112",
  condicion_iva: "Monotributo",
};

describe("vencimientos", () => {
  it("elige los impuestos según la condición frente al IVA", () => {
    expect(impuestosDe(sociedad)).toEqual(["iva", "gananciasPJ"]);
    expect(impuestosDe(mono)).toEqual(["monotributo"]);
    expect(impuestosDe({ ...sociedad, impuestos: ["sicore"] })).toEqual([
      "sicore",
    ]);
  });

  it("usa la terminación del CUIT", () => {
    const { lista } = vencimientos(
      [sociedad, mono],
      "2026-11-01",
      "2026-11-30",
    );
    // IVA de noviembre: terminación 6-7 → día 24
    expect(lista).toContainEqual(
      expect.objectContaining({
        fecha: "2026-11-24",
        impuesto: "iva",
        detalle: "DDJJ y pago de octubre 2026",
      }),
    );
    // Anticipo de Ganancias sociedades, terminación 4-6 → día 16
    expect(lista).toContainEqual(
      expect.objectContaining({ fecha: "2026-11-16", impuesto: "gananciasPJ" }),
    );
    expect(lista).toContainEqual(
      expect.objectContaining({ fecha: "2026-11-20", impuesto: "monotributo" }),
    );
  });

  it("la DDJJ de sociedades vence al 5.º mes del cierre y ese mes no hay anticipo", () => {
    const { lista } = vencimientos([sociedad], "2026-05-01", "2026-05-31");
    const ganancias = lista.filter((v) => v.impuesto === "gananciasPJ");
    expect(ganancias).toEqual([
      expect.objectContaining({
        fecha: "2026-05-15",
        detalle: "DDJJ del ejercicio cerrado en diciembre",
      }),
    ]);
  });

  it("avisa si falta el calendario del año", () => {
    const r = vencimientos([sociedad], "2026-12-15", "2027-01-31");
    expect(r.faltanAnios).toEqual([2027]);
    expect(r.lista.every((v) => v.fecha.startsWith("2026-12"))).toBe(true);
  });
});

describe("planes de pago", () => {
  const plan = {
    organismo: "ARCA",
    numero: "K123",
    descripcion: "IVA 2025",
    cuotas: 6,
    primeraCuota: "2026-10",
    importeCuota: 50_000,
    diaVencimiento: null,
    cuotasPagadas: [1],
    estado: "vigente" as const,
  };

  it("arma las cuotas con el día de Mis Facilidades del calendario", async () => {
    const { cuotasDelPlan } = await import("./vencimientos");
    const c = cuotasDelPlan(plan);
    expect(c).toHaveLength(6);
    expect(c[0]).toMatchObject({
      numero: 1,
      fecha: "2026-10-16",
      pagada: true,
    });
    expect(c[1].fecha).toBe("2026-11-16");
    expect(c[5].mes).toBe("2027-03");
  });

  it("las cuotas impagas entran en los vencimientos y reemplazan al aviso genérico", () => {
    const empresa = { ...mono, impuestos: ["monotributo", "misFacilidades"] };
    const { lista } = vencimientos([empresa], "2026-10-01", "2026-11-30", {
      [empresa.id]: [plan],
    });
    const planes = lista.filter((v) => v.impuesto === "misFacilidades");
    expect(planes.map((v) => [v.fecha, v.detalle])).toEqual([
      ["2026-11-16", "ARCA plan K123: cuota 2 de 6 ($ 50.000,00)"],
    ]);
    expect(lista.some((v) => v.impuesto === "monotributo")).toBe(true);
  });

  it("detecta cuotas vencidas sin pagar", async () => {
    const { cuotasVencidas } = await import("./vencimientos");
    expect(
      cuotasVencidas([plan], "2026-12-01").map((v) => v.cuota.numero),
    ).toEqual([2]);
  });
});
