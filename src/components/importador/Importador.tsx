"use client";

import { Mensajes } from "@/components/mensajes/Mensajes";
import { Marca } from "@/components/Marca";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { Bancos } from "@/components/bancos/Bancos";
import { AsignacionUnidades } from "@/components/unidades/AsignacionUnidades";
import { type ConfigUnidades, SIN_UNIDADES } from "@/lib/unidades/unidades";
import { type Alertas, Tablero } from "@/components/tablero/Tablero";
import { conciliarResumen } from "@/lib/bancos/conciliacion";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import { generarDiario } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
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

type Seccion =
  | "inicio"
  | "arca"
  | "bancos"
  | "tickets"
  | "movimientos"
  | "cuentas"
  | "mensajes";

// Saldos del último balance de la empresa de ejemplo (al 31/08/2026). El banco coincide con el
// saldo inicial del resumen bancario de ejemplo; los sueldos a pagar son los de agosto.
const SALDOS_EJEMPLO: SaldosIniciales = {
  fecha: "2026-08-31",
  saldos: {
    "1.1.01.001": 1200000,
    "1.1.01.006": 450000,
    "1.1.05.001": 6500000,
    "1.2.05.008": 9000000,
    "1.2.05.009": 1800000,
    "2.1.01.001": 1200000,
    "2.1.02.002": 2500000,
    "2.1.03.001": 850000,
    "2.1.03.005": 400000,
    "3.1.01.001": 5000000,
    "3.2.02.001": 5400000,
  },
};

function titulo(texto: string) {
  return texto
    .toLowerCase()
    .replace(/(^|\s)\S/g, (l) => l.toUpperCase())
    .replace(/\b(Sa|Srl|Sas|Saic)\b/g, (s) => s.toUpperCase())
    .replace(/ (De|Del|La|Las|Los|Y) /g, (s) => s.toLowerCase());
}

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
type Pestana =
  | "ventas"
  | "compras"
  | "deducciones"
  | "liquidacion"
  | "unidades";

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

/** Con base de datos: de qué empresa son los datos, quién está usando la app y dónde se guarda. */
export interface Conexion {
  repo: Repositorio;
  empresa: Empresa;
  rol: "estudio" | "cliente";
  /** Va a la derecha del encabezado: empresa elegida, usuario y salir. */
  encabezado: ReactNode;
}

// El cliente ve todo lo de su empresa y también importa ARCA y bancos; lo que lo diferencia del
// estudio es que no aprueba movimientos ni cambia los saldos de inicio.
const SECCIONES_CLIENTE: Seccion[] = [
  "inicio",
  "arca",
  "bancos",
  "movimientos",
  "cuentas",
  "tickets",
  "mensajes",
];

