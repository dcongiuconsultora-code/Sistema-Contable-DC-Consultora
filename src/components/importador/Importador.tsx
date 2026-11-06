"use client";

import { useEffect, useMemo, useState } from "react";
import { Bancos } from "@/components/bancos/Bancos";
import { CuentasCorrientes } from "@/components/cuentas/CuentasCorrientes";
import { cuentasCorrientes } from "@/lib/cuentas/cuenta-corriente";
import {
  type Contraparte,
  Movimientos,
} from "@/components/movimientos/Movimientos";
import { type TicketCargado, Tickets } from "@/components/tickets/Tickets";
import type { Comprobante } from "@/lib/arca/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";
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
import { type LectorTicket, leerConServidor } from "@/lib/tickets/lector";
import {
  claveComprobante,
  revisarTicket,
  ticketAComprobante,
} from "@/lib/tickets/validar";

type Seccion = "arca" | "bancos" | "tickets" | "movimientos" | "cuentas";

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Clientes o proveedores distintos de una lista de comprobantes, para sugerir al cargar. */
function contrapartes(comprobantes: Comprobante[]): Contraparte[] {
  const vistas = new Map<string, Contraparte>();
  for (const c of comprobantes) {
    if (c.contraparte && !vistas.has(c.contraparte))
      vistas.set(c.contraparte, {
        nombre: c.contraparte,
        cuit: c.cuitContraparte,
      });
  }
  return [...vistas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// Movimientos de ejemplo que coinciden con el resumen bancario de ejemplo.
const MOVIMIENTOS_EJEMPLO: Movimiento[] = [
  {
    id: "ej1",
    tipo: "pago_proveedor",
    fecha: "2026-09-02",
    importe: 31567.04,
    medio: "banco_cc",
    contraparte: "Electricidad Demo",
    cuitContraparte: "",
    nota: "Factura de agosto",
    estado: "aprobado",
  },
  {
    id: "ej2",
    tipo: "cobro",
    fecha: "2026-09-03",
    importe: 380000,
    medio: "banco_cc",
    contraparte: "Cliente Mayorista SA",
    cuitContraparte: "",
    nota: "",
    estado: "enviado",
    retenciones: [],
  },
  {
    id: "ej3",
    tipo: "sueldo",
    fecha: "2026-09-05",
    importe: 850000,
    medio: "efectivo",
    contraparte: "Juan Pérez",
    cuitContraparte: "",
    cuenta: "2.1.03.001",
    periodo: "2026-08",
    nota: "",
    estado: "enviado",
  },
  {
    id: "ej4",
    tipo: "gasto",
    fecha: "2026-09-10",
    importe: 45000,
    medio: "efectivo",
    contraparte: "",
    cuitContraparte: "",
    cuenta: "5.3.01.018",
    conFactura: false,
    nota: "Viáticos viaje a Jujuy",
    estado: "observado",
    observacion: "¿Hay tickets de este viaje? Si los hay, cargalos en Tickets.",
  },
];
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
  lector = leerConServidor,
  sinLector,
}: {
  cargarEjemploAlInicio?: boolean;
  /** Cómo se leen las fotos de tickets: por defecto, la ruta del servidor; null = carga manual. */
  lector?: LectorTicket | null;
  sinLector?: string;
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
  const [tickets, setTickets] = useState<TicketCargado[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [cuitElegido, setCuitElegido] = useState<string | null>(null);
  const cuitCliente =
    cuitElegido ?? compras?.cuitTitular ?? ventas?.cuitTitular ?? "";

  // Los tickets que el cliente cargó y todavía no aparecen en Mis Comprobantes recibidos.
  const ticketsPendientes = useMemo(() => {
    const enArca = new Set((compras?.comprobantes ?? []).map(claveComprobante));
    return tickets
      .map((t, i) =>
        ticketAComprobante(
          revisarTicket(t.datos, cuitCliente || null),
          100000 + i,
        ),
      )
      .filter((c) => !enArca.has(claveComprobante(c)))
      .map((c) => ({
        ...c,
        advertencias: [
          "Ticket cargado por el cliente, todavía no figura en ARCA.",
          ...c.advertencias,
        ],
      }));
  }, [tickets, compras, cuitCliente]);

  const fechaCorte = hoyIso();
  const ctasClientes = useMemo(
    () =>
      cuentasCorrientes(
        "cliente",
        ventas?.comprobantes ?? [],
        movimientos,
        fechaCorte,
      ),
    [ventas, movimientos, fechaCorte],
  );
  const ctasProveedores = useMemo(
    () =>
      cuentasCorrientes(
        "proveedor",
        [...(compras?.comprobantes ?? []), ...ticketsPendientes],
        movimientos,
        fechaCorte,
        (c) => (c.fila >= 100000 ? "Ticket" : "ARCA"),
      ),
    [compras, ticketsPendientes, movimientos, fechaCorte],
  );
  // Clientes y proveedores por CUIT, para reconocerlos en el resumen del banco.
  const conocidos = useMemo(() => {
    const porCuit = (comprobantes: Comprobante[]) =>
      new Map(
        comprobantes
          .filter((c) => c.cuitContraparte.length === 11)
          .map((c) => [c.cuitContraparte, c.contraparte || c.cuitContraparte]),
      );
    return {
      clientes: porCuit(ventas?.comprobantes ?? []),
      proveedores: porCuit([
        ...(compras?.comprobantes ?? []),
        ...ticketsPendientes,
      ]),
    };
  }, [ventas, compras, ticketsPendientes]);
  const registrarDesdeBanco = (nuevos: Movimiento[]) => {
    const ids = new Set(nuevos.map((m) => m.id));
    setMovimientos((actuales) =>
      [...actuales.filter((m) => !ids.has(m.id)), ...nuevos].sort((a, b) =>
        b.fecha.localeCompare(a.fecha),
      ),
    );
  };

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
      ...ticketsPendientes,
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
  }, [ventas, compras, deducciones, ticketsPendientes]);
  const periodo =
    periodoElegido && periodos.includes(periodoElegido)
      ? periodoElegido
      : principal;

  const ventasPeriodo = periodo
    ? comprobantesDelPeriodo(ventas?.comprobantes ?? [], periodo)
    : [];
  const comprasPeriodo = periodo
    ? comprobantesDelPeriodo(
        [...(compras?.comprobantes ?? []), ...ticketsPendientes],
        periodo,
      )
    : [];
  const ivaDesdeArchivos =
    periodo && archivosDeducciones.length > 0
      ? deduccionesIva(deducciones, periodo)
      : null;
  const deduccionesPeriodo = periodo
    ? deducciones.filter((d) => d.periodo === periodo).length
    : 0;

  async function cargarEjemplos() {
    setMovimientos((actuales) =>
      actuales.length ? actuales : MOVIMIENTOS_EJEMPLO,
    );
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
          <nav className="flex flex-wrap gap-1 text-sm">
            {(
              [
                ["arca", "ARCA"],
                ["bancos", "Bancos"],
                ["movimientos", "Cobros y pagos"],
                ["cuentas", "Cuentas corrientes"],
                ["tickets", "Tickets"],
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
        <div hidden={seccion !== "movimientos"}>
          <section className="mb-6">
            <h1 className="text-2xl font-semibold">Cobros y pagos</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              El cliente registra lo que cobra y lo que paga: proveedores,
              sueldos, honorarios, gastos e impuestos. Cada movimiento genera su
              asiento con el plan de cuentas; el estudio lo aprueba u observa.
              Los que se pagan por banco se reconocen solos en el resumen
              bancario.
            </p>
          </section>
          <Movimientos
            movimientos={movimientos}
            onMovimientos={setMovimientos}
            clientes={contrapartes(ventas?.comprobantes ?? [])}
            proveedores={contrapartes(compras?.comprobantes ?? [])}
          />
        </div>
        <div hidden={seccion !== "cuentas"}>
          <section className="mb-6">
            <h1 className="text-2xl font-semibold">Cuentas corrientes</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              Se arman solas: las facturas salen de Mis Comprobantes y de los
              tickets, y los cobros y pagos, de lo que carga el cliente y de lo
              que se registra desde la conciliación bancaria.
            </p>
          </section>
          <CuentasCorrientes
            clientes={ctasClientes}
            proveedores={ctasProveedores}
            fechaCorte={fechaCorte}
          />
        </div>
        <div hidden={seccion !== "tickets"}>
          <section className="mb-6">
            <h1 className="text-2xl font-semibold">Tickets del cliente</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              Para los tiques que todavía no aparecen en Mis Comprobantes. El
              cliente saca una foto, el sistema lee los datos y el cliente los
              confirma. Se suman al Libro IVA Compras del período y, cuando el
              comprobante aparece en ARCA, se toma el de ARCA y el ticket no se
              cuenta dos veces.
            </p>
          </section>
          <Tickets
            cuitCliente={cuitCliente}
            onCuitCliente={setCuitElegido}
            comprasArca={compras?.comprobantes ?? []}
            tickets={tickets}
            onTickets={setTickets}
            lector={lector}
            sinLector={sinLector}
            ticketEjemplo={() =>
              descargarEjemplo("ticket-ejemplo.jpg", "image/jpeg")
            }
          />
        </div>
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
          <Bancos
            archivoExterno={ejemplos?.banco}
            movimientosCliente={movimientos}
            conocidos={conocidos}
            onRegistrar={registrarDesdeBanco}
          />
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
