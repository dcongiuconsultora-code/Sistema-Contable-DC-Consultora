"use client";

import { useEffect, useMemo, useState } from "react";
import { Bancos } from "@/components/bancos/Bancos";
import { LibroIva } from "./LibroIva";
import { PanelLiquidacion } from "./PanelLiquidacion";
import { TablaDeducciones } from "./TablaDeducciones";
import { ZonaArchivo } from "./ZonaArchivo";
import { type ArchivoDeducciones, ZonaDeducciones } from "./ZonaDeducciones";
import { deduccionesIva } from "@/lib/arca/retenciones";
import type { ResultadoImportacion } from "@/lib/arca/tipos";
import {
  comprobantesDelPeriodo,
  type DatosManualesIva,
} from "@/lib/iva/liquidacion";
import { nombrePeriodo } from "@/lib/formato";

type Seccion = "arca" | "bancos";
type Pestana = "ventas" | "compras" | "deducciones" | "liquidacion";

const MANUAL_INICIAL: DatosManualesIva = {
  saldoTecnicoAnterior: 0,
  saldoLibreDisponibilidadAnterior: 0,
  percepciones: 0,
  retenciones: 0,
};

async function descargarEjemplo(nombre: string, tipo: string) {
  // El prototipo de un solo archivo trae los ejemplos embebidos en base64.
  const embebido = (globalThis as { __EJEMPLOS__?: Record<string, string> })
    .__EJEMPLOS__?.[nombre];
  if (embebido) {
    return new File(
      [Uint8Array.from(atob(embebido), (c) => c.charCodeAt(0))],
      nombre,
      { type: tipo },
    );
  }
  const respuesta = await fetch(`ejemplos/${nombre}`);
  if (!respuesta.ok) throw new Error(`No se pudo cargar ${nombre}`);
  return new File([await respuesta.blob()], nombre, { type: tipo });
}

