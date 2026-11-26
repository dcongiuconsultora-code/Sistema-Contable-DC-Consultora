// Lee la Constancia de Inscripción de ARCA (y la constancia de CUIL de ANSES) para completar
// la ficha del cliente: domicilio fiscal, actividades, impuestos, inicio y cierre de ejercicio.
import type { Impuesto } from "@/lib/vencimientos/vencimientos";

export interface ActividadArca {
  codigo: string;
  descripcion: string;
  /** Mes de inicio (AAAA-MM). */
  inicio: string | null;
  principal: boolean;
}

export interface ImpuestoArca {
  nombre: string;
  /** Mes de alta (AAAA-MM). */
  alta: string | null;
}

export interface DatosArca {
  impuestos: ImpuestoArca[];
  actividades: ActividadArca[];
  /** Otros regímenes que informa la constancia (por ejemplo, Ganancias simplificada). */
  otros: string[];
  dni?: string;
  /** Fecha de la constancia o de su vigencia (AAAA-MM-DD). */
  fechaConstancia?: string;
}

export interface ConstanciaLeida {
  tipo: "inscripcion" | "cuil";
  cuit: string;
  nombre: string;
  condicionIva?: string;
  categoriaMonotributo?: string;
  mesCierre?: number;
  inicioActividades?: string;
  actividad?: string;
  domicilio?: {
    calle: string;
    localidad: string;
    provincia: string;
    codigoPostal: string;
  };
  /** Impuestos del calendario de vencimientos que corresponden según la constancia. */
  impuestosSistema: Impuesto[];
  datos: DatosArca;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");
const mesIso = (mm: string, aaaa: string) => `${aaaa}-${mm.padStart(2, "0")}`;
const fechaIso = (d: string) => {
  const [dd, mm, aa] = d.split(/[/-]/);
  return `${aa}-${mm}-${dd}`;
};
const titulo = (t: string) =>
  t
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(De|Del|La|Las|Los|Y|E|En|Para|Por|Con|Sin|A)\b/g, (m) =>
      m.toLowerCase(),
    )
    .replace(/^./, (c) => c.toUpperCase());

function impuestosDelSistema(impuestos: ImpuestoArca[]): Impuesto[] {
  const r = new Set<Impuesto>();
  for (const { nombre } of impuestos) {
    const n = nombre.toUpperCase();
    if (/MONOTRIBUTO|R[ÉE]GIMEN SIMPLIFICADO/.test(n)) r.add("monotributo");
    else if (/^IVA\b|VALOR AGREGADO/.test(n) && !/EXENTO/.test(n)) r.add("iva");
    else if (/GANANCIAS/.test(n) && /SOCIEDAD/.test(n)) r.add("gananciasPJ");
    else if (/GANANCIAS/.test(n) && /PERSONAS? (F[IÍ]SICAS|HUMANAS)/.test(n))
      r.add("gananciasPH");
    else if (/BIENES PERSONALES/.test(n)) r.add("bienesPersonales");
    else if (/SICORE|RETENCIONES|PERCEPCIONES/.test(n)) r.add("sicore");
  }
  return [...r];
}

