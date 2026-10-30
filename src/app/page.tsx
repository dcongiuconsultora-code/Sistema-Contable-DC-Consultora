"use client";

import { useMemo, useState } from "react";
import { LibroIva } from "@/components/importador/LibroIva";
import { PanelLiquidacion } from "@/components/importador/PanelLiquidacion";
import { ZonaArchivo } from "@/components/importador/ZonaArchivo";
import type { ResultadoImportacion } from "@/lib/arca/tipos";
import { comprobantesDelPeriodo, type DatosManualesIva } from "@/lib/iva/liquidacion";
import { nombrePeriodo } from "@/lib/formato";

type Pestana = "ventas" | "compras" | "liquidacion";

const MANUAL_INICIAL: DatosManualesIva = {
  saldoTecnicoAnterior: 0,
  saldoLibreDisponibilidadAnterior: 0,
  percepciones: 0,
  retenciones: 0,
};

export default function ImportarArca() {
  const [ventas, setVentas] = useState<ResultadoImportacion | null>(null);
  const [compras, setCompras] = useState<ResultadoImportacion | null>(null);
  const [periodoElegido, setPeriodoElegido] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("ventas");
  const [manual, setManual] = useState(MANUAL_INICIAL);

  // Períodos presentes en los archivos, del más reciente al más viejo. Por defecto se muestra
  // el que tiene más comprobantes (el archivo suele traer algún comprobante suelto de otro mes).
  const { periodos, principal } = useMemo(() => {
    const cantidad = new Map<string, number>();
    for (const c of [...(ventas?.comprobantes ?? []), ...(compras?.comprobantes ?? [])]) {
      cantidad.set(c.periodo, (cantidad.get(c.periodo) ?? 0) + 1);
    }
    const lista = [...cantidad.keys()].sort().reverse();
    const principal = lista.reduce<string | undefined>((m, p) => (m && cantidad.get(m)! >= cantidad.get(p)! ? m : p), undefined);
    return { periodos: lista, principal };
  }, [ventas, compras]);
  const periodo = periodoElegido && periodos.includes(periodoElegido) ? periodoElegido : principal;

  const ventasPeriodo = periodo ? comprobantesDelPeriodo(ventas?.comprobantes ?? [], periodo) : [];
  const comprasPeriodo = periodo ? comprobantesDelPeriodo(compras?.comprobantes ?? [], periodo) : [];

  const pestanas: [Pestana, string][] = [
    ["ventas", `Libro IVA Ventas (${ventasPeriodo.length})`],
    ["compras", `Libro IVA Compras (${comprasPeriodo.length})`],
    ["liquidacion", "Liquidación IVA"],
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-7xl items-baseline justify-between gap-4 px-4 py-4">
          <span className="text-lg font-semibold">DC Consultora · Sistema Contable</span>
          <span className="text-sm opacity-80">Importar desde ARCA</span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <section>
          <h1 className="text-2xl font-semibold">Importar Mis Comprobantes</h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Descargá de ARCA los comprobantes emitidos y recibidos del cliente y subilos acá. Se arman solos los libros de IVA
            y la liquidación del período. Por ahora los archivos se leen en tu navegador y no se guardan.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <ZonaArchivo operacion="ventas" resultado={ventas} onResultado={setVentas} />
          <ZonaArchivo operacion="compras" resultado={compras} onResultado={setCompras} />
        </section>

        {periodo && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1 rounded-lg bg-stone-200/70 p-1">
                {pestanas.map(([id, texto]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestana(id)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      pestana === id ? "bg-white text-marca shadow-sm" : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {texto}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <span className="text-stone-600">Período</span>
                <select
                  value={periodo}
                  onChange={(e) => setPeriodoElegido(e.target.value)}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 capitalize"
                >
                  {periodos.map((p) => (
                    <option key={p} value={p}>{nombrePeriodo(p)}</option>
                  ))}
                </select>
              </label>
            </div>

            {pestana === "ventas" && <LibroIva titulo={`Libro IVA Ventas · ${nombrePeriodo(periodo)}`} comprobantes={ventasPeriodo} />}
            {pestana === "compras" && <LibroIva titulo={`Libro IVA Compras · ${nombrePeriodo(periodo)}`} comprobantes={comprasPeriodo} />}
            {pestana === "liquidacion" && (
              <PanelLiquidacion ventas={ventasPeriodo} compras={comprasPeriodo} manual={manual} onManual={setManual} />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
