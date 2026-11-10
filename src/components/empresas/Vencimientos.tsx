"use client";

import { useMemo, useState } from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import {
  IMPUESTOS,
  type Impuesto,
  type PlanPago,
  impuestosDe,
  vencimientos,
} from "@/lib/vencimientos/vencimientos";

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fechaLinda(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const PLAZOS = [
  [15, "15 días"],
  [30, "30 días"],
  [60, "60 días"],
] as const;

/** Próximos vencimientos de todas las empresas, para el estudio. */
export function ProximosVencimientos({
  empresas,
  planes = {},
}: {
  empresas: Empresa[];
  planes?: Record<string, PlanPago[]>;
}) {
  const [dias, setDias] = useState<number>(30);
  const hoy = hoyIso();
  const { lista, faltanAnios } = useMemo(
    () => vencimientos(empresas, hoy, sumarDias(hoy, dias), planes),
    [empresas, hoy, dias, planes],
  );
  const porFecha = new Map<string, typeof lista>();
  for (const v of lista)
    porFecha.set(v.fecha, [...(porFecha.get(v.fecha) ?? []), v]);
  const semana = sumarDias(hoy, 7);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Próximos vencimientos</h2>
        <div className="flex gap-1 text-sm">
          {PLAZOS.map(([n, texto]) => (
            <button
              key={n}
              type="button"
              onClick={() => setDias(n)}
              className={`rounded-md px-2.5 py-1 ${dias === n ? "bg-marca-claro font-medium text-marca" : "text-stone-600 hover:bg-stone-100"}`}
            >
              {texto}
            </button>
          ))}
        </div>
      </div>
      {empresas.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          Cuando cargues empresas, acá vas a ver sus vencimientos.
        </p>
      ) : lista.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          No hay vencimientos en los próximos {dias} días.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-stone-100">
          {[...porFecha.entries()].map(([fecha, items]) => (
            <li
              key={fecha}
              className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-3"
            >
              <span
                className={`text-sm font-semibold capitalize ${fecha === hoy ? "text-red-700" : fecha <= semana ? "text-amber-700" : "text-stone-700"}`}
              >
                {fecha === hoy ? "Hoy" : fechaLinda(fecha)}
              </span>
              <ul className="space-y-0.5 text-sm">
                {items.map((v) => (
                  <li key={`${v.empresaId}-${v.impuesto}-${v.detalle}`}>
                    <span className="font-medium">{v.empresa}</span>
                    <span className="text-stone-500">
                      {" "}
                      · {IMPUESTOS[v.impuesto]}: {v.detalle}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      {faltanAnios.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          Falta el calendario de {faltanAnios.join(", ")}: cuando salga,
          pasámelo y lo cargo.
        </p>
      )}
      <p className="mt-2 text-xs text-stone-500">
        Calendario 2026 de la Comisión Federal de Impuestos, por terminación de
        CUIT. Los impuestos de cada empresa se eligen en su tarjeta, en
        “Impuestos”.
      </p>
    </section>
  );
}

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** Qué impuestos tiene la empresa y cuándo cierra su ejercicio. */
export function ImpuestosEmpresa({
  repo,
  empresa,
  onCambio,
}: {
  repo: Repositorio;
  empresa: Empresa;
  onCambio: (e: Empresa) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const elegidos = impuestosDe(empresa);

  async function guardar(cambios: Partial<Empresa>) {
    setError(null);
    const nueva = { ...empresa, ...cambios };
    onCambio(nueva);
    try {
      await repo.actualizarEmpresa(empresa.id, {
        mes_cierre: nueva.mes_cierre ?? 12,
        impuestos: nueva.impuestos ?? null,
      });
    } catch (e) {
      onCambio(empresa);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-3 space-y-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-stone-600">Cierre del ejercicio:</span>
        <select
          id={`mes-cierre-${empresa.id}`}
          value={empresa.mes_cierre ?? 12}
          onChange={(e) => guardar({ mes_cierre: Number(e.target.value) })}
          className="rounded-md border border-stone-300 bg-white px-2 py-1"
        >
          {MESES.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-stone-600">
          Impuestos que vencen
          {!empresa.impuestos && (
            <span className="text-stone-400">
              {" "}
              (por ahora, los de su condición frente al IVA)
            </span>
          )}
        </legend>
        <div className="mt-1 grid gap-1 sm:grid-cols-2">
          {(Object.keys(IMPUESTOS) as Impuesto[]).map((i) => (
            <label key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={elegidos.includes(i)}
                onChange={(e) =>
                  guardar({
                    impuestos: e.target.checked
                      ? [...elegidos, i]
                      : elegidos.filter((x) => x !== i),
                  })
                }
              />
              {IMPUESTOS[i]}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
