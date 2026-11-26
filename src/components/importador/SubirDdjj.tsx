"use client";

import { useState } from "react";
import type { DdjjGanancias, DdjjLeida } from "@/lib/ddjj/leer-ddjj";
import { fechaCorta, nombrePeriodo, pesos } from "@/lib/formato";

interface Resultado {
  archivo: string;
  ok: boolean;
  texto: string;
}

/**
 * Subir las DDJJ presentadas (PDF): se reconoce cuál es y se carga sola en el mes o el
 * ejercicio que corresponde. Controla que el CUIT sea el de la empresa.
 */
export function SubirDdjj({
  cuitEmpresa,
  onLeida,
  ganancias,
  onBorrarGanancias,
}: {
  cuitEmpresa: string;
  /** Aplica la DDJJ leída; devuelve el texto de lo que se hizo. */
  onLeida: (d: DdjjLeida, archivo: string) => Promise<string>;
  ganancias: Record<string, DdjjGanancias>;
  onBorrarGanancias?: (cierre: string) => void;
}) {
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  async function subir(archivos: File[]) {
    setLeyendo(true);
    const nuevos: Resultado[] = [];
    const { leerPdf } = await import("@/lib/pdf/abrir");
    const { leerDdjj } = await import("@/lib/ddjj/leer-ddjj");
    for (const a of archivos) {
      try {
        const d = leerDdjj((await leerPdf(a)).map((l) => l.texto));
        if (!d) {
          nuevos.push({
            archivo: a.name,
            ok: false,
            texto:
              "No la reconocí. Por ahora leo: IVA (F.2051/F.2002), Libro IVA Digital (F.2083), Ingresos Brutos Convenio Multilateral (CM03), Jujuy (F-232) y Salta (F903), y Ganancias sociedades (F.713) y personas humanas (F.2711).",
          });
          continue;
        }
        const cuit = cuitEmpresa.replace(/\D/g, "");
        if (cuit && d.cuit !== cuit) {
          nuevos.push({
            archivo: a.name,
            ok: false,
            texto: `Es de otro CUIT (${d.nombre || d.cuit}): no se cargó en esta empresa.`,
          });
          continue;
        }
        nuevos.push({
          archivo: a.name,
          ok: true,
          texto: await onLeida(d, a.name),
        });
      } catch (e) {
        nuevos.push({
          archivo: a.name,
          ok: false,
          texto: e instanceof Error ? e.message : String(e),
        });
      }
    }
    setResultados((r) => [...nuevos, ...r].slice(0, 12));
    setLeyendo(false);
  }

  const anuales = Object.entries(ganancias).sort(([a], [b]) =>
    b.localeCompare(a),
  );

  return (
    <section className="mb-4 rounded-2xl border border-stone-200/80 bg-white p-5 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Declaraciones juradas presentadas</h3>
          <p className="mt-1 max-w-3xl text-stone-600">
            Subí el PDF de la DDJJ y se carga sola en el mes que corresponde,
            con su asiento: IVA (F.2051), Libro IVA Digital (F.2083, para
            controlar), Ingresos Brutos de Convenio Multilateral (CM03), Jujuy
            (F-232) y Salta (F903), y Ganancias de sociedades (F.713) y de
            personas humanas (F.2711). Lo presentado manda sobre lo que calcula
            el sistema.
          </p>
        </div>
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = [...e.dataTransfer.files].filter((x) =>
            /\.pdf$/i.test(x.name),
          );
          if (f.length) subir(f);
        }}
        className={`mt-3 block cursor-pointer rounded-lg border-2 border-dashed p-4 text-center ${arrastrando ? "border-marca bg-marca-claro" : "border-stone-300 hover:border-marca"}`}
      >
        <span className="font-medium text-marca">
          {leyendo ? "Leyendo…" : "Subir DDJJ (PDF)"}
        </span>
        <span className="block text-xs text-stone-500">
          o arrastralas acá · podés subir varias juntas
        </span>
        <input
          id="subir-ddjj"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const f = [...(e.target.files ?? [])];
            e.target.value = "";
            if (f.length) subir(f);
          }}
        />
      </label>
      {resultados.length > 0 && (
        <ul className="mt-3 space-y-1">
          {resultados.map((r, i) => (
            <li
              key={`${r.archivo}-${i}`}
              className={r.ok ? "text-emerald-800" : "text-red-700"}
            >
              {r.ok ? "✓" : "✗"}{" "}
              <span className="font-medium">{r.archivo}</span>: {r.texto}
            </li>
          ))}
        </ul>
      )}
      {anuales.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-3">
          <h4 className="font-medium">Ganancias (DDJJ anuales cargadas)</h4>
          <ul className="mt-1 divide-y divide-stone-100">
            {anuales.map(([cierre, g]) => (
              <li
                key={cierre}
                className="flex flex-wrap items-center justify-between gap-2 py-1.5"
              >
                <span>
                  {g.formulario === "F.2711"
                    ? `Personas humanas, período ${cierre.slice(0, 4)} · ${textoCategorias(g)} · impuesto`
                    : `Ejercicio cerrado el ${fechaCorta(cierre)} · impuesto`}{" "}
                  determinado {pesos(g.impuestoDeterminado)} ·{" "}
                  {g.saldoAFavor > 0
                    ? `saldo a favor ${pesos(g.saldoAFavor)}`
                    : `a ingresar ${pesos(g.saldoAIngresar)}`}
                </span>
                {onBorrarGanancias && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm("¿Quitar esta DDJJ de Ganancias y su asiento?")
                      )
                        onBorrarGanancias(cierre);
                    }}
                    className="text-xs text-stone-500 underline"
                  >
                    Quitar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Resultado por categoría de una DDJJ de personas humanas (solo las que tienen movimiento). */
function textoCategorias(g: DdjjGanancias) {
  const con = (g.categorias ?? []).filter((c) => c.resultado);
  if (!con.length) return "sin resultados por categoría";
  return con
    .map(
      (c) =>
        `${c.categoria} categoría ${pesos(c.resultado)}${c.resultado < 0 ? " (quebranto)" : ""}`,
    )
    .join(", ");
}

/** Texto corto de lo que se cargó, para mostrar al subir. */
export function resumenDdjj(d: DdjjLeida) {
  switch (d.tipo) {
    case "iva":
      return `IVA de ${nombrePeriodo(d.periodo)} cargado como presentado: ${d.ddjj.saldoAPagar > 0 ? `saldo a pagar ${pesos(d.ddjj.saldoAPagar)}` : `saldo técnico a favor ${pesos(d.ddjj.saldoTecnicoAFavor)} y de libre disponibilidad ${pesos(d.ddjj.saldoLibreDisponibilidad)}`}.`;
    case "libro-iva":
      return `Libro IVA Digital de ${nombrePeriodo(d.periodo)}: quedó para controlar contra los comprobantes cargados (débito ${pesos(d.libro.debitoFiscal)}, crédito ${pesos(d.libro.creditoFiscal)}).`;
    case "iibb":
      return `Ingresos Brutos ${d.jurisdiccion} de ${nombrePeriodo(d.periodo)} cargado como presentado: impuesto ${pesos(d.datos.determinado)}${d.datos.aPagarDdjj !== undefined ? `, a pagar ${pesos(d.datos.aPagarDdjj)}${d.datos.saldoAFavorDdjj ? `, saldo a favor ${pesos(d.datos.saldoAFavorDdjj)}` : ""}` : ""}.`;
    case "ganancias-pj":
      if (d.ddjj.formulario === "F.2711")
        return `Ganancias personas humanas ${d.ddjj.cierre.slice(0, 4)}: ${textoCategorias(d.ddjj)}, impuesto ${pesos(d.ddjj.impuestoDeterminado)}${d.ddjj.impuestoDeterminado ? " (va a la cuenta particular del titular)" : ""}.`;
      return `Ganancias del ejercicio cerrado el ${fechaCorta(d.ddjj.cierre)}: impuesto ${pesos(d.ddjj.impuestoDeterminado)}, se registró el asiento a esa fecha.`;
  }
}
