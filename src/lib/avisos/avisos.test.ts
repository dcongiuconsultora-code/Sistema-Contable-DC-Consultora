import { describe, expect, it } from "vitest";
import { completarPlantilla, linkGmail, PLANTILLAS_BASE } from "./avisos";

describe("avisos", () => {
  it("completa el modelo de vencimientos", () => {
    const texto = completarPlantilla(PLANTILLAS_BASE[0].cuerpo, {
      empresa: "Grupo Demo SAS",
      mes: "2026-11",
      fechaLimite: "2026-11-12",
      estudio: "DC Consultora",
      vencimientos: [
        {
          fecha: "2026-11-24",
          empresaId: "1",
          empresa: "Grupo Demo SAS",
          impuesto: "iva",
          detalle: "DDJJ y pago de octubre 2026",
        },
      ],
    });
    expect(texto).toContain(
      "• 24 de noviembre de 2026: IVA — DDJJ y pago de octubre 2026",
    );
    expect(texto).toContain("antes del 12 de noviembre de 2026");
    expect(texto).not.toMatch(/\{\w+\}/);
    expect(
      completarPlantilla(PLANTILLAS_BASE[1].asunto, {
        empresa: "X",
        mes: "2026-01",
        fechaLimite: "",
        estudio: "",
        vencimientos: [],
      }),
    ).toBe("Documentación de diciembre de 2025 · X");
  });

  it("arma el link de Gmail", () => {
    const l = linkGmail(["a@x.com", "b@x.com"], "Asunto", "Hola\nchau");
    expect(l).toContain("to=a%40x.com%2Cb%40x.com");
    expect(l).toContain("body=Hola%0Achau");
  });
});