function constanciaInscripcion(lineas: string[]): ConstanciaLeida | null {
  const todo = lineas.join("\n");
  if (!/CONSTANCIA DE INSCRIPCI[OÓ]N|CONSTANCIA DE OPCI[OÓ]N/i.test(todo))
    return null;
  const cab = todo.match(/^(.+?)\s+CUIT:\s*([\d-]{11,13})/m);
  if (!cab) return null;

  // Impuestos: entre el título y la línea de asteriscos (o las actividades).
  const i0 = lineas.findIndex((l) => /IMPUESTOS\/REG[IÍ]MENES/i.test(l));
  const fin = lineas.findIndex(
    (l, k) => k > i0 && (/^\*{5,}/.test(l) || /ACTIVIDADES/.test(l)),
  );
  const impuestos: ImpuestoArca[] = [];
  let categoriaMonotributo: string | undefined;
  if (i0 >= 0)
    for (const l of lineas.slice(i0 + 1, fin < 0 ? undefined : fin)) {
      const m = l.match(/^(.+?)\s+(\d{2})-(\d{4})\s*$/);
      const nombre = (m ? m[1] : l).trim();
      if (!nombre) continue;
      impuestos.push({ nombre, alta: m ? mesIso(m[2], m[3]) : null });
      if (/MONOTRIBUTO|R[ÉE]GIMEN SIMPLIFICADO/i.test(nombre)) {
        const c = nombre.match(/CATEGOR[IÍ]A\s*:?\s*([A-K])\b/i);
        if (c) categoriaMonotributo = c[1].toUpperCase();
      }
    }
  if (!categoriaMonotributo) {
    const c = todo.match(
      /(?:MONOTRIBUTO|R[ÉE]GIMEN SIMPLIFICADO)[^\n]*\n?[^\n]*?CATEGOR[IÍ]A\s*:?\s*([A-K])\b/i,
    );
    if (c) categoriaMonotributo = c[1].toUpperCase();
  }

  // Otros regímenes: renglones con código (por ejemplo "639-GANANCIAS SIMPLIFICADA ...").
  const hastaActividades = lineas.findIndex((l) =>
    /ACTIVIDADES NACIONALES/i.test(l),
  );
  const otros = lineas
    .slice(0, hastaActividades < 0 ? undefined : hastaActividades)
    .filter((l) => /^\d{2,4}-[A-ZÁÉÍÓÚ]/.test(l))
    .map((l) => l.trim());

  // Actividades: el renglón con código y "Mes de inicio"; el texto puede seguir en el renglón de abajo.
  const actividades: ActividadArca[] = [];
  const a0 = lineas.findIndex((l) => /ACTIVIDADES NACIONALES/i.test(l));
  const a1 = lineas.findIndex(
    (l, k) => k > a0 && /Mes de cierre|DOMICILIO FISCAL/i.test(l),
  );
  if (a0 >= 0)
    for (const l of lineas.slice(a0 + 1, a1 < 0 ? undefined : a1)) {
      const m = l.match(
        /(?:(Actividad principal|Secundaria\(s\))\s*:\s*)?(\d{6})\s*(?:\(F-\d+\))?\s*(.+?)(?:\s+Mes de inicio:\s*(\d{2})\/(\d{4}))?\s*$/,
      );
      if (m && /^\d{6}$/.test(m[2])) {
        actividades.push({
          codigo: m[2],
          descripcion: m[3].trim(),
          inicio: m[4] ? mesIso(m[4], m[5]) : null,
          principal: /principal/i.test(m[1] ?? "") || actividades.length === 0,
        });
      } else if (actividades.length && !/^\s*$/.test(l)) {
        const ult = actividades[actividades.length - 1];
        const inicio = l.match(/Mes de inicio:\s*(\d{2})\/(\d{4})/);
        ult.descripcion =
          `${ult.descripcion} ${l.replace(/\s*Mes de inicio:.*$/, "")}`.trim();
        if (inicio && !ult.inicio) ult.inicio = mesIso(inicio[1], inicio[2]);
      }
    }
  for (const a of actividades) a.descripcion = titulo(a.descripcion);

  const cierre = todo.match(/Mes de cierre ejercicio comercial:\s*(\d{1,2})/i);

  // Domicilio fiscal: hasta 3 renglones después del título.
  let domicilio: ConstanciaLeida["domicilio"];
  const d0 = lineas.findIndex((l) => /DOMICILIO FISCAL/i.test(l));
  if (d0 >= 0) {
    const renglones = lineas
      .slice(d0 + 1, d0 + 5)
      .filter((l) => !/^Vigencia|^Los datos|^\[|constancia/i.test(l));
    const cpProv = renglones.findIndex((l) => /^\d{4}\s*-\s*\S/.test(l));
    if (cpProv > 0) {
      const [cp, prov] = renglones[cpProv].split(/\s*-\s*/);
      const calle = renglones[0]
        .replace(/\s*-\s*NO DETERMINADO\s*/i, " - ")
        .replace(/\s*-\s*:\s*/, " · ")
        .replace(/\s*:\s*/, " · ")
        .replace(/\s+-\s*$/, "")
        .trim();
      domicilio = {
        calle: titulo(calle),
        localidad: cpProv > 1 ? titulo(renglones[cpProv - 1]) : "",
        provincia: titulo(prov ?? ""),
        codigoPostal: cp,
      };
    }
  }

  const vigencia = todo.match(
    /Vigencia de la presente constancia:\s*(\d{2}-\d{2}-\d{4})/i,
  );
  const nombres = impuestos.map((x) => x.nombre.toUpperCase());
  const condicionIva = nombres.some((n) =>
    /MONOTRIBUTO|R[ÉE]GIMEN SIMPLIFICADO/.test(n),
  )
    ? "Monotributo"
    : nombres.some((n) => /^IVA EXENTO|IVA\s*-\s*EXENTO/.test(n))
      ? "Exento"
      : nombres.some((n) => /^IVA\b/.test(n))
        ? "Responsable inscripto"
        : undefined;
  const principal = actividades.find((a) => a.principal);
  const inicios = actividades
    .map((a) => a.inicio)
    .filter((x): x is string => Boolean(x))
    .sort();
  return {
    tipo: "inscripcion",
    cuit: soloDigitos(cab[2]),
    nombre: cab[1].trim(),
    condicionIva,
    categoriaMonotributo,
    mesCierre: cierre ? Number(cierre[1]) : undefined,
    inicioActividades: inicios[0] ? `${inicios[0]}-01` : undefined,
    actividad: principal
      ? `${principal.descripcion} (${principal.codigo})`
      : undefined,
    domicilio,
    impuestosSistema: impuestosDelSistema(impuestos),
    datos: {
      impuestos,
      actividades,
      otros,
      fechaConstancia: vigencia ? fechaIso(vigencia[1]) : undefined,
    },
  };
}

function constanciaCuil(lineas: string[]): ConstanciaLeida | null {
  const todo = lineas.join("\n");
  if (!/Constancia de CUIL/i.test(todo)) return null;
  const cuit = todo.match(/CUIL\/CUIT\s*\n\s*([\d-]{11,13})/);
  const nombre = todo.match(/Titular\s*\n\s*(.+)/);
  const dni = todo.match(/Documento\s*\n\s*\w+\s+(\d{6,9})/);
  const emitida = todo.match(/Emitida el:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!cuit) return null;
  return {
    tipo: "cuil",
    cuit: soloDigitos(cuit[1]),
    nombre: nombre?.[1].trim() ?? "",
    impuestosSistema: [],
    datos: {
      impuestos: [],
      actividades: [],
      otros: [],
      dni: dni?.[1],
      fechaConstancia: emitida ? fechaIso(emitida[1]) : undefined,
    },
  };
}

export function leerConstancia(lineas: string[]): ConstanciaLeida | null {
  return constanciaInscripcion(lineas) ?? constanciaCuil(lineas);
}