export function Importador({
  cargarEjemploAlInicio = false,
}: {
  cargarEjemploAlInicio?: boolean;
}) {
  const [ventas, setVentas] = useState<ResultadoImportacion | null>(null);
  const [compras, setCompras] = useState<ResultadoImportacion | null>(null);
  const [archivosDeducciones, setArchivosDeducciones] = useState<
    ArchivoDeducciones[]
  >([]);
  const [ejemplos, setEjemplos] = useState<{
    ventas: File;
    compras: File;
    deducciones: File[];
    banco: File;
  } | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("arca");
  const [periodoElegido, setPeriodoElegido] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("ventas");
  const [manual, setManual] = useState(MANUAL_INICIAL);

  const deducciones = useMemo(
    () => archivosDeducciones.flatMap((a) => a.resultado.deducciones),
    [archivosDeducciones],
  );

  // Períodos presentes en los archivos, del más reciente al más viejo. Por defecto se muestra
  // el que tiene más comprobantes (el archivo suele traer algún comprobante suelto de otro mes).
  const { periodos, principal } = useMemo(() => {
    const cantidad = new Map<string, number>();
    for (const c of [
      ...(ventas?.comprobantes ?? []),
      ...(compras?.comprobantes ?? []),
    ]) {
      cantidad.set(c.periodo, (cantidad.get(c.periodo) ?? 0) + 1);
    }
    const masComprobantes = [...cantidad.keys()].reduce<string | undefined>(
      (m, p) => (m && cantidad.get(m)! >= cantidad.get(p)! ? m : p),
      undefined,
    );
    const lista = [
      ...new Set([...cantidad.keys(), ...deducciones.map((d) => d.periodo)]),
    ]
      .sort()
      .reverse();
    return { periodos: lista, principal: masComprobantes ?? lista[0] };
  }, [ventas, compras, deducciones]);
  const periodo =
    periodoElegido && periodos.includes(periodoElegido)
      ? periodoElegido
      : principal;

  const ventasPeriodo = periodo
    ? comprobantesDelPeriodo(ventas?.comprobantes ?? [], periodo)
    : [];
  const comprasPeriodo = periodo
    ? comprobantesDelPeriodo(compras?.comprobantes ?? [], periodo)
    : [];
  const ivaDesdeArchivos =
    periodo && archivosDeducciones.length > 0
      ? deduccionesIva(deducciones, periodo)
      : null;
  const deduccionesPeriodo = periodo
    ? deducciones.filter((d) => d.periodo === periodo).length
    : 0;

  async function cargarEjemplos() {
    setEjemplos({
      ventas: await descargarEjemplo("emitidos-ejemplo.csv", "text/csv"),
      compras: await descargarEjemplo(
        "recibidos-ejemplo.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
      deducciones: [
        await descargarEjemplo(
          "mis-retenciones-ejemplo.xls",
          "application/vnd.ms-excel",
        ),
        await descargarEjemplo("sircreb-ejemplo.txt", "text/plain"),
      ],
      banco: await descargarEjemplo(
        "resumen-macro-ejemplo.pdf",
        "application/pdf",
      ),
    });
  }

  useEffect(() => {
    if (cargarEjemploAlInicio) cargarEjemplos();
  }, [cargarEjemploAlInicio]);

  const pestanas: [Pestana, string][] = [
    ["ventas", `Libro IVA Ventas (${ventasPeriodo.length})`],
    ["compras", `Libro IVA Compras (${comprasPeriodo.length})`],
    ["deducciones", `Retenciones y percepciones (${deduccionesPeriodo})`],
    ["liquidacion", "Liquidación IVA"],
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-semibold">
            DC Consultora · Sistema Contable
          </span>
          <nav className="flex gap-1 text-sm">
            {(
              [
                ["arca", "ARCA"],
                ["bancos", "Bancos"],
              ] as [Seccion, string][]
            ).map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSeccion(id)}
                className={`rounded-md px-3 py-1.5 font-medium ${seccion === id ? "bg-white/20" : "opacity-80 hover:bg-white/10 hover:opacity-100"}`}
              >
                {texto}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        <div hidden={seccion !== "bancos"}>
          <section className="mb-6">
            <h1 className="text-2xl font-semibold">Bancos</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              Subí el resumen del banco en PDF. El sistema lee todas las
              cuentas, controla que los saldos cierren y clasifica cada
              movimiento con las cuentas del plan. Los que necesitan tu criterio
              quedan marcados para revisar.
            </p>
          </section>
          <Bancos archivoExterno={ejemplos?.banco} />
        </div>
        <div hidden={seccion !== "arca"} className="space-y-6">
          <section>
            <h1 className="text-2xl font-semibold">Importar desde ARCA</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              Descargá de ARCA los comprobantes emitidos y recibidos y las
              retenciones del cliente, y subilos acá. Se arman solos los libros
              de IVA, el resumen de retenciones y percepciones y la liquidación
              del período. Por ahora los archivos se leen en tu navegador y no
              se guardan.
            </p>
            <button
              type="button"
              onClick={cargarEjemplos}
              className="mt-3 rounded-md border border-marca px-3 py-1.5 text-sm font-medium text-marca hover:bg-marca-claro"
            >
              Probar con archivos de ejemplo
            </button>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <ZonaArchivo
              operacion="ventas"
              resultado={ventas}
              onResultado={setVentas}
              archivoExterno={ejemplos?.ventas}
            />
            <ZonaArchivo
              operacion="compras"
              resultado={compras}
              onResultado={setCompras}
              archivoExterno={ejemplos?.compras}
            />
            <ZonaDeducciones
              archivos={archivosDeducciones}
              onArchivos={setArchivosDeducciones}
              archivosExternos={ejemplos?.deducciones}
            />
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
                        pestana === id
                          ? "bg-white text-marca shadow-sm"
                          : "text-stone-600 hover:text-stone-900"
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
                      <option key={p} value={p}>
                        {nombrePeriodo(p)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {pestana === "ventas" && (
                <LibroIva
                  titulo={`Libro IVA Ventas · ${nombrePeriodo(periodo)}`}
                  comprobantes={ventasPeriodo}
                />
              )}
              {pestana === "compras" && (
                <LibroIva
                  titulo={`Libro IVA Compras · ${nombrePeriodo(periodo)}`}
                  comprobantes={comprasPeriodo}
                />
              )}
              {pestana === "deducciones" && (
                <TablaDeducciones deducciones={deducciones} periodo={periodo} />
              )}
              {pestana === "liquidacion" && (
                <PanelLiquidacion
                  ventas={ventasPeriodo}
                  compras={comprasPeriodo}
                  manual={manual}
                  onManual={setManual}
                  desdeArchivos={ivaDesdeArchivos}
                />
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
