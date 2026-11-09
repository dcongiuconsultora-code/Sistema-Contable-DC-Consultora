import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import {
  indiceDelMes,
  type Indices,
  mesDe,
  sumarMeses,
} from "@/lib/inflacion/indices";
import { cuenta as datosCuenta } from "@/lib/plan/plan";

/**
 * Ajuste por inflación impositivo (Ley de Impuesto a las Ganancias, arts. 105 a 107), con la misma
 * estructura que la planilla del estudio: ajuste estático sobre el activo y pasivo impositivo al
 * inicio, y ajuste dinámico por los movimientos del ejercicio.
 */

export interface DefEstatico {
  clave: string;
  nombre: string;
  grupo: string;
  lado: "activo" | "pasivo";
  cuentas: string[];
  excluir?: string[];
  /** Por defecto (art. 106 inc. a): los bienes no computables quedan fuera. */
  computable: boolean;
}

const A = (
  grupo: string,
  clave: string,
  nombre: string,
  cuentas: string[],
  computable = true,
  excluir?: string[],
): DefEstatico => ({
  clave,
  nombre,
  grupo,
  lado: "activo",
  cuentas,
  computable,
  excluir,
});
const P = (
  grupo: string,
  clave: string,
  nombre: string,
  cuentas: string[],
  computable = true,
  excluir?: string[],
): DefEstatico => ({
  clave,
  nombre,
  grupo,
  lado: "pasivo",
  cuentas,
  computable,
  excluir,
});

