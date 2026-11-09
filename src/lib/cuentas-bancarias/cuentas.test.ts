import { describe, expect, it } from "vitest";
import { aliasValido, cbuValido, cuentaContableSugerida } from "./cuentas";

describe("cuentas bancarias", () => {
  it("controla el CBU", () => {
    // CBU de ejemplo con dígitos verificadores correctos
    expect(cbuValido("2850590940090418135201")).toBe(true);
    expect(cbuValido("2850590940090418135202")).toBe(false);
    expect(cbuValido("123")).toBe(false);
  });

  it("controla el alias", () => {
    expect(aliasValido("casa.perro.sol")).toBe(true);
    expect(aliasValido("no")).toBe(false);
  });

  it("sugiere la cuenta del plan", () => {
    expect(
      cuentaContableSugerida({
        clase: "billetera",
        tipoCuenta: "billetera",
        moneda: "ARS",
      }),
    ).toBe("1.1.01.009");
    expect(
      cuentaContableSugerida({
        clase: "banco",
        tipoCuenta: "ca",
        moneda: "ARS",
      }),
    ).toBe("1.1.01.007");
    expect(
      cuentaContableSugerida({
        clase: "banco",
        tipoCuenta: "cc",
        moneda: "USD",
      }),
    ).toBe("1.1.01.008");
  });
});
