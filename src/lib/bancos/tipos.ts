export interface MovimientoBancario {
  fecha: string; // AAAA-MM-DD
  descripcion: string;
  referencia: string;
  /** Positivo = crédito (entra plata); negativo = débito (sale plata). */
  importe: number;
  /** Saldo informado por el banco después del movimiento, si lo trae. */
  saldo: number | null;
  pagina: number;
}

export interface CuentaBancaria {
  banco: string;
  tipo: string;
  numero: string;
  moneda: "ARS" | "USD";
  saldoInicial: number | null;
  saldoFinal: number | null;
  movimientos: MovimientoBancario[];
  /** Impuesto a los débitos y créditos que el banco informa como cobrado en el período. */
  impuestoDebitosCreditos: number | null;
}

export interface ResumenBancario {
  banco: string;
  titular: string;
  cuit: string;
  desde: string | null;
  hasta: string | null;
  cuentas: CuentaBancaria[];
  /** Diferencias entre saldos y movimientos: si hay alguna, el resumen no se leyó completo. */
  controles: string[];
}