export const ESTATICO: DefEstatico[] = [
  A("Disponibilidades", "efectivo", "Efectivo en moneda local", [
    "1.1.01.001",
    "1.1.01.003",
    "1.1.01.004",
    "1.1.01.005",
  ]),
  A("Disponibilidades", "efectivoME", "Efectivo en moneda extranjera", [
    "1.1.01.002",
  ]),
  A(
    "Disponibilidades",
    "bancos",
    "Cuentas bancarias y billeteras en moneda local",
    ["1.1.01.006", "1.1.01.007", "1.1.01.009"],
  ),
  A("Disponibilidades", "bancosME", "Cuentas bancarias en moneda extranjera", [
    "1.1.01.008",
  ]),
  A("Disponibilidades", "otrosRecursos", "Otros recursos", []),
  A(
    "Colocaciones e inversiones",
    "fci",
    "Fondos comunes de inversión (acciones, títulos)",
    ["1.1.02.003"],
    false,
  ),
  A("Colocaciones e inversiones", "plazoFijo", "Depósitos a plazo", [
    "1.1.02.001",
    "1.1.02.002",
    "1.1.02.007",
    "1.2.03.001",
  ]),
  A(
    "Colocaciones e inversiones",
    "acciones",
    "Acciones, cuotas y participaciones sociales",
    ["1.1.02.005", "1.2.04"],
    false,
  ),
  A(
    "Colocaciones e inversiones",
    "exterior",
    "Títulos y valores en el exterior",
    [],
    false,
  ),
  A(
    "Colocaciones e inversiones",
    "fciComputables",
    "Fondos comunes de inversión computables",
    [],
  ),
  A("Colocaciones e inversiones", "otrosInstrumentos", "Otros instrumentos", [
    "1.1.02.004",
    "1.1.02.006",
    "1.2.03.004",
  ]),
  A("Créditos y anticipos", "clientes", "Cuentas por cobrar comerciales", [
    "1.1.03",
    "1.2.01",
  ]),
  A(
    "Créditos y anticipos",
    "vinculados",
    "Deudores vinculados (titular, dueño, socios)",
    ["1.1.04.023", "1.1.04.024", "1.1.04.025", "1.2.02.003"],
    false,
  ),
  A("Créditos y anticipos", "senas", "Señas o anticipos que congelen precios", [
    "1.1.04.001",
  ]),
  A(
    "Créditos y anticipos",
    "fiscalesDeducibles",
    "Anticipos y retenciones fiscales deducibles",
    [
      "1.1.04.004",
      "1.1.04.005",
      "1.1.04.006",
      "1.1.04.007",
      "1.1.04.008",
      "1.1.04.013",
      "1.1.04.014",
      "1.1.04.015",
      "1.1.04.016",
      "1.1.04.017",
      "1.1.04.018",
      "1.2.02.004",
    ],
  ),
  A(
    "Créditos y anticipos",
    "fiscalesNoDeducibles",
    "Anticipos y retenciones de Ganancias",
    ["1.1.04.009", "1.1.04.010", "1.1.04.011", "1.1.04.012"],
  ),
  A(
    "Créditos y anticipos",
    "otrosCreditos",
    "Otros créditos",
    ["1.1.04", "1.1.06", "1.2.02"],
    true,
    [
      "1.1.04.001",
      "1.1.04.004",
      "1.1.04.005",
      "1.1.04.006",
      "1.1.04.007",
      "1.1.04.008",
      "1.1.04.009",
      "1.1.04.010",
      "1.1.04.011",
      "1.1.04.012",
      "1.1.04.013",
      "1.1.04.014",
      "1.1.04.015",
      "1.1.04.016",
      "1.1.04.017",
      "1.1.04.018",
      "1.1.04.023",
      "1.1.04.024",
      "1.1.04.025",
      "1.2.02.003",
      "1.2.02.004",
    ],
  ),
  A("Inventarios y existencias", "mercaderias", "Mercadería para venta", [
    "1.1.05.001",
    "1.1.05.004",
    "1.1.05.006",
  ]),
  A(
    "Inventarios y existencias",
    "materiasPrimas",
    "Materias primas y materiales en stock",
    ["1.1.05.002", "1.1.05.003", "1.1.05.005"],
  ),
  A("Inventarios y existencias", "otrosInventarios", "Otros inventarios", [
    "1.1.05.007",
  ]),
  A(
    "Activo fijo y bienes de uso",
    "maquinarias",
    "Maquinarias y equipos amortizables",
    ["1.2.05.006", "1.2.05.007", "1.2.05.014", "1.2.05.015"],
    false,
  ),
  A(
    "Activo fijo y bienes de uso",
    "muebles",
    "Muebles y útiles de uso",
    ["1.2.05.010", "1.2.05.011", "1.2.05.012", "1.2.05.013"],
    false,
  ),
  A(
    "Activo fijo y bienes de uso",
    "rodados",
    "Rodados y equipos de transporte",
    ["1.2.05.008", "1.2.05.009"],
    false,
  ),
  A(
    "Activo fijo y bienes de uso",
    "inmuebles",
    "Inmuebles",
    [
      "1.2.05.001",
      "1.2.05.002",
      "1.2.05.003",
      "1.2.05.016",
      "1.2.05.017",
      "1.2.03.002",
      "1.2.03.003",
    ],
    false,
  ),
  A(
    "Activo fijo y bienes de uso",
    "obras",
    "Obras en curso sobre inmuebles",
    ["1.2.05.018"],
    false,
  ),
  A(
    "Activo fijo y bienes de uso",
    "otrosUso",
    "Otros activos de uso",
    ["1.2.05.004", "1.2.05.005", "1.2.05.019"],
    false,
  ),
  A(
    "Activos intangibles",
    "software",
    "Software, licencias y propiedad intelectual",
    ["1.2.06.003", "1.2.06.004"],
    false,
  ),
  A(
    "Activos intangibles",
    "otrosIntangibles",
    "Otros bienes inmateriales",
    ["1.2.06", "1.2.07"],
    false,
    ["1.2.06.003", "1.2.06.004"],
  ),
  P("Obligaciones financieras y comerciales", "proveedores", "Proveedores", [
    "2.1.01",
    "2.2.01",
  ]),
  P(
    "Obligaciones financieras y comerciales",
    "bancarias",
    "Deudas bancarias y financieras",
    ["2.1.02", "2.2.02"],
    true,
    ["2.1.02.004", "2.2.02.003"],
  ),
  P(
    "Obligaciones financieras y comerciales",
    "titular",
    "Saldo acreedor de los socios",
    [
      "2.1.02.004",
      "2.1.07.001",
      "2.1.07.002",
      "2.1.07.003",
      "2.2.02.003",
      "2.2.04.001",
    ],
  ),
  P(
    "Obligaciones financieras y comerciales",
    "otrosCompromisos",
    "Otros compromisos corrientes",
    ["2.1.05", "2.1.06", "2.1.07.004", "2.1.07.005", "2.2.04.002"],
  ),
  P(
    "Compromisos laborales y de seguridad social",
    "remuneraciones",
    "Remuneraciones a pagar",
    ["2.1.03.001", "2.1.03.002", "2.1.03.010"],
  ),
  P(
    "Compromisos laborales y de seguridad social",
    "aportes",
    "Aportes retenidos a pagar",
    ["2.1.03.011"],
  ),
  P(
    "Compromisos laborales y de seguridad social",
    "contribuciones",
    "Contribuciones a pagar",
    ["2.1.03.005", "2.1.03.006", "2.1.03.007"],
  ),
  P(
    "Compromisos laborales y de seguridad social",
    "seguros",
    "Seguros laborales y coberturas",
    ["2.1.03.008", "2.1.03.009"],
  ),
  P(
    "Compromisos laborales y de seguridad social",
    "beneficios",
    "Beneficios extraordinarios y otros conceptos",
    ["2.1.03.003", "2.1.03.004"],
  ),
  P(
    "Obligaciones tributarias",
    "ventas",
    "Impuestos sobre ventas / Ingresos Brutos",
    ["2.1.04.001", "2.1.04.002", "2.1.04.007"],
  ),
  P(
    "Obligaciones tributarias",
    "retenciones",
    "Retenciones impositivas practicadas",
    ["2.1.04.003", "2.1.04.004", "2.1.04.006", "2.1.04.008", "2.1.04.009"],
  ),
  P("Obligaciones tributarias", "otrosGravamenes", "Otros gravámenes y tasas", [
    "2.1.04.005",
    "2.1.04.010",
    "2.1.04.011",
    "2.1.04.012",
    "2.1.04.013",
    "2.1.04.014",
    "2.1.04.015",
    "2.2.03.001",
    "2.2.03.002",
  ]),
  P(
    "Pasivos varios",
    "noAdmitidas",
    "Deudas no admitidas por la ley",
    ["2.2.03.003"],
    false,
  ),
  P(
    "Pasivos varios",
    "estimados",
    "Previsiones contables no admitidas",
    ["2.1.08", "2.2.05"],
    false,
  ),
];

