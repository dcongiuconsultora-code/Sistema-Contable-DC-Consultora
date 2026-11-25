import {
  cuenta as datosCuenta,
  nombreCuenta,
  PLAN_MODELO,
} from "@/lib/plan/plan";
import type { Asiento } from "./diario";
import type { SaldosIniciales } from "./indicadores";

/** Un renglón del balance cerrado, con la cuenta del plan a la que va. */
export interface RenglonBalance {
  origen: string;
  concepto: string;
  importe: number;
  lado: "deudor" | "acreedor";
  cuenta: string | null;
}

export interface BalanceLeido {
  formato: "RT 54" | "Sumas y saldos";
  fechaCierre: string | null;
  empresa: string | null;
  renglones: RenglonBalance[];
  /** Totales que informa el propio balance, para controlar. */
  totalActivo: number | null;
  totalPasivoPN: number | null;
}

/** Hojas de un Excel: nombre → filas. */
export type Hojas = Record<string, unknown[][]>;

const IMPUTABLES = PLAN_MODELO.filter((c) => c.imputable);

function texto(v: unknown) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

function normal(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = texto(v).replace(/\$/g, "").trim();
  if (!t || !/\d/.test(t)) return null;
  const limpio = /,\d{1,2}$/.test(t)
    ? t.replace(/\./g, "").replace(",", ".")
    : t.replace(/,/g, "");
  const n = Number(limpio.replace(/^\((.*)\)$/, "-$1"));
  return Number.isFinite(n) ? n : null;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

/** "31/12/2025" en cualquier parte del texto → "2025-12-31". */
function fechaEn(t: string) {
  const m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

// Vinculación automática con el plan de cuentas -----------------------------------------------

const REGLAS: [RegExp, RegExp, string][] = [
  // [título de la nota, concepto, cuenta]
  [/caja|banco/, /efectivo|caja/, "1.1.01.001"],
  [/caja|banco/, /fondo fijo/, "1.1.01.003"],
  [/caja|banco/, /valores a depositar/, "1.1.01.004"],
  [/caja|banco/, /caja de ahorro/, "1.1.01.007"],
  [/caja|banco/, /banco|deposito|cuenta corriente/, "1.1.01.006"],
  [/caja|banco/, /billetera|mercado ?pago/, "1.1.01.009"],
  [/inversion/, /fondo|fci/, "1.1.02.003"],
  [/inversion/, /plazo/, "1.1.02.001"],
  [/cobrar|cliente|credito/, /cheque/, "1.1.03.003"],
  [/cobrar|cliente|credito/, /deudores por venta|clientes/, "1.1.03.001"],
  [/cobrar|cliente|credito/, /moroso/, "1.1.03.006"],
  [/cobrar|cliente|credito/, /accionista|socio/, "1.1.04.023"],
  [/cobrar|cliente|credito/, /prevision/, "1.1.03.009"],
  [/impositiv|fiscal|credito/, /ganancias/, "1.1.04.012"],
  [/impositiv|fiscal|credito/, /\biva\b|valor agregado/, "1.1.04.005"],
  [/impositiv|fiscal|credito/, /ingresos brutos|iibb/, "1.1.04.016"],
  [/cambio/, /reventa|mercaderia/, "1.1.05.001"],
  [/cambio/, /materia|materiales/, "1.1.05.002"],
  [/cambio/, /proceso/, "1.1.05.003"],
  [/cambio/, /terminad/, "1.1.05.004"],
  [/cambio/, /transito/, "1.1.05.006"],
  [/proveedor/, /cheque/, "2.1.01.003"],
  [/proveedor/, /documento/, "2.1.01.002"],
  [/proveedor/, /proveedor|reventa|otros/, "2.1.01.001"],
  [/prestamo|financier/, /adelanto|descubierto/, "2.1.02.001"],
  [/prestamo|financier/, /bancari|prestamo/, "2.1.02.002"],
  [/fiscal/, /\biva\b|valor agregado/, "2.1.04.002"],
  [/fiscal/, /ingresos brutos/, "2.1.04.007"],
  [/fiscal/, /moratoria|plan/, "2.1.04.013"],
  [/fiscal/, /ganancias/, "2.1.04.005"],
  [/fiscal/, /otra/, "2.1.04.015"],
  [/laboral|previsional/, /vacaciones/, "2.1.03.004"],
  [/laboral|previsional/, /sueldo anual|sac|aguinaldo/, "2.1.03.003"],
  [/laboral|previsional/, /remuneracion|sueldo/, "2.1.03.001"],
  [/laboral|previsional/, /cargas sociales/, "2.1.03.005"],
  [/especie/, /anticipo/, "2.1.05.001"],
  [/relacionad/, /particular|socio/, "2.1.07.002"],
];

const BIENES_USO: [RegExp, string, string][] = [
  [/terreno/, "1.2.05.001", ""],
  [/edificio|inmueble/, "1.2.05.002", "1.2.05.003"],
  [/instalacion/, "1.2.05.004", "1.2.05.005"],
  [/maquinaria|equipo/, "1.2.05.006", "1.2.05.007"],
  [/rodado|vehiculo/, "1.2.05.008", "1.2.05.009"],
  [/mueble/, "1.2.05.010", "1.2.05.011"],
  [/comput|informatic/, "1.2.05.012", "1.2.05.013"],
  [/herramienta|otros/, "1.2.05.014", "1.2.05.015"],
  [/mejora/, "1.2.05.016", "1.2.05.017"],
  [/obra/, "1.2.05.018", ""],
  [/anticipo/, "1.2.05.019", ""],
];

/** La cuenta del plan cuyo nombre más se parece al concepto. */
function porNombre(concepto: string): string | null {
  const c = normal(concepto);
  if (!c) return null;
  const exacta = IMPUTABLES.find((x) => normal(x.nombre) === c);
  if (exacta) return exacta.codigo;
  const palabras = c.split(" ").filter((p) => p.length > 3);
  if (!palabras.length) return null;
  let mejor: { codigo: string; puntos: number } | null = null;
  for (const x of IMPUTABLES) {
    const n = normal(x.nombre);
    const puntos =
      palabras.filter((p) => n.includes(p)).length / palabras.length;
    if (puntos > (mejor?.puntos ?? 0.6)) mejor = { codigo: x.codigo, puntos };
  }
  return mejor?.codigo ?? null;
}

export function sugerirCuenta(
  origen: string,
  concepto: string,
  /** En notas de pasivo solo se buscan cuentas del pasivo, y en las de activo, del activo. */
  rubro?: "activo" | "pasivo",
): string | null {
  const o = normal(origen);
  const c = normal(concepto);
  if (IMPUTABLES.some((x) => x.codigo === concepto.trim()))
    return concepto.trim();
  const permitida = (cuenta: string) =>
    !rubro || cuenta.startsWith(rubro === "activo" ? "1" : "2");
  for (const [ro, rc, cuenta] of REGLAS)
    if (permitida(cuenta) && ro.test(o) && rc.test(c)) return cuenta;
  const n = porNombre(concepto);
  return n && permitida(n) ? n : null;
}

// Formato RT 54 (el modelo de estados contables del estudio) -----------------------------------

const NOTAS_PATRIMONIALES =
  /caja|banco|inversion|cobrar|credito|cambio|proveedor|prestamo|deuda|fiscal|laboral|especie|relacionad|prevision/;
const NOTAS_PASIVO =
  /proveedor|prestamo|deuda|fiscal|laboral|especie|prevision/;

function notas(filas: unknown[][], renglones: RenglonBalance[]) {
  let titulo = "";
  let esPasivo = false;
  for (const f of filas) {
    const etiqueta = texto(f[0]);
    const enc = etiqueta.match(/^nota\s*\d+(?:\.\d+)?\s*-?\s*(.*)$/i);
    if (enc) {
      titulo =
        NOTAS_PATRIMONIALES.test(normal(enc[1])) &&
        !/ingreso|venta|gasto|costo|egreso/.test(normal(enc[1]))
          ? enc[1].trim()
          : "";
      esPasivo =
        NOTAS_PASIVO.test(normal(enc[1])) && !/credito/.test(normal(enc[1]));
      continue;
    }
    if (!titulo || !etiqueta) continue;
    const e = normal(etiqueta);
    if (
      /^(total|subtotal|cuenta contable|corriente|no corriente|menos)/.test(e)
    )
      continue;
    const valor = numero(f[1]);
    if (!valor) continue;
    const regularizadora = /prevision|amortizacion/.test(e) && !esPasivo;
    renglones.push({
      origen: `Nota: ${titulo}`,
      concepto: etiqueta,
      importe: Math.abs(valor),
      lado: esPasivo || regularizadora || valor < 0 ? "acreedor" : "deudor",
      cuenta: sugerirCuenta(titulo, etiqueta, esPasivo ? "pasivo" : "activo"),
    });
  }
}

/** Anexo de bienes de uso: valor de origen y amortización acumulada al cierre de cada rubro. */
function anexoBienes(filas: unknown[][], renglones: RenglonBalance[]) {
  // La fila de títulos tiene dos "Al cierre": valor de origen y amortización acumulada.
  const esCierre = (c: unknown) => /^al cierre$/i.test(texto(c));
  const iCab = filas.findIndex((f) => f.filter(esCierre).length >= 2);
  if (iCab < 0) return;
  const cols = filas[iCab]
    .map((c, i) => (esCierre(c) ? i : -1))
    .filter((i) => i >= 0);
  const [colOrigen, colAmort] = cols;
  for (const f of filas.slice(iCab + 1)) {
    const rubro = texto(f[0]);
    if (!rubro) continue;
    if (/^total/i.test(rubro)) break;
    const r = normal(rubro);
    const regla = BIENES_USO.find(([re]) => re.test(r));
    const origen = numero(f[colOrigen]);
    const amort = numero(f[colAmort]);
    if (origen)
      renglones.push({
        origen: "Anexo bienes de uso",
        concepto: rubro,
        importe: Math.abs(origen),
        lado: "deudor",
        cuenta: regla?.[1] ?? null,
      });
    if (amort)
      renglones.push({
        origen: "Anexo bienes de uso",
        concepto: `Amortización acumulada ${rubro.toLowerCase()}`,
        importe: Math.abs(amort),
        lado: "acreedor",
        cuenta: regla?.[2] || null,
      });
  }
}

/** Patrimonio neto: los saldos al cierre de cada columna de la evolución del PN. */
function patrimonio(filas: unknown[][], renglones: RenglonBalance[]) {
  const cierre = filas.find((f) => /saldos al cierre/i.test(texto(f[0])));
  if (!cierre) return;
  const cabeceras = filas.slice(0, filas.indexOf(cierre)).slice(-14);
  const nombreCol = (i: number) =>
    cabeceras
      .map((f) => texto(f[i]))
      .filter(Boolean)
      .join(" ");
  const columnas: [RegExp, string, string][] = [
    [/capital suscripto/i, "3.1.01.001", "Capital suscripto"],
    [
      /ajuste del capital|ajuste de capital$/i,
      "3.1.01.002",
      "Ajuste del capital",
    ],
    [/aportes irrevocables/i, "3.1.01.003", "Aportes irrevocables"],
    [/reserva legal/i, "3.2.01.001", "Reserva legal"],
    [/otras reservas/i, "3.2.01.003", "Otras reservas"],
    [/resultados no asignados/i, "3.2.02.001", "Resultados no asignados"],
  ];
  const usadas = new Set<number>();
  for (const [re, cuenta, nombre] of columnas) {
    for (let i = 1; i < cierre.length; i++) {
      if (usadas.has(i) || !re.test(nombreCol(i))) continue;
      usadas.add(i);
      const v = numero(cierre[i]);
      if (v)
        renglones.push({
          origen: "Evolución del patrimonio neto",
          concepto: nombre,
          importe: Math.abs(v),
          lado: v >= 0 ? "acreedor" : "deudor",
          cuenta,
        });
      break;
    }
  }
}

function totalDe(filas: unknown[][], re: RegExp) {
  for (const f of filas)
    for (let i = 0; i < f.length; i++)
      if (re.test(texto(f[i]))) {
        const v = f
          .slice(i + 1)
          .map(numero)
          .find((n) => n !== null);
        if (v != null) return redondear(v);
      }
  return null;
}

function leerRT54(hojas: Hojas): BalanceLeido | null {
  const nombre = (re: RegExp) => Object.keys(hojas).find((h) => re.test(h));
  const esp = nombre(/ESP/i);
  const hojaNotas = nombre(/^NOTAS/i);
  const eepn = nombre(/EEPN/i);
  if (!esp || !hojaNotas) return null;
  const renglones: RenglonBalance[] = [];
  notas(hojas[hojaNotas], renglones);
  const bu = nombre(/B\.?\s*Uso/i);
  if (bu) anexoBienes(hojas[bu], renglones);
  const intang = nombre(/A\s*Int/i);
  if (intang) anexoBienes(hojas[intang], renglones);
  if (eepn) patrimonio(hojas[eepn], renglones);
  const caratula = hojas[nombre(/^0-C/i) ?? esp] ?? [];
  const todos = [...caratula, ...hojas[esp]].flat().map(texto);
  const fechaCierre =
    todos
      .map((t) =>
        /estados contables al|finalizad/i.test(t) ? fechaEn(t) : null,
      )
      .find(Boolean) ?? null;
  const empresa =
    texto(
      caratula
        .flat()
        .find((c) => /S\.?A\.?S?\.?|S\.?R\.?L|S\.?A\b/i.test(texto(c))),
    ) || null;
  return {
    formato: "RT 54",
    fechaCierre,
    empresa,
    renglones,
    totalActivo: totalDe(hojas[esp], /^total del activo$/i),
    totalPasivoPN: totalDe(hojas[esp], /total del pasivo y patrimonio/i),
  };
}

// Excel de sumas y saldos (de otro sistema o de una planilla) --------------------------------

function leerSumasSaldos(hojas: Hojas): BalanceLeido | null {
  for (const filas of Object.values(hojas)) {
    const i = filas.findIndex((f) => {
      const t = f.map((c) => normal(texto(c)));
      return (
        t.some((x) => /^cuenta|descripcion|nombre/.test(x)) &&
        t.some((x) => /saldo|deudor|acreedor|debe|haber/.test(x))
      );
    });
    if (i < 0) continue;
    const t = filas[i].map((c) => normal(texto(c)));
    const col = (re: RegExp) => t.findIndex((x) => re.test(x));
    const cCodigo = col(/^cod/);
    const cCuenta = col(/^cuenta|descripcion|nombre/);
    const cDeudor = col(/saldo deudor|^deudor/);
    const cAcreedor = col(/saldo acreedor|^acreedor/);
    const cSaldo = col(/^saldo( final| al cierre)?$/);
    const cDebe = col(/^debe/);
    const cHaber = col(/^haber/);
    const renglones: RenglonBalance[] = [];
    for (const f of filas.slice(i + 1)) {
      const concepto = texto(f[cCuenta]);
      if (!concepto || /^total/i.test(concepto)) continue;
      let saldo: number | null = null;
      if (cDeudor >= 0 || cAcreedor >= 0)
        saldo = (numero(f[cDeudor]) ?? 0) - (numero(f[cAcreedor]) ?? 0);
      else if (cSaldo >= 0) saldo = numero(f[cSaldo]);
      else if (cDebe >= 0 && cHaber >= 0)
        saldo = (numero(f[cDebe]) ?? 0) - (numero(f[cHaber]) ?? 0);
      if (!saldo) continue;
      const codigo = cCodigo >= 0 ? texto(f[cCodigo]) : "";
      renglones.push({
        origen: "Sumas y saldos",
        concepto: codigo ? `${codigo} ${concepto}` : concepto,
        importe: Math.abs(redondear(saldo)),
        lado: saldo > 0 ? "deudor" : "acreedor",
        cuenta:
          (codigo && IMPUTABLES.some((x) => x.codigo === codigo)
            ? codigo
            : null) ?? sugerirCuenta("", concepto),
      });
    }
    if (!renglones.length) continue;
    const fechaCierre =
      filas.slice(0, i).flat().map(texto).map(fechaEn).find(Boolean) ?? null;
    return {
      formato: "Sumas y saldos",
      fechaCierre,
      empresa: null,
      renglones,
      totalActivo: null,
      totalPasivoPN: null,
    };
  }
  return null;
}

/**
 * Los balances en Excel suelen traer importes con muchos decimales: al redondear a centavos puede
 * quedar una diferencia mínima, que se ajusta en resultados no asignados (como se hace a mano).
 */
function ajustarRedondeo(b: BalanceLeido): BalanceLeido {
  const renglones = b.renglones.map((r) => ({
    ...r,
    importe: redondear(r.importe),
  }));
  const { diferencia } = totalesApertura(renglones);
  if (diferencia && Math.abs(diferencia) < 1) {
    const rna = renglones.find((r) => r.cuenta === "3.2.02.001");
    if (rna) {
      const deudor =
        (rna.lado === "deudor" ? rna.importe : -rna.importe) - diferencia;
      rna.importe = redondear(Math.abs(deudor));
      rna.lado = deudor >= 0 ? "deudor" : "acreedor";
    }
  }
  return { ...b, renglones };
}

/** Reconoce el balance (modelo RT 54 o sumas y saldos) y arma los renglones. */
export function leerBalanceCerrado(hojas: Hojas): BalanceLeido | null {
  const b = leerRT54(hojas) ?? leerSumasSaldos(hojas);
  return b && ajustarRedondeo(b);
}

// Saldos de inicio y asiento de apertura -----------------------------------------------------

export function totalesApertura(renglones: RenglonBalance[]) {
  const deudor = redondear(
    renglones
      .filter((r) => r.lado === "deudor")
      .reduce((s, r) => s + r.importe, 0),
  );
  const acreedor = redondear(
    renglones
      .filter((r) => r.lado === "acreedor")
      .reduce((s, r) => s + r.importe, 0),
  );
  return { deudor, acreedor, diferencia: redondear(deudor - acreedor) };
}

/** Saldos de inicio (en el lado natural de cada cuenta, como los carga el estudio a mano). */
export function saldosDeApertura(
  renglones: RenglonBalance[],
  fecha: string,
): SaldosIniciales {
  const deudores = new Map<string, number>();
  for (const r of renglones) {
    if (!r.cuenta) continue;
    const v = r.lado === "deudor" ? r.importe : -r.importe;
    deudores.set(r.cuenta, (deudores.get(r.cuenta) ?? 0) + v);
  }
  const saldos: Record<string, number> = {};
  for (const [codigo, deudor] of deudores) {
    const natural =
      datosCuenta(codigo).naturaleza === "Acreedora" ? -deudor : deudor;
    if (Math.abs(natural) >= 0.005) saldos[codigo] = redondear(natural);
  }
  return { fecha, saldos };
}

/** Asiento de apertura del ejercicio que sigue al cierre: deudoras al debe y acreedoras al haber. */
export function asientoApertura(iniciales: SaldosIniciales): Asiento | null {
  if (!iniciales.fecha || !Object.keys(iniciales.saldos).length) return null;
  const d = new Date(`${iniciales.fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const lineas = Object.entries(iniciales.saldos)
    .map(([codigo, importe]) => {
      const deudor =
        datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe;
      return {
        cuenta: codigo,
        nombre: nombreCuenta(codigo),
        debe: deudor > 0 ? redondear(deudor) : 0,
        haber: deudor < 0 ? redondear(-deudor) : 0,
      };
    })
    .filter((l) => l.debe || l.haber)
    .sort(
      (a, b) =>
        (a.debe ? 0 : 1) - (b.debe ? 0 : 1) || a.cuenta.localeCompare(b.cuenta),
    );
  return {
    fecha: d.toISOString().slice(0, 10),
    origen: "Apertura",
    descripcion: "Asiento de apertura (saldos del balance cerrado)",
    lineas,
  };
}
