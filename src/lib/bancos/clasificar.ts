import type { MovimientoBancario } from "./tipos";

export interface Clasificacion {
  concepto: string;
  /** Cuenta del plan modelo que va contra el banco. null = la tiene que elegir el estudio. */
  cuenta: string | null;
  nombreCuenta: string | null;
  /** true si la regla es segura; false si conviene que el estudio lo mire. */
  automatica: boolean;
  jurisdiccion?: string;
  cuitContraparte?: string;
  nota?: string;
}

interface Regla {
  patron: RegExp;
  /** Si se indica, la regla solo aplica a débitos (-1) o a créditos (1). */
  signo?: 1 | -1;
  concepto: string | ((m: RegExpMatchArray) => string);
  cuenta: string | null;
  nombreCuenta: string | null;
  automatica: boolean;
  jurisdiccion?: (m: RegExpMatchArray) => string;
  nota?: string;
}

function titulo(texto: string) {
  return texto.toLowerCase().replace(/(^|\s)\S/g, (l) => l.toUpperCase());
}

// Las cuentas son las del plan modelo de la consultora (datos/plan-de-cuentas-modelo.csv).
// El orden importa: gana la primera regla que coincide.
const REGLAS: Regla[] = [
  { patron: /SIRCREB/i, concepto: "Retención IIBB SIRCREB", cuenta: "1.1.04.014", nombreCuenta: "Ingresos brutos - retenciones sufridas (incl. SIRCREB)", automatica: true },
  {
    patron: /RET\.?\s+(?:IIBB|ING\.?\s*BRUTOS)\s+([A-ZÁÉÍÓÚÑ ]+?)\s+SUC/i,
    concepto: (m) => `Retención IIBB ${titulo(m[1])}`,
    jurisdiccion: (m) => titulo(m[1]),
    cuenta: "1.1.04.014", nombreCuenta: "Ingresos brutos - retenciones sufridas (incl. SIRCREB)", automatica: true,
  },
  {
    patron: /25413|IMP\.?\s*S\/?\s*(DEB|CRED)|LEY 25\.?413/i,
    concepto: "Impuesto a los débitos y créditos", cuenta: "1.1.04.017", nombreCuenta: "Impuesto s/débitos y créditos bancarios a computar", automatica: true,
    nota: "Solo una parte es computable contra Ganancias; el resto se pasa a gasto al cierre.",
  },
  { patron: /DEBITO FISCAL IVA/i, concepto: "IVA de gastos bancarios", cuenta: "1.1.04.004", nombreCuenta: "IVA crédito fiscal", automatica: true },
  { patron: /PERCEP(CION)?.*IVA|IVA.*PERCEP/i, concepto: "Percepción de IVA bancaria", cuenta: "1.1.04.008", nombreCuenta: "IVA percepciones sufridas", automatica: true },
  { patron: /COMISION|MANT(\.|ENIMIENTO)|CARGO|GASTOS? BANC/i, signo: -1, concepto: "Gastos bancarios", cuenta: "5.3.01.024", nombreCuenta: "Gastos bancarios", automatica: true },
  { patron: /Liq\.?\s*Susc/i, concepto: "Suscripción de fondo común de inversión", cuenta: "1.1.02.003", nombreCuenta: "Fondos comunes de inversión", automatica: true },
  { patron: /(Sol|Liq)\.?\s*Resc/i, concepto: "Rescate de fondo común de inversión", cuenta: "1.1.02.003", nombreCuenta: "Fondos comunes de inversión", automatica: true, nota: "Si el rescate incluye rendimiento, separarlo a Rendimiento de inversiones." },
  { patron: /MISMO TIT/i, concepto: "Transferencia entre cuentas propias", cuenta: "1.1.01.006", nombreCuenta: "Banco cuenta corriente en pesos", automatica: true },
  { patron: /PRESTAMO/i, signo: -1, concepto: "Cuota de préstamo", cuenta: "2.1.02.002", nombreCuenta: "Préstamos bancarios", automatica: false, nota: "Separar capital e intereses con el cronograma del préstamo." },
  { patron: /DB TARJETA DE CREDITO/i, signo: -1, concepto: "Pago de tarjeta de crédito", cuenta: "2.1.01.004", nombreCuenta: "Tarjetas de crédito a pagar", automatica: true },
  { patron: /ELECTRON|VISA|MASTER|CABAL|PRISMA|FISERV|PAYWAY|POSNET/i, signo: 1, concepto: "Acreditación de tarjetas", cuenta: "1.1.03.004", nombreCuenta: "Tarjetas de crédito a cobrar", automatica: true },
  { patron: /CHEQUE|CHQ/i, signo: -1, concepto: "Pago de cheque emitido", cuenta: "2.1.01.003", nombreCuenta: "Cheques diferidos emitidos (valores diferidos a pagar)", automatica: true },
  { patron: /CCERR|CIRC\.?\s*CERR/i, signo: 1, concepto: "Depósito de cheque", cuenta: "1.1.03.001", nombreCuenta: "Deudores por ventas", automatica: false, nota: "Identificar de qué cliente es el cheque." },
  { patron: /\bAFIP\b|\bARCA\b/i, signo: -1, concepto: "Pago a ARCA", cuenta: null, nombreCuenta: null, automatica: false, nota: "Indicar qué impuesto se pagó (VEP)." },
  { patron: /AUTONOMOS|SUSS/i, signo: -1, concepto: "Pago de aportes", cuenta: "1.1.04.024", nombreCuenta: "Cuenta particular socios", automatica: false, nota: "Aportes de los socios: confirmar si los paga la sociedad." },
  { patron: /TEF DATANET|TRANSF|TRF|CREDIN/i, signo: 1, concepto: "Cobro por transferencia", cuenta: "1.1.03.001", nombreCuenta: "Deudores por ventas", automatica: true },
  { patron: /TEF DATANET|TRANSF|TRF/i, signo: -1, concepto: "Pago por transferencia", cuenta: "2.1.01.001", nombreCuenta: "Proveedores", automatica: false, nota: "Confirmar a qué proveedor corresponde." },
];