export interface DefDinamico {
  clave: string;
  nombre: string;
  /** +1 suma al ajuste positivo (retiros, compras de bienes no computables); −1 al negativo (aportes). */
  signo: 1 | -1;
  /** Cuentas cuyo debe (o haber, si `lado` es "haber") del mes se toma solo. */
  cuentas: string[];
  excluir?: string[];
  lado: "debe" | "haber";
}

export const DINAMICO: DefDinamico[] = [
  {
    clave: "retiros",
    nombre: "Retiros de los socios y dividendos pagados",
    signo: 1,
    cuentas: ["1.1.04.023", "1.1.04.024", "2.1.06.001"],
    lado: "debe",
  },
  {
    clave: "compraAcciones",
    nombre: "Compra de acciones, cuotas, participaciones y FCI",
    signo: 1,
    cuentas: ["1.1.02.003", "1.1.02.005", "1.2.04"],
    lado: "debe",
  },
  {
    clave: "compraBienesUso",
    nombre: "Compra de bienes de uso",
    signo: 1,
    cuentas: ["1.2.05", "1.2.03.002"],
    excluir: [
      "1.2.05.003",
      "1.2.05.005",
      "1.2.05.007",
      "1.2.05.009",
      "1.2.05.011",
      "1.2.05.013",
      "1.2.05.015",
      "1.2.05.017",
    ],
    lado: "debe",
  },
  {
    clave: "compraNoAmortizables",
    nombre: "Compra de bienes muebles no amortizables",
    signo: 1,
    cuentas: [],
    lado: "debe",
  },
  {
    clave: "compraIntangibles",
    nombre: "Compra de bienes inmateriales",
    signo: 1,
    cuentas: ["1.2.06", "1.2.07.001"],
    excluir: ["1.2.06.002", "1.2.06.004", "1.2.06.006", "1.2.06.008"],
    lado: "debe",
  },
  {
    clave: "anticiposNoComputables",
    nombre: "Anticipos que congelen el precio de bienes no computables",
    signo: 1,
    cuentas: [],
    lado: "debe",
  },
  {
    clave: "exterior",
    nombre: "Fondos afectados a inversiones en el exterior",
    signo: 1,
    cuentas: [],
    lado: "debe",
  },
  {
    clave: "aportes",
    nombre: "Aportes y aumentos de capital",
    signo: -1,
    cuentas: ["3.1.01.001", "3.1.01.003", "3.1.01.004"],
    lado: "haber",
  },
  {
    clave: "inversionesExterior",
    nombre: "Inversiones en el exterior afectadas a renta argentina",
    signo: -1,
    cuentas: [],
    lado: "haber",
  },
  {
    clave: "costoEnajenacion",
    nombre: "Costo impositivo de bienes muebles no amortizables vendidos",
    signo: -1,
    cuentas: [],
    lado: "haber",
  },
];

