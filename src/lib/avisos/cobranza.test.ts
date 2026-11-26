import { describe, expect, it } from "vitest";
import type { PlanPago } from "@/lib/vencimientos/vencimientos";
import {
  linkWhatsapp,
  mensajeParaCliente,
  numeroWhatsapp,
  pendientesDeCliente,
} from "./cobranza";

const empresa = {
  id: "e1",
  razon_social: "Prueba",
  cuit: "20111111112",
  condicion_iva: "Monotributo",
};
const plan = (extra: Partial<PlanPago>): PlanPago => ({
  organismo: "ARCA",
  numero: "W1",
  descripcion: "",
  cuotas: 6,
  primeraCuota: "2026-09",
  importeCuota: 1000,
  diaVencimiento: 16,
  cuotasPagadas: [1],
  estado: "vigente",
  ...extra,
});

describe("recordatorios por cliente", () => {
  it("dos cuotas impagas: a punto de caducar, y la próxima por vencer", () => {
    const p = pendientesDeCliente(empresa, [plan({})], "2026-11-26", 30);
    expect(p[0]).toMatchObject({ nivel: "urgente" });
    expect(p[0].texto).toContain(
      "Debés 2 cuotas del plan de ARCA W1 (cuotas 2, 3",
    );
    expect(p[0].texto).toContain("a punto de caducar");
    expect(
      p.some((x) =>
        x.texto.includes("El 16/12 vence la cuota 4 del plan de ARCA W1"),
      ),
    ).toBe(true);
    expect(p.some((x) => x.texto.includes("cuota del monotributo"))).toBe(true);
  });

  it("una sola cuota impaga avisa que puede caducar", () => {
    const p = pendientesDeCliente(
      empresa,
      [plan({ cuotasPagadas: [1, 2] })],
      "2026-11-26",
      3,
    );
    expect(p).toHaveLength(1);
    expect(p[0].texto).toContain("No pagaste la cuota 3");
  });

  it("arma el mensaje", () => {
    const m = mensajeParaCliente(
      "Prueba",
      pendientesDeCliente(empresa, [plan({})], "2026-11-26"),
    );
    expect(m.asunto).toContain("Importante");
    expect(m.texto).toContain("⚠️ Debés 2 cuotas");
  });

  it("números de WhatsApp argentinos", () => {
    expect(numeroWhatsapp("0388 15-412-3456")).toBe("5493884123456");
    expect(numeroWhatsapp("+54 9 388 412-3456")).toBe("5493884123456");
    expect(numeroWhatsapp("11 2345 6789")).toBe("5491123456789");
    expect(numeroWhatsapp("011 15 2345 6789")).toBe("5491123456789");
    expect(numeroWhatsapp("4123456")).toBeNull();
    expect(linkWhatsapp("3884123456", "Hola")).toBe(
      "https://wa.me/5493884123456?text=Hola",
    );
  });
});