const CUIT = /\b((?:20|23|24|27|30|33|34)\d{9})\b/;

export function clasificarMovimiento(m: MovimientoBancario): Clasificacion {
  const signo = m.importe < 0 ? -1 : 1;
  const cuit = m.descripcion.match(CUIT)?.[1];
  for (const r of REGLAS) {
    if (r.signo && r.signo !== signo) continue;
    const coincidencia = m.descripcion.match(r.patron);
    if (!coincidencia) continue;
    return {
      concepto: typeof r.concepto === "function" ? r.concepto(coincidencia) : r.concepto,
      cuenta: r.cuenta,
      nombreCuenta: r.nombreCuenta,
      automatica: r.automatica,
      jurisdiccion: r.jurisdiccion?.(coincidencia),
      cuitContraparte: cuit,
      nota: r.nota,
    };
  }
  if (signo < 0) {
    return {
      concepto: "Compra con tarjeta de débito",
      cuenta: "2.1.01.001",
      nombreCuenta: "Proveedores",
      automatica: false,
      cuitContraparte: cuit,
      nota: "Confirmar a qué proveedor o gasto corresponde.",
    };
  }
  return { concepto: "Crédito sin identificar", cuenta: null, nombreCuenta: null, automatica: false, cuitContraparte: cuit };
}

export interface GrupoClasificado {
  concepto: string;
  cuenta: string | null;
  nombreCuenta: string | null;
  automatica: boolean;
  cantidad: number;
  debitos: number;
  creditos: number;
}

/** Resumen por concepto, de mayor a menor importe. */
export function agruparPorConcepto(movimientos: MovimientoBancario[]): GrupoClasificado[] {
  const grupos = new Map<string, GrupoClasificado>();
  for (const m of movimientos) {
    const c = clasificarMovimiento(m);
    const g = grupos.get(c.concepto) ?? {
      concepto: c.concepto, cuenta: c.cuenta, nombreCuenta: c.nombreCuenta, automatica: c.automatica, cantidad: 0, debitos: 0, creditos: 0,
    };
    g.cantidad++;
    if (m.importe < 0) g.debitos = Math.round((g.debitos - m.importe) * 100) / 100;
    else g.creditos = Math.round((g.creditos + m.importe) * 100) / 100;
    grupos.set(c.concepto, g);
  }
  return [...grupos.values()].sort((a, b) => b.debitos + b.creditos - (a.debitos + a.creditos));
}