/** Lo que el estudio corrige a mano sobre lo que trae el sistema. */
export interface CorreccionesAxi {
  importes?: Record<string, number>;
  computables?: Record<string, boolean>;
  dinamico?: Record<string, number[]>;
}

export interface RenglonEstatico extends DefEstatico {
  importe: number;
  automatico: number;
}

export interface RenglonDinamico extends DefDinamico {
  meses: number[];
  automaticos: number[];
  total: number;
}

export interface Axi {
  meses: string[];
  indiceInicio: { mes: string; valor: number };
  indiceCierre: { mes: string; valor: number; estimado: boolean };
  coeficiente: number;
  estatico: {
    renglones: RenglonEstatico[];
    activo: number;
    pasivo: number;
    activoComputable: number;
    pasivoComputable: number;
    capitalExpuesto: number;
    ajuste: number;
  };
  dinamico: {
    renglones: RenglonDinamico[];
    neto: number[];
    indices: number[];
    variaciones: number[];
    ajustes: number[];
    ajuste: number;
  };
  total: number;
  /** Variación del IPC en los 36 meses anteriores al cierre (la ley exige más del 100 %). */
  variacion36: number | null;
}

function redondear(n: number, decimales = 2) {
  const f = 10 ** decimales;
  const r = Math.round(n * f) / f;
  return r === 0 ? 0 : r;
}

function bajo(codigo: string, prefijos: string[]) {
  return prefijos.some((p) => codigo === p || codigo.startsWith(`${p}.`));
}

