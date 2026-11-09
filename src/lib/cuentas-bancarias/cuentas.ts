export type ClaseCuenta = "banco" | "billetera";

export interface CuentaBancaria {
  id?: string;
  clase: ClaseCuenta;
  entidad: string;
  tipoCuenta: "cc" | "ca" | "billetera";
  moneda: "ARS" | "USD";
  numero: string;
  /** CBU (bancos) o CVU (billeteras), 22 dígitos. */
  cbu: string;
  alias: string;
  cuentaContable: string;
  unidad?: string | null;
  activa: boolean;
}

export const BANCOS = [
  "Banco Macro",
  "Banco Galicia",
  "BBVA",
  "Banco Santander",
  "Banco Nación",
  "Banco Provincia",
  "Banco Credicoop",
  "ICBC",
  "Banco Patagonia",
  "Banco Hipotecario",
  "Banco Supervielle",
  "Banco Ciudad",
  "HSBC",
  "Brubank",
];

export const BILLETERAS = [
  "Mercado Pago",
  "Naranja X",
  "Ualá",
  "Personal Pay",
  "MODO",
  "Cuenta DNI",
  "Prex",
  "Lemon",
];

/** Cuenta del plan donde se registra (caja de ahorro, cuenta corriente, moneda extranjera, billetera). */
export function cuentaContableSugerida(
  c: Pick<CuentaBancaria, "clase" | "tipoCuenta" | "moneda">,
) {
  if (c.clase === "billetera") return "1.1.01.009";
  if (c.moneda === "USD") return "1.1.01.008";
  return c.tipoCuenta === "ca" ? "1.1.01.007" : "1.1.01.006";
}

function digitoVerificador(digitos: string, pesos: number[]) {
  const suma = [...digitos].reduce((s, d, i) => s + Number(d) * pesos[i], 0);
  return (10 - (suma % 10)) % 10;
}

/** Controla los dos dígitos verificadores de un CBU o CVU de 22 dígitos. */
export function cbuValido(cbu: string) {
  if (!/^\d{22}$/.test(cbu)) return false;
  const bloque1 = cbu.slice(0, 8);
  const bloque2 = cbu.slice(8);
  return (
    digitoVerificador(bloque1.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]) ===
      Number(bloque1[7]) &&
    digitoVerificador(
      bloque2.slice(0, 13),
      [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3],
    ) === Number(bloque2[13])
  );
}

export function aliasValido(alias: string) {
  return alias === "" || /^[a-zA-Z0-9.-]{6,20}$/.test(alias);
}

export function nombreCuentaBancaria(c: CuentaBancaria) {
  const tipo =
    c.clase === "billetera"
      ? ""
      : c.tipoCuenta === "ca"
        ? " · Caja de ahorro"
        : " · Cuenta corriente";
  const moneda = c.moneda === "USD" ? " en dólares" : "";
  const fin = c.numero ? ` ${c.numero}` : c.cbu ? ` …${c.cbu.slice(-4)}` : "";
  return `${c.entidad}${tipo}${moneda}${fin}`;
}

/** ¿Es esta la cuenta del resumen? (compara los dígitos del número). */
export function coincideNumero(c: CuentaBancaria, numeroResumen: string) {
  const a = c.numero.replace(/\D/g, "");
  const b = numeroResumen.replace(/\D/g, "");
  return (
    Boolean(a) && Boolean(b) && (a === b || a.endsWith(b) || b.endsWith(a))
  );
}
