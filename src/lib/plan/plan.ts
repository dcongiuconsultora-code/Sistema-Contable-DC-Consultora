import planModelo from "./plan-modelo.json";

export interface Cuenta {
  codigo: string;
  nombre: string;
  imputable: boolean;
  tipo: string;
  rubro: string;
}

/** Plan de cuentas modelo de la consultora (datos/plan-de-cuentas-modelo.csv). */
export const PLAN_MODELO: Cuenta[] = planModelo;

const POR_CODIGO = new Map(PLAN_MODELO.map((c) => [c.codigo, c]));

export function cuenta(codigo: string): Cuenta {
  const c = POR_CODIGO.get(codigo);
  if (!c) throw new Error(`La cuenta ${codigo} no está en el plan de cuentas.`);
  return c;
}

export function nombreCuenta(codigo: string) {
  return POR_CODIGO.get(codigo)?.nombre ?? codigo;
}