export function calcularAxi(p: {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  cierre: string;
  indices: Indices;
  correcciones?: CorreccionesAxi;
}): Axi {
  const c = p.correcciones ?? {};
  const mesInicio = mesDe(p.iniciales.fecha);
  const mesCierre = mesDe(p.cierre);
  const meses: string[] = [];
  for (
    let m = sumarMeses(mesInicio, 1);
    m <= mesCierre && meses.length < 12;
    m = sumarMeses(m, 1)
  )
    meses.push(m);

  const ii = indiceDelMes(p.indices, mesInicio);
  const ic = indiceDelMes(p.indices, mesCierre);
  const coeficiente = redondear(ic.valor / ii.valor - 1, 4);

  // Estático: activo y pasivo al inicio (saldos del cierre anterior).
  const saldos = Object.entries(p.iniciales.saldos).map(
    ([codigo, importe]) => ({
      codigo,
      deudor:
        datosCuenta(codigo).naturaleza === "Acreedora" ? -importe : importe,
    }),
  );
  const renglones: RenglonEstatico[] = ESTATICO.map((d) => {
    const signo = d.lado === "activo" ? 1 : -1;
    const automatico = redondear(
      saldos
        .filter(
          (s) => bajo(s.codigo, d.cuentas) && !bajo(s.codigo, d.excluir ?? []),
        )
        .reduce((t, s) => t + signo * s.deudor, 0),
    );
    return {
      ...d,
      automatico,
      importe: c.importes?.[d.clave] ?? automatico,
      computable: c.computables?.[d.clave] ?? d.computable,
    };
  });
  const suma = (lado: "activo" | "pasivo", soloComputables: boolean) =>
    redondear(
      renglones
        .filter((r) => r.lado === lado && (!soloComputables || r.computable))
        .reduce((t, r) => t + r.importe, 0),
    );
  const activoComputable = suma("activo", true);
  const pasivoComputable = suma("pasivo", true);
  const capitalExpuesto = redondear(activoComputable - pasivoComputable);

  // Dinámico: movimientos de cada mes del ejercicio.
  const dinamicos: RenglonDinamico[] = DINAMICO.map((d) => {
    const automaticos = meses.map(() => 0);
    for (const a of p.asientos) {
      if (a.origen === "Cierre") continue;
      const i = meses.indexOf(mesDe(a.fecha));
      if (i < 0 || a.fecha <= p.iniciales.fecha || a.fecha > p.cierre) continue;
      for (const l of a.lineas)
        if (bajo(l.cuenta, d.cuentas) && !bajo(l.cuenta, d.excluir ?? []))
          automaticos[i] += d.lado === "debe" ? l.debe : l.haber;
    }
    const corregidos = c.dinamico?.[d.clave];
    const valores = automaticos.map((v, i) => redondear(corregidos?.[i] ?? v));
    return {
      ...d,
      automaticos: automaticos.map((v) => redondear(v)),
      meses: valores,
      total: redondear(valores.reduce((t, v) => t + v, 0)),
    };
  });
  const neto = meses.map((_, i) =>
    redondear(dinamicos.reduce((t, d) => t + d.signo * d.meses[i], 0)),
  );
  const indicesMes = meses.map((m) => indiceDelMes(p.indices, m).valor);
  const variaciones = indicesMes.map((v) => redondear(ic.valor / v - 1, 4));
  const ajustes = neto.map((n, i) => redondear(n * variaciones[i]));
  const ajusteDinamico = redondear(ajustes.reduce((t, v) => t + v, 0));
  const ajusteEstatico = redondear(-capitalExpuesto * coeficiente);

  const mes36 = sumarMeses(mesCierre, -36);
  const variacion36 = p.indices[mes36]
    ? redondear(ic.valor / p.indices[mes36] - 1, 4)
    : null;

  return {
    meses,
    indiceInicio: { mes: ii.mes, valor: ii.valor },
    indiceCierre: ic,
    coeficiente,
    estatico: {
      renglones,
      activo: suma("activo", false),
      pasivo: suma("pasivo", false),
      activoComputable,
      pasivoComputable,
      capitalExpuesto,
      ajuste: ajusteEstatico,
    },
    dinamico: {
      renglones: dinamicos,
      neto,
      indices: indicesMes,
      variaciones,
      ajustes,
      ajuste: ajusteDinamico,
    },
    total: redondear(ajusteEstatico + ajusteDinamico),
    variacion36,
  };
}
