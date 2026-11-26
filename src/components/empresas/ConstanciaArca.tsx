"use client";

import { useState } from "react";
import type { ConstanciaLeida, DatosArca } from "@/lib/arca/constancia";
import type { Empresa, FichaEmpresa } from "@/lib/datos/repositorio";
import { cuitConGuiones, fechaCorta } from "@/lib/formato";
import { IMPUESTOS, type Impuesto } from "@/lib/vencimientos/vencimientos";

export interface ExtrasArca {
  mes_cierre?: number;
  impuestos?: Impuesto[];
  categoria_monotributo?: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

interface Cambio {
  clave: string;
  etiqueta: string;
  ahora: string;
  nuevo: string;
  aplicar: (f: Partial<FichaEmpresa>, x: ExtrasArca) => void;
}

/**
 * Sube la constancia de inscripción de ARCA (o la de CUIL), muestra lo que cambiaría en la ficha
 * y lo aplica con lo que el estudio deje marcado.
 */
export function ConstanciaArca({
  empresa,
  ficha,
  onAplicar,
}: {
  empresa: Empresa;
  ficha: FichaEmpresa;
  onAplicar: (cambios: Partial<FichaEmpresa>, extras: ExtrasArca) => void;
}) {
  const [leida, setLeida] = useState<ConstanciaLeida | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [listo, setListo] = useState<string | null>(null);

  const cambios: Cambio[] = [];
  if (leida) {
    const agregar = (
      clave: string,
      etiqueta: string,
      ahora: string | null | undefined,
      nuevo: string | null | undefined,
      aplicar: Cambio["aplicar"],
    ) => {
      if (
        !nuevo ||
        (ahora ?? "").trim().toLowerCase() === nuevo.trim().toLowerCase()
      )
        return;
      cambios.push({ clave, etiqueta, ahora: ahora || "—", nuevo, aplicar });
    };
    agregar(
      "razon",
      "Razón social / nombre",
      ficha.razon_social,
      leida.nombre,
      (f) => {
        f.razon_social = leida.nombre;
      },
    );
    agregar(
      "condicion",
      "Condición frente al IVA",
      ficha.condicion_iva,
      leida.condicionIva,
      (f) => {
        f.condicion_iva = leida.condicionIva;
      },
    );
    agregar(
      "actividad",
      "Actividad principal",
      ficha.actividad,
      leida.actividad,
      (f) => {
        f.actividad = leida.actividad;
      },
    );
    agregar(
      "inicio",
      "Inicio de actividades",
      ficha.inicio_actividades ? fechaCorta(ficha.inicio_actividades) : "",
      leida.inicioActividades ? fechaCorta(leida.inicioActividades) : "",
      (f) => {
        f.inicio_actividades = leida.inicioActividades ?? null;
      },
    );
    const d = leida.domicilio;
    if (d) {
      agregar(
        "domicilio",
        "Domicilio fiscal",
        ficha.domicilio,
        d.calle,
        (f) => {
          f.domicilio = d.calle;
        },
      );
      agregar("localidad", "Localidad", ficha.localidad, d.localidad, (f) => {
        f.localidad = d.localidad;
      });
      agregar("provincia", "Provincia", ficha.provincia, d.provincia, (f) => {
        f.provincia = d.provincia;
      });
      agregar(
        "cp",
        "Código postal",
        ficha.codigo_postal,
        d.codigoPostal,
        (f) => {
          f.codigo_postal = d.codigoPostal;
        },
      );
    }
    if (leida.mesCierre)
      agregar(
        "cierre",
        "Cierre del ejercicio",
        empresa.mes_cierre ? MESES[empresa.mes_cierre - 1] : "",
        MESES[leida.mesCierre - 1],
        (_, x) => {
          x.mes_cierre = leida.mesCierre;
        },
      );
    if (leida.impuestosSistema.length) {
      const actuales = [...(empresa.impuestos ?? [])].sort().join(",");
      const nuevos = [...leida.impuestosSistema].sort();
      if (actuales !== nuevos.join(","))
        cambios.push({
          clave: "impuestos",
          etiqueta: "Impuestos (para los vencimientos)",
          ahora: empresa.impuestos?.length
            ? empresa.impuestos
                .map((i) => IMPUESTOS[i as Impuesto] ?? i)
                .join(", ")
            : "los de su condición",
          nuevo: nuevos.map((i) => IMPUESTOS[i]).join(", "),
          aplicar: (_, x) => {
            x.impuestos = nuevos;
          },
        });
    }
    agregar(
      "categoria",
      "Categoría de monotributo",
      empresa.categoria_monotributo ?? "",
      leida.categoriaMonotributo,
      (_, x) => {
        x.categoria_monotributo = leida.categoriaMonotributo;
      },
    );
  }

  async function leer(archivo: File) {
    setError(null);
    setListo(null);
    setLeyendo(true);
    try {
      const { leerPdf } = await import("@/lib/pdf/abrir");
      const { leerConstancia } = await import("@/lib/arca/constancia");
      const c = leerConstancia((await leerPdf(archivo)).map((l) => l.texto));
      if (!c)
        throw new Error(
          "No reconocí el PDF. Tiene que ser la Constancia de Inscripción de ARCA (o la constancia de CUIL).",
        );
      if (ficha.cuit && c.cuit !== ficha.cuit)
        throw new Error(
          `La constancia es de otro CUIT (${cuitConGuiones(c.cuit)} · ${c.nombre}), no de este cliente.`,
        );
      setLeida(c);
      // Por defecto se marca todo lo que cambia, salvo el nombre si ya había uno cargado.
      setMarcados(
        new Set([
          "condicion",
          "actividad",
          "inicio",
          "domicilio",
          "localidad",
          "provincia",
          "cp",
          "cierre",
          "impuestos",
          "categoria",
          ...(ficha.razon_social ? [] : ["razon"]),
        ]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  }

  function aplicar() {
    if (!leida) return;
    const f: Partial<FichaEmpresa> = {};
    const x: ExtrasArca = {};
    for (const c of cambios) if (marcados.has(c.clave)) c.aplicar(f, x);
    const previos = ficha.datos_arca ?? null;
    const datos: DatosArca =
      leida.tipo === "cuil" && previos
        ? { ...previos, dni: leida.datos.dni ?? previos.dni }
        : { ...leida.datos, dni: leida.datos.dni ?? previos?.dni };
    f.datos_arca = datos;
    onAplicar(f, x);
    setLeida(null);
    setListo(
      "Listo: los datos quedaron en la ficha. Revisalos y tocá “Guardar ficha” para guardarlos.",
    );
  }

  return (
    <div className="rounded-2xl border border-marca/20 bg-marca-claro/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-stone-900">
            📄 Completar con la constancia de ARCA
          </div>
          <p className="text-xs text-stone-600">
            Subí la Constancia de Inscripción (PDF) y se completan solos el
            domicilio fiscal, las actividades, el inicio, el cierre y los
            impuestos. También sirve la constancia de CUIL (para el DNI).
          </p>
        </div>
        <label className="cursor-pointer rounded-xl bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {leyendo ? "Leyendo…" : "Subir constancia (PDF)"}
          <input
            id={`constancia-${empresa.id}`}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) leer(f);
            }}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {listo && <p className="mt-2 text-sm text-emerald-800">✓ {listo}</p>}
      {leida && (
        <div className="mt-3 rounded-xl bg-white p-3">
          <p className="mb-2 text-xs text-stone-500">
            {leida.tipo === "cuil"
              ? "Constancia de CUIL"
              : "Constancia de inscripción"}{" "}
            de <b>{leida.nombre}</b> · CUIT {cuitConGuiones(leida.cuit)}
            {leida.datos.fechaConstancia &&
              ` · del ${fechaCorta(leida.datos.fechaConstancia)}`}
          </p>
          {cambios.length === 0 ? (
            <p className="text-sm text-stone-600">
              La ficha ya tiene estos datos. Igual se guarda el detalle de ARCA
              (actividades, impuestos{leida.datos.dni ? ", DNI" : ""}).
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-8 py-1" />
                  <th className="py-1 pr-3">Dato</th>
                  <th className="py-1 pr-3">Ahora</th>
                  <th className="py-1">Según ARCA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {cambios.map((c) => (
                  <tr key={c.clave}>
                    <td className="py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Usar ${c.etiqueta}`}
                        checked={marcados.has(c.clave)}
                        onChange={(e) => {
                          const n = new Set(marcados);
                          if (e.target.checked) n.add(c.clave);
                          else n.delete(c.clave);
                          setMarcados(n);
                        }}
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-stone-600">{c.etiqueta}</td>
                    <td className="py-1.5 pr-3 text-stone-400">{c.ahora}</td>
                    <td className="py-1.5 font-medium">{c.nuevo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={aplicar}
              className="rounded-xl bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Usar estos datos
            </button>
            <button
              type="button"
              onClick={() => setLeida(null)}
              className="rounded-xl px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lo que informa ARCA, guardado en la ficha (solo lectura). */
export function DatosDeArca({ datos }: { datos: DatosArca }) {
  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Según ARCA
        </h4>
        <span className="text-xs text-stone-400">
          {datos.fechaConstancia &&
            `Constancia del ${fechaCorta(datos.fechaConstancia)}`}
          {datos.dni && ` · DNI ${datos.dni}`}
        </span>
      </div>
      {datos.actividades.length > 0 && (
        <div>
          <div className="mb-1 font-medium">Actividades</div>
          <ul className="space-y-1">
            {datos.actividades.map((a) => (
              <li key={a.codigo} className="flex gap-2">
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-xs">
                  {a.codigo}
                </span>
                <span className="flex-1">
                  {a.descripcion}
                  {a.principal && (
                    <span className="ml-1 rounded-full bg-marca-claro px-2 text-xs text-marca">
                      principal
                    </span>
                  )}
                </span>
                {a.inicio && (
                  <span className="shrink-0 text-xs text-stone-500">
                    desde {a.inicio.slice(5)}/{a.inicio.slice(0, 4)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {datos.impuestos.length > 0 && (
        <div>
          <div className="mb-1 font-medium">Impuestos y regímenes</div>
          <ul className="flex flex-wrap gap-1.5">
            {datos.impuestos.map((i) => (
              <li
                key={i.nombre}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-700"
              >
                {i.nombre}
                {i.alta && (
                  <span className="text-stone-400">
                    {" "}
                    · alta {i.alta.slice(5)}/{i.alta.slice(0, 4)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {datos.otros.length > 0 && (
        <ul className="text-xs text-stone-600">
          {datos.otros.map((o) => (
            <li key={o}>• {o}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