export function Importador({
  cargarEjemploAlInicio = false,
  lector = leerConServidor,
  sinLector,
  conexion,
}: {
  conexion?: Conexion;
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
  const [seccion, setSeccion] = useState<Seccion>(() => {
    try {
      const pedida = sessionStorage.getItem("seccion-al-abrir");
      sessionStorage.removeItem("seccion-al-abrir");
      if (pedida === "mensajes" && conexion) return "mensajes";
    } catch {
      // Sin almacenamiento abre en el inicio.
    }
    return "inicio";
  });
  const [resumenBanco, setResumenBanco] = useState<ResumenBancario | null>(
    null,
  );
  const [iniciales, setIniciales] = useState<SaldosIniciales>({
    fecha: "",
    saldos: {},
  });
  const [periodoElegido, setPeriodoElegido] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>("ventas");
  const [manual, setManual] = useState(MANUAL_INICIAL);
  const [tickets, setTickets] = useState<TicketCargado[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [unidades, setUnidades] = useState<ConfigUnidades>(SIN_UNIDADES);
  const [cuitElegido, setCuitElegido] = useState<string | null>(null);
  const cuitCliente =
    cuitElegido ??
    conexion?.empresa.cuit ??
    compras?.cuitTitular ??
    ventas?.cuitTitular ??
    "";

  // --- Base de datos ---------------------------------------------------------------------------
  const [cargando, setCargando] = useState(Boolean(conexion));
  const [noLeidos, setNoLeidos] = useState(0);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [resumenGuardado, setResumenGuardado] =
    useState<ResumenBancario | null>(null);
  const repo = conexion?.repo;
  const empresaId = conexion?.empresa.id;

  const comoResultado = useCallback(
    (
      operacion: "ventas" | "compras",
      comprobantes: Comprobante[],
      archivo?: ResultadoImportacion | null,
    ): ResultadoImportacion | null =>
      comprobantes.length === 0 && !archivo
        ? null
        : {
            operacion,
            formato: "detallado",
            cuitTitular: conexion?.empresa.cuit ?? null,
            comprobantes,
            errores: archivo?.errores ?? [],
            avisos: archivo?.avisos ?? [],
          },
    [conexion?.empresa.cuit],
  );

  const recargar = useCallback(
    async (ultimoArchivo?: {
      operacion: "ventas" | "compras";
      resultado: ResultadoImportacion;
    }) => {
      if (!repo || !empresaId) return;
      try {
        const d = await repo.cargar(empresaId);
        setVentas(
          comoResultado(
            "ventas",
            d.ventas,
            ultimoArchivo?.operacion === "ventas"
              ? ultimoArchivo.resultado
              : null,
          ),
        );
        setCompras(
          comoResultado(
            "compras",
            d.compras,
            ultimoArchivo?.operacion === "compras"
              ? ultimoArchivo.resultado
              : null,
          ),
        );
        setMovimientos(d.movimientos);
        setTickets(d.tickets);
        setArchivosDeducciones(
          d.archivosDeducciones.map((a) => ({
            id: a.id,
            nombre: a.nombre,
            resultado: {
              origen: a.origen,
              deducciones: a.deducciones,
              errores: [],
            },
          })),
        );
        setIniciales(d.saldos);
        setUnidades(d.unidades);
        setResumenBanco(d.resumen);
        setResumenGuardado(d.resumen);
      } catch (e) {
        setErrorDatos(e instanceof Error ? e.message : String(e));
      } finally {
        setCargando(false);
      }
    },
    [repo, empresaId, comoResultado],
  );

  useEffect(() => {
    recargar();
  }, [recargar]);

  /** Guarda en segundo plano; si falla, avisa y vuelve a leer lo que quedó en la base. */
  const guardar = (accion: () => Promise<unknown>) => {
    if (!repo) return;
    accion().catch((e) => {
      setErrorDatos(e instanceof Error ? e.message : String(e));
      recargar();
    });
  };

  const importarComprobantes =
    (operacion: "ventas" | "compras") =>
    (r: ResultadoImportacion | null, nombre?: string) => {
      if (!repo || !empresaId || !r)
        return operacion === "ventas" ? setVentas(r) : setCompras(r);
      guardar(async () => {
        await repo.guardarComprobantes(
          empresaId,
          operacion,
          r.comprobantes,
          nombre ?? "archivo",
        );
        await recargar({ operacion, resultado: r });
      });
    };

  const actualizarDeducciones = (siguientes: ArchivoDeducciones[]) => {
    const anteriores = archivosDeducciones;
    setArchivosDeducciones(siguientes);
    if (!repo || !empresaId) return;
    const quitados = anteriores.filter(
      (a) => a.id && !siguientes.some((n) => n.id === a.id),
    );
    const nuevos = siguientes.filter((a) => !a.id && !anteriores.includes(a));
    guardar(async () => {
      for (const a of quitados) await repo.borrarArchivo(a.id!);
      for (const a of nuevos)
        await repo.guardarDeducciones(
          empresaId,
          a.nombre,
          a.resultado.origen,
          a.resultado.deducciones,
        );
      if (nuevos.length) await recargar();
    });
  };

  const actualizarMovimientos = (siguientes: Movimiento[]) => {
    const anteriores = new Map(
      movimientos.map((m) => [m.id, JSON.stringify(m)]),
    );
    setMovimientos(siguientes);
    const cambiados = siguientes.filter(
      (m) => anteriores.get(m.id) !== JSON.stringify(m),
    );
    if (empresaId && cambiados.length)
      guardar(() => repo!.guardarMovimientos(empresaId, cambiados));
  };

  const actualizarTickets = (siguientes: TicketCargado[]) => {
    const anteriores = new Map(tickets.map((t) => [t.id, JSON.stringify(t)]));
    setTickets(siguientes);
    if (!repo || !empresaId) return;
    const cambiados = siguientes.filter(
      (t) => anteriores.get(t.id) !== JSON.stringify(t),
    );
    const quitados = tickets.filter(
      (t) => !siguientes.some((n) => n.id === t.id),
    );
    guardar(async () => {
      for (const t of cambiados) {
        // Solo se sube la foto la primera vez (las nuevas son locales, "blob:").
        const foto = t.foto.startsWith("blob:")
          ? await (await fetch(t.foto)).blob()
          : null;
        await repo.guardarTicket(empresaId, t, foto);
      }
      for (const t of quitados) await repo.borrarTicket(t.id);
    });
  };

  // Los saldos de inicio se guardan un momento después de dejar de escribir.
  const esperaSaldos = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actualizarIniciales = (s: SaldosIniciales) => {
    setIniciales(s);
    if (!repo || !empresaId) return;
    if (esperaSaldos.current) clearTimeout(esperaSaldos.current);
    esperaSaldos.current = setTimeout(
      () => guardar(() => repo.guardarSaldos(empresaId, s)),
      800,
    );
  };

  const recibirResumen = (r: ResumenBancario | null, nombre?: string) => {
    setResumenBanco(r);
    if (r && empresaId && repo)
      guardar(() => repo.guardarResumen(empresaId, r, nombre ?? "resumen.pdf"));
  };

  // Los tickets que el cliente cargó y todavía no aparecen en Mis Comprobantes recibidos.
  const ticketsPendientes = useMemo(() => {
    const enArca = new Set((compras?.comprobantes ?? []).map(claveComprobante));
    return tickets
      .map((t, i) => ({
        ...ticketAComprobante(
          revisarTicket(t.datos, cuitCliente || null),
          100000 + i,
        ),
        unidad: t.unidad ?? null,
      }))
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
  const conciliacion = useMemo(
    () =>
      resumenBanco
        ? conciliarResumen(resumenBanco, movimientos, conocidos)
        : null,
    [resumenBanco, movimientos, conocidos],
  );
  const asientos = useMemo(() => {
    const cuentaBanco = new Map(
      resumenBanco?.cuentas.map((c) => [
        c.numero,
        /AHORRO/i.test(c.tipo) ? "1.1.01.007" : "1.1.01.006",
      ]),
    );
    return generarDiario({
      ventas: ventas?.comprobantes ?? [],
      compras: [...(compras?.comprobantes ?? []), ...ticketsPendientes],
      movimientos,
      banco: (conciliacion?.filas ?? []).map((fila) => ({
        fila,
        cuentaBanco: cuentaBanco.get(fila.cuenta) ?? "1.1.01.006",
      })),
      unidades,
    });
  }, [
    unidades,
    ventas,
    compras,
    ticketsPendientes,
    movimientos,
    conciliacion,
    resumenBanco,
  ]);
  const alertas: Alertas = {
    observados: movimientos.filter((m) => m.estado === "observado").length,
    sinAprobar: movimientos.filter((m) => m.estado === "enviado").length,
    cobrosVencidos: ctasClientes
      .flatMap((c) => c.pendientes)
      .filter((p) => p.dias > 60)
      .reduce(
        (t, p) => ({
          cantidad: t.cantidad + 1,
          importe: t.importe + p.pendiente,
        }),
        { cantidad: 0, importe: 0 },
      ),
    bancoSinRegistrar: conciliacion?.totales.sin_registrar.cantidad ?? 0,
    bancoSugeridos: conciliacion?.totales.sugerido.cantidad ?? 0,
    ticketsPendientes: ticketsPendientes.length,
  };
  const empresa = conexion
    ? conexion.empresa.razon_social
    : resumenBanco?.titular
      ? titulo(resumenBanco.titular)
      : "tu empresa";

  const registrarDesdeBanco = (registrados: Movimiento[]) => {
    // Lo que identifica el cliente desde el banco lo revisa el estudio, como cualquier otro movimiento.
    const nuevos =
      conexion?.rol === "cliente"
        ? registrados.map((m) => ({
            ...m,
            estado: "enviado" as const,
            origen: "cliente" as const,
          }))
        : registrados;
    const ids = new Set(nuevos.map((m) => m.id));
    actualizarMovimientos(
      [...movimientos.filter((m) => !ids.has(m.id)), ...nuevos].sort((a, b) =>
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
    setIniciales((actuales) =>
      Object.keys(actuales.saldos).length ? actuales : SALDOS_EJEMPLO,
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
    ...(unidades.unidades.length
      ? ([["unidades", "Unidades"]] as [Pestana, string][])
      : []),
  ];

  const asignarProveedor = (cuit: string, unidadId: string | null) => {
    const proveedores = { ...unidades.proveedores };
    if (unidadId) proveedores[cuit] = unidadId;
    else delete proveedores[cuit];
    setUnidades({ ...unidades, proveedores });
    if (empresaId)
      guardar(() => repo!.asignarProveedor(empresaId, cuit, unidadId));
  };

  return (
    <div className="min-h-screen">
      <header className="bg-marca text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <Marca />
          <nav className="flex flex-wrap gap-1 text-sm">
            {(
              [
                ["inicio", "Inicio"],
                ["arca", "ARCA"],
                ["bancos", "Bancos"],
                ["movimientos", "Cobros y pagos"],
                ["cuentas", "Cuentas corrientes"],
                ["tickets", "Tickets"],
                ["mensajes", "Mensajes"],
              ] as [Seccion, string][]
            )
              .filter(
                ([id]) =>
                  (conexion?.rol !== "cliente" ||
                    SECCIONES_CLIENTE.includes(id)) &&
                  (id !== "mensajes" || conexion),
              )
              .map(([id, texto]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSeccion(id)}
                  className={`rounded-md px-3 py-1.5 font-medium ${seccion === id ? "bg-white/20" : "opacity-80 hover:bg-white/10 hover:opacity-100"}`}
                >
                  {texto}
                  {id === "mensajes" && noLeidos > 0 && (
                    <span
                      aria-label={`${noLeidos} sin leer`}
                      className="ml-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-xs font-semibold text-marca"
                    >
                      {noLeidos}
                    </span>
                  )}
                </button>
              ))}
          </nav>
          {conexion?.encabezado}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
        {errorDatos && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            <span>{errorDatos}</span>
            <button
              type="button"
              onClick={() => setErrorDatos(null)}
              className="shrink-0 font-medium"
            >
              Cerrar
            </button>
          </div>
        )}
        {cargando && (
          <p className="text-sm text-stone-500">
            Cargando los datos de {empresa}…
          </p>
        )}
        <div hidden={seccion !== "inicio"}>
          <Tablero
            empresa={empresa}
            asientos={asientos}
            iniciales={iniciales}
            onIniciales={actualizarIniciales}
            puedeEditarSaldos={conexion?.rol !== "cliente"}
            alertas={alertas}
            onIr={setSeccion}
            unidades={unidades}
          />
        </div>
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
            onMovimientos={actualizarMovimientos}
            vistaFija={conexion?.rol}
            unidades={unidades}
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
        {conexion && (
          <div hidden={seccion !== "mensajes"}>
            <Mensajes
              repo={conexion.repo}
              empresaId={conexion.empresa.id}
              soyEstudio={conexion.rol === "estudio"}
              visible={seccion === "mensajes"}
              onNoLeidos={setNoLeidos}
            />
          </div>
        )}
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
            onTickets={actualizarTickets}
            lector={lector}
            sinLector={sinLector}
            ticketEjemplo={() =>
              descargarEjemplo("ticket-ejemplo.jpg", "image/jpeg")
            }
            unidades={unidades}
          />
        </div>
        <div hidden={seccion !== "bancos"}>
          <section className="mb-6">
            <h1 className="text-2xl font-semibold">Bancos</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              {conexion?.rol === "cliente"
                ? "Subí el resumen del banco en PDF, tal como lo descargás del home banking. El sistema lo lee solo; si hay movimientos que no reconoce, podés indicar qué fueron y el estudio los revisa."
                : "Subí el resumen del banco en PDF. El sistema lee todas las cuentas, controla que los saldos cierren y clasifica cada movimiento con las cuentas del plan. Los que necesitan tu criterio quedan marcados para revisar."}
            </p>
          </section>
          <Bancos
            archivoExterno={ejemplos?.banco}
            movimientosCliente={movimientos}
            conocidos={conocidos}
            onRegistrar={registrarDesdeBanco}
            onResumen={recibirResumen}
            resumenGuardado={resumenGuardado}
          />
        </div>
        <div hidden={seccion !== "arca"} className="space-y-6">
          <section>
            <h1 className="text-2xl font-semibold">Importar desde ARCA</h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              Descargá de ARCA los comprobantes emitidos y recibidos y las
              retenciones del cliente, y subilos acá. Se arman solos los libros
              de IVA, el resumen de retenciones y percepciones y la liquidación
              del período.
              {conexion
                ? " Lo que subas queda guardado; si subís dos veces el mismo archivo, no se duplica."
                : " En el prototipo los archivos se leen en tu navegador y no se guardan."}
            </p>
            <button
              type="button"
              hidden={Boolean(conexion)}
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
              onResultado={importarComprobantes("ventas")}
              archivoExterno={ejemplos?.ventas}
            />
            <ZonaArchivo
              operacion="compras"
              resultado={compras}
              onResultado={importarComprobantes("compras")}
              archivoExterno={ejemplos?.compras}
            />
            <ZonaDeducciones
              archivos={archivosDeducciones}
              onArchivos={actualizarDeducciones}
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
              {pestana === "unidades" && (
                <AsignacionUnidades
                  unidades={unidades}
                  ventas={ventas?.comprobantes ?? []}
                  compras={[
                    ...(compras?.comprobantes ?? []),
                    ...ticketsPendientes,
                  ]}
                  onAsignarProveedor={asignarProveedor}
                />
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
