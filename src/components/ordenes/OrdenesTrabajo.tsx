"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { Repositorio } from "@/lib/datos/repositorio";
import { fechaCorta, nombrePeriodo, pesos } from "@/lib/formato";
import { descargar } from "@/lib/informes/informe";
import {
  ESTADOS_ORDEN,
  type EstadoOrden,
  type OrdenTrabajo,
  TIPOS_TRABAJO,
  enCurso,
  claveOrden,
  cobrado,
  manoDeObra,
  nuevaOrden,
  resumenPorMes,
  saldo,
  saldosPorCliente,
  sinIva,
} from "@/lib/ordenes/ordenes";
import {
  type ClientePlanilla,
  type PlanillaOrdenes,
  excelOrdenes,
  leerArchivoOrdenes,
} from "@/lib/ordenes/planilla";
import type { Unidad } from "@/lib/unidades/unidades";

const hoyIso = () => new Date().toLocaleDateString("en-CA");
const $ = (n: number) => `$ ${pesos(n || 0)}`;
const campo =
  "mt-0.5 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm";

const COLOR_ESTADO: Record<EstadoOrden, string> = {
  "No empezado": "bg-stone-100 text-stone-700",
  "En proceso": "bg-amber-100 text-amber-800",
  Terminado: "bg-emerald-100 text-emerald-800",
};

type Vista = "ordenes" | "meses" | "saldos" | "clientes";
type FiltroEstado = "todas" | "en curso" | "pendientes" | "con saldo";

/** "350.000" y "1.234,50" (como se escribe acá) o "1234.5". */
export function aNumero(texto: string) {
  const limpio = texto.replace(/[\s$]/g, "");
  const n = Number(
    limpio.includes(",")
      ? limpio.replace(/\./g, "").replace(",", ".")
      : /^-?\d{1,3}(\.\d{3})+$/.test(limpio)
        ? limpio.replace(/\./g, "")
        : limpio,
  );
  return Number.isFinite(n) ? n : 0;
}

function Numero({
  valor,
  onCambio,
  id,
}: {
  valor: number;
  onCambio: (n: number) => void;
  id: string;
}) {
  const [texto, setTexto] = useState(valor ? String(valor) : "");
  return (
    <input
      id={id}
      inputMode="decimal"
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        onCambio(aNumero(e.target.value));
      }}
      className={`${campo} text-right tabular-nums`}
    />
  );
}

function Formulario({
  inicial,
  clientes,
  tipos,
  onGuardar,
  onCerrar,
}: {
  inicial: OrdenTrabajo;
  clientes: string[];
  tipos: string[];
  onGuardar: (o: OrdenTrabajo) => Promise<void>;
  onCerrar: () => void;
}) {
  const [o, setO] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const cambiar = (c: Partial<OrdenTrabajo>) => setO((x) => ({ ...x, ...c }));
  const clienteNuevo =
    !!o.cliente.trim() &&
    !clientes.some((c) => c.toLowerCase() === o.cliente.trim().toLowerCase());
  return (
    <Modal
      titulo={inicial.id ? `Orden ${inicial.numero}` : "Nueva orden de trabajo"}
      onCerrar={onCerrar}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!o.fecha) return;
          setGuardando(true);
          try {
            await onGuardar({
              ...o,
              pagos: o.pagos.filter((p) => p.importe),
            });
          } finally {
            setGuardando(false);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block text-xs">
            <span className="text-stone-500">Pedido Nº</span>
            <input
              id="ot-numero"
              value={o.numero}
              onChange={(e) => cambiar({ numero: e.target.value })}
              className={`${campo} tabular-nums`}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">Fecha</span>
            <input
              id="ot-fecha"
              type="date"
              required
              value={o.fecha}
              onChange={(e) => cambiar({ fecha: e.target.value })}
              className={campo}
            />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-stone-500">Cliente</span>
            <input
              id="ot-cliente"
              list="ot-clientes"
              value={o.cliente}
              onChange={(e) => cambiar({ cliente: e.target.value })}
              className={campo}
              placeholder="Nombre del cliente"
            />
            <datalist id="ot-clientes">
              {clientes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {clienteNuevo && (
              <span className="mt-1 block text-emerald-700">
                Cliente nuevo: queda guardado en la lista de clientes.
              </span>
            )}
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-stone-500">Tipo de trabajo</span>
            <input
              id="ot-tipo"
              list="ot-tipos"
              value={o.tipo}
              onChange={(e) => cambiar({ tipo: e.target.value })}
              className={campo}
              placeholder="Mostrador, Vitrina vertical, Personalizado…"
            />
            <datalist id="ot-tipos">
              {tipos.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-stone-500">Información adicional</span>
            <input
              id="ot-detalle"
              value={o.detalle}
              onChange={(e) => cambiar({ detalle: e.target.value })}
              className={campo}
              placeholder="Medidas, color, local…"
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">Cantidad</span>
            <Numero
              id="ot-cantidad"
              valor={o.cantidad}
              onCambio={(cantidad) => cambiar({ cantidad })}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">OT (orden de trabajo)</span>
            <input
              id="ot-ot"
              value={o.ot}
              onChange={(e) => cambiar({ ot: e.target.value })}
              className={`${campo} tabular-nums`}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">Estado</span>
            <select
              id="ot-estado"
              value={o.estado}
              onChange={(e) =>
                cambiar({ estado: e.target.value as EstadoOrden })
              }
              className={campo}
            >
              {ESTADOS_ORDEN.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 rounded-xl bg-stone-50 p-3 sm:grid-cols-4">
          <label className="block text-xs">
            <span className="text-stone-500">Total del trabajo</span>
            <Numero
              id="ot-total"
              valor={o.total}
              onCambio={(total) => cambiar({ total })}
            />
          </label>
          <label className="block text-xs">
            <span className="text-stone-500">Materiales</span>
            <Numero
              id="ot-materiales"
              valor={o.materiales}
              onCambio={(materiales) => cambiar({ materiales })}
            />
          </label>
          <div className="text-xs">
            <span className="text-stone-500">Mano de obra</span>
            <p className="mt-1.5 text-right text-sm font-medium tabular-nums">
              {$(manoDeObra(o))}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                id="ot-con-factura"
                checked={o.conFactura}
                onChange={(e) => cambiar({ conFactura: e.target.checked })}
              />
              Con factura (el total incluye IVA)
            </label>
            {o.conFactura && (
              <input
                aria-label="Número de factura"
                value={o.factura}
                onChange={(e) => cambiar({ factura: e.target.value })}
                placeholder="Nº de factura"
                className={campo}
              />
            )}
            {o.conFactura && (
              <p className="text-stone-500">Sin IVA: {$(sinIva(o))}</p>
            )}
          </div>
          {(o.ivaAparte > 0 || inicial.ivaAparte > 0) && (
            <label className="block text-xs">
              <span className="text-stone-500">IVA cobrado aparte</span>
              <Numero
                id="ot-iva"
                valor={o.ivaAparte}
                onCambio={(ivaAparte) => cambiar({ ivaAparte })}
              />
            </label>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pagos a cuenta</h3>
            <button
              type="button"
              onClick={() =>
                cambiar({
                  pagos: [
                    ...o.pagos,
                    { fecha: hoyIso(), importe: 0, recibo: "" },
                  ],
                })
              }
              className="rounded-md border border-marca px-2.5 py-1 text-xs font-medium text-marca"
            >
              ＋ Agregar pago
            </button>
          </div>
          {o.pagos.length === 0 && (
            <p className="mt-1 text-xs text-stone-500">Todavía no pagó nada.</p>
          )}
          <div className="mt-2 space-y-2">
            {o.pagos.map((p, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2"
              >
                <label className="block text-xs">
                  <span className="text-stone-500">Fecha</span>
                  <input
                    type="date"
                    value={p.fecha}
                    onChange={(e) =>
                      cambiar({
                        pagos: o.pagos.map((x, j) =>
                          j === i ? { ...x, fecha: e.target.value } : x,
                        ),
                      })
                    }
                    className={campo}
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-stone-500">Importe</span>
                  <Numero
                    id={`ot-pago-${i}`}
                    valor={p.importe}
                    onCambio={(importe) =>
                      cambiar({
                        pagos: o.pagos.map((x, j) =>
                          j === i ? { ...x, importe } : x,
                        ),
                      })
                    }
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-stone-500">Recibo</span>
                  <input
                    value={p.recibo}
                    onChange={(e) =>
                      cambiar({
                        pagos: o.pagos.map((x, j) =>
                          j === i ? { ...x, recibo: e.target.value } : x,
                        ),
                      })
                    }
                    className={campo}
                  />
                </label>
                <button
                  type="button"
                  aria-label="Quitar pago"
                  onClick={() =>
                    cambiar({ pagos: o.pagos.filter((_, j) => j !== i) })
                  }
                  className="rounded-md px-2 py-1.5 text-red-700 hover:bg-red-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-sm">
            Cobrado {$(cobrado(o))} · <strong>Saldo {$(saldo(o))}</strong>
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-md bg-marca px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar orden"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Cobro({
  orden,
  onGuardar,
  onCerrar,
}: {
  orden: OrdenTrabajo;
  onGuardar: (o: OrdenTrabajo) => Promise<void>;
  onCerrar: () => void;
}) {
  const [fecha, setFecha] = useState(hoyIso());
  const [importe, setImporte] = useState(Math.max(0, saldo(orden)));
  const [recibo, setRecibo] = useState("");
  const [guardando, setGuardando] = useState(false);
  return (
    <Modal
      titulo={`Registrar un pago · ${orden.numero}`}
      subtitulo={`${orden.cliente} · saldo ${$(saldo(orden))}`}
      onCerrar={onCerrar}
      ancho="max-w-md"
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!importe) return;
          setGuardando(true);
          try {
            await onGuardar({
              ...orden,
              pagos: [...orden.pagos, { fecha, importe, recibo }],
            });
          } finally {
            setGuardando(false);
          }
        }}
      >
        <label className="block text-xs">
          <span className="text-stone-500">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className={campo}
          />
        </label>
        <label className="block text-xs">
          <span className="text-stone-500">Importe</span>
          <Numero id="cobro-importe" valor={importe} onCambio={setImporte} />
        </label>
        <label className="block text-xs">
          <span className="text-stone-500">Recibo (opcional)</span>
          <input
            id="cobro-recibo"
            value={recibo}
            onChange={(e) => setRecibo(e.target.value)}
            className={campo}
          />
        </label>
        <p className="text-sm text-stone-600">
          Después de este pago le queda debiendo{" "}
          <strong>{$(saldo(orden) - importe)}</strong>.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || !importe}
            className="rounded-md bg-marca px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Guardar pago
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Importar({
  existentes,
  onImportar,
  onCerrar,
}: {
  existentes: OrdenTrabajo[];
  onImportar: (p: PlanillaOrdenes) => Promise<void>;
  onCerrar: () => void;
}) {
  const [planilla, setPlanilla] = useState<PlanillaOrdenes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const yaEstan = useMemo(
    () => new Set(existentes.map(claveOrden)),
    [existentes],
  );
  const [cuales, setCuales] = useState<"curso" | "sinTerminar" | "todas">(
    "curso",
  );
  const sinRepetir = planilla?.ordenes.filter(
    (o) => !yaEstan.has(claveOrden(o)),
  );
  const sinTerminar = sinRepetir?.filter((o) => o.estado !== "Terminado");
  const abiertas = sinRepetir?.filter(enCurso);
  const nuevas =
    cuales === "curso"
      ? abiertas
      : cuales === "sinTerminar"
        ? sinTerminar
        : sinRepetir;
  return (
    <Modal
      titulo="Pasar la planilla Excel al sistema"
      subtitulo="Seguimiento de órdenes de trabajo (hojas Trabajos y Clientes)"
      onCerrar={onCerrar}
      ancho="max-w-xl"
    >
      <div className="space-y-3 text-sm">
        <p className="text-stone-600">
          Elegí la planilla. Se cargan las órdenes con sus pagos y la lista de
          clientes con domicilio y teléfono. Si la volvés a subir más adelante,
          solo se agregan las órdenes que todavía no estaban.
        </p>
        <input
          id="ot-archivo"
          type="file"
          accept=".xlsx"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError(null);
            setPlanilla(null);
            setTrabajando(true);
            try {
              const p = await leerArchivoOrdenes(await f.arrayBuffer());
              if (!p.ordenes.length && !p.clientes.length)
                setError(
                  "No encontré órdenes en esta planilla. ¿Es la de seguimiento de órdenes de trabajo?",
                );
              else setPlanilla(p);
            } catch (err) {
              setError(
                `No pude leer el archivo (${err instanceof Error ? err.message : err}).`,
              );
            } finally {
              setTrabajando(false);
            }
          }}
          className="block w-full text-sm"
        />
        {trabajando && <p className="text-stone-500">Leyendo la planilla…</p>}
        {error && <p className="text-red-700">{error}</p>}
        {planilla && nuevas && (
          <div className="rounded-xl bg-stone-50 p-3">
            <p>
              Encontré <strong>{planilla.ordenes.length}</strong> órdenes
              {planilla.ordenes.length !== nuevas.length && (
                <> ({planilla.ordenes.length - nuevas.length} ya estaban)</>
              )}{" "}
              y <strong>{planilla.clientes.length}</strong> clientes.
            </p>
            <fieldset className="mt-2 space-y-1.5">
              <legend className="mb-1 font-medium">¿Qué órdenes traigo?</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="ot-cuales"
                  value="curso"
                  className="mt-1"
                  checked={cuales === "curso"}
                  onChange={() => setCuales("curso")}
                />
                <span>
                  Las que siguen en curso: sin terminar o con saldo por cobrar (
                  <strong>{abiertas?.length ?? 0}</strong>)
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="ot-cuales"
                  value="sinTerminar"
                  className="mt-1"
                  checked={cuales === "sinTerminar"}
                  onChange={() => setCuales("sinTerminar")}
                />
                <span>
                  Solo las que no están terminadas (
                  <strong>{sinTerminar?.length ?? 0}</strong>)
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="ot-cuales"
                  value="todas"
                  className="mt-1"
                  checked={cuales === "todas"}
                  onChange={() => setCuales("todas")}
                />
                <span>
                  Todas, también las terminadas y cobradas (
                  <strong>{sinRepetir?.length ?? 0}</strong>)
                </span>
              </label>
            </fieldset>
            <p className="mt-2 text-stone-600">
              Se van a agregar <strong>{nuevas.length}</strong> órdenes.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md px-4 py-2 text-stone-600 hover:bg-stone-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!planilla || trabajando}
            onClick={async () => {
              if (!planilla || !nuevas) return;
              setTrabajando(true);
              setError(null);
              try {
                await onImportar({ ...planilla, ordenes: nuevas });
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setTrabajando(false);
              }
            }}
            className="rounded-md bg-marca px-5 py-2 font-medium text-white disabled:opacity-50"
          >
            {trabajando && planilla ? "Cargando…" : "Pasar al sistema"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Tarjeta({
  titulo,
  valor,
  nota,
  alerta,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${alerta ? "border-red-200 bg-red-50" : "border-stone-200/80 bg-white"}`}
    >
      <p className="text-xs text-stone-500">{titulo}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums sm:text-xl">
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-xs text-stone-500">{nota}</p>}
    </div>
  );
}

/** Seguimiento de órdenes de trabajo de una unidad que fabrica a pedido (Fabriestant). */
export function OrdenesTrabajo({
  repo,
  empresaId,
  empresa,
  unidades,
}: {
  repo: Repositorio;
  empresaId: string;
  empresa: string;
  /** Las unidades que llevan órdenes de trabajo. */
  unidades: Unidad[];
}) {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[] | null>(null);
  const [fichas, setFichas] = useState<ClientePlanilla[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("ordenes");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [mes, setMes] = useState("");
  const [buscar, setBuscar] = useState("");
  const [limite, setLimite] = useState(50);
  const [editando, setEditando] = useState<OrdenTrabajo | null>(null);
  const [cobrando, setCobrando] = useState<OrdenTrabajo | null>(null);
  const [importando, setImportando] = useState(false);
  const unidad = unidades[0];
  const hoy = hoyIso();

  const recargar = async () => {
    try {
      const [o, f] = await Promise.all([
        repo.ordenesTrabajo(empresaId),
        repo.fichasClientes(empresaId),
      ]);
      setOrdenes(o);
      setFichas(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, empresaId]);

  const lista = useMemo(() => ordenes ?? [], [ordenes]);
  const nombresClientes = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const n of [
      ...fichas.map((f) => f.nombre),
      ...lista.map((o) => o.cliente),
    ])
      if (n.trim() && !vistos.has(n.trim().toLowerCase()))
        vistos.set(n.trim().toLowerCase(), n.trim());
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [fichas, lista]);
  const tipos = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const t of [...lista.map((o) => o.tipo), ...TIPOS_TRABAJO])
      if (t.trim() && !vistos.has(t.trim().toLowerCase()))
        vistos.set(t.trim().toLowerCase(), t.trim());
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [lista]);
  const meses = useMemo(() => resumenPorMes(lista), [lista]);
  const saldos = useMemo(() => saldosPorCliente(lista), [lista]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return lista.filter((o) => {
      if (mes && !o.fecha.startsWith(mes)) return false;
      if (filtro === "pendientes" && o.estado === "Terminado") return false;
      if (filtro === "en curso" && !enCurso(o)) return false;
      if (filtro === "con saldo" && saldo(o) <= 1) return false;
      if (
        q &&
        ![o.numero, o.cliente, o.tipo, o.detalle].some((x) =>
          x.toLowerCase().includes(q),
        )
      )
        return false;
      return true;
    });
  }, [lista, mes, filtro, buscar, hoy]);

  const mesActual = meses.find((m) => m.mes === hoy.slice(0, 7));
  const enProceso = lista.filter((o) => o.estado === "En proceso").length;
  const sinEmpezar = lista.filter((o) => o.estado === "No empezado").length;
  const aCobrar = saldos.reduce((t, s) => t + s.saldo, 0);

  const guardar = async (o: OrdenTrabajo) => {
    setError(null);
    try {
      const id = await repo.guardarOrden(empresaId, {
        ...o,
        unidadId: o.unidadId ?? unidad?.id ?? null,
      });
      const nombre = o.cliente.trim();
      if (
        nombre &&
        !fichas.some((f) => f.nombre.toLowerCase() === nombre.toLowerCase())
      ) {
        const ficha = {
          nombre,
          cuit: "",
          domicilio: "",
          localidad: "",
          telefono: "",
          email: "",
        };
        await repo.guardarFichasClientes(empresaId, [ficha]);
        setFichas((f) => [...f, ficha]);
      }
      setOrdenes((l) => [
        { ...o, id },
        ...(l ?? []).filter((x) => x.id !== id),
      ]);
      setEditando(null);
      setCobrando(null);
      setAviso(`Orden ${o.numero || ""} guardada.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const cambiarEstado = async (o: OrdenTrabajo, estado: EstadoOrden) => {
    setOrdenes((l) =>
      (l ?? []).map((x) => (x.id === o.id ? { ...x, estado } : x)),
    );
    try {
      await repo.guardarOrden(empresaId, { ...o, estado });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      recargar();
    }
  };

  const ordenadas = useMemo(
    () =>
      [...filtradas].sort((a, b) =>
        a.fecha === b.fecha
          ? b.numero.localeCompare(a.numero)
          : b.fecha.localeCompare(a.fecha),
      ),
    [filtradas],
  );

  const pestaña = (v: Vista, texto: string) => (
    <button
      type="button"
      onClick={() => setVista(v)}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${vista === v ? "bg-marca text-white" : "bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"}`}
    >
      {texto}
    </button>
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            Órdenes de trabajo{unidad ? ` · ${unidad.nombre}` : ""}
          </h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Los pedidos de la fábrica: qué se pidió, cuánto sale, cuánto se va
            en materiales, en qué estado está y lo que pagó cada cliente.
          </p>
          <p className="mt-2 max-w-3xl rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Es para control de la fábrica: no genera asientos ni se suma a la
            contabilidad. Los cobros se siguen registrando como siempre (banco o
            Cobros y pagos), así no se duplica nada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditando(nuevaOrden(lista, hoy))}
            className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            ＋ Nueva orden
          </button>
          <button
            type="button"
            onClick={() => setImportando(true)}
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50"
          >
            Pasar planilla Excel
          </button>
          <button
            type="button"
            disabled={!lista.length}
            onClick={async () =>
              descargar(
                await excelOrdenes(
                  mes || filtro !== "todas" || buscar ? filtradas : lista,
                  empresa,
                  unidad?.nombre ?? "",
                ),
                `Ordenes de trabajo ${unidad?.nombre ?? ""} ${hoy}.xlsx`,
              )
            }
            className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50 disabled:opacity-40"
          >
            ⬇ Excel
          </button>
        </div>
      </section>

      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>
      )}
      {aviso && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {aviso}
        </p>
      )}

      {ordenes === null ? (
        <p className="text-stone-500">Cargando las órdenes…</p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta
              titulo="En proceso"
              valor={String(enProceso)}
              nota="Se están fabricando"
            />
            <Tarjeta
              titulo="Sin empezar"
              valor={String(sinEmpezar)}
              nota="Pedidos que todavía no arrancaron"
            />
            <Tarjeta
              titulo="Falta cobrar"
              valor={$(aCobrar)}
              nota={`${saldos.length} clientes con saldo`}
            />
            <Tarjeta
              titulo={`Pedidos de ${nombrePeriodo(hoy.slice(0, 7))}`}
              valor={$(mesActual?.total ?? 0)}
              nota={`Materiales ${$(mesActual?.materiales ?? 0)} · Mano de obra ${$(mesActual?.manoDeObra ?? 0)}`}
            />
          </section>

          <div className="flex flex-wrap gap-2">
            {pestaña("ordenes", "Órdenes")}
            {pestaña("meses", "Resumen por mes")}
            {pestaña("saldos", "Quién debe")}
            {pestaña("clientes", "Clientes")}
          </div>

          {vista === "ordenes" && (
            <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <input
                  id="ot-buscar"
                  value={buscar}
                  onChange={(e) => {
                    setBuscar(e.target.value);
                    setLimite(50);
                  }}
                  placeholder="Buscar por cliente, número o trabajo"
                  className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                />
                <select
                  id="ot-filtro"
                  value={filtro}
                  onChange={(e) => {
                    setFiltro(e.target.value as FiltroEstado);
                    setLimite(50);
                  }}
                  className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="todas">Todas</option>
                  <option value="pendientes">Sin terminar</option>
                  <option value="en curso">
                    En curso (sin terminar o con saldo)
                  </option>
                  <option value="con saldo">Con saldo a cobrar</option>
                </select>
                <select
                  id="ot-mes"
                  value={mes}
                  onChange={(e) => {
                    setMes(e.target.value);
                    setLimite(50);
                  }}
                  className="rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  <option value="">Todos los meses</option>
                  {meses.map((m) => (
                    <option key={m.mes} value={m.mes}>
                      {nombrePeriodo(m.mes)}
                    </option>
                  ))}
                </select>
              </div>
              {ordenadas.length === 0 ? (
                <p className="mt-4 text-sm text-stone-500">
                  {lista.length
                    ? "No hay órdenes con ese filtro."
                    : "Todavía no hay órdenes. Cargá la primera o pasá la planilla Excel."}
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                        <th className="py-2 pr-2">Pedido</th>
                        <th className="pr-2">Cliente y trabajo</th>
                        <th className="pr-2 text-right">Total</th>
                        <th className="pr-2 text-right">Materiales</th>
                        <th className="pr-2 text-right">Saldo</th>
                        <th className="pr-2">Estado</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {ordenadas.slice(0, limite).map((o) => {
                        const debe = saldo(o);
                        return (
                          <tr
                            key={o.id}
                            className="border-b border-stone-100 align-top"
                          >
                            <td className="py-2 pr-2 tabular-nums">
                              <div className="font-medium">
                                {o.numero || "—"}
                              </div>
                              <div className="text-xs text-stone-500">
                                {fechaCorta(o.fecha)}
                              </div>
                              {o.ot && (
                                <div className="text-xs text-stone-500">
                                  OT {o.ot}
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-2">
                              <div className="font-medium">
                                {o.cliente || "Sin nombre"}
                              </div>
                              <div className="text-xs text-stone-500">
                                {[
                                  o.tipo,
                                  o.detalle,
                                  o.cantidad ? `× ${o.cantidad}` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {$(o.total)}
                              {o.conFactura && (
                                <div className="text-xs text-stone-500">
                                  con factura
                                </div>
                              )}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {$(o.materiales)}
                              <div className="text-xs text-stone-500">
                                MO {$(manoDeObra(o))}
                              </div>
                            </td>
                            <td
                              className={`py-2 pr-2 text-right tabular-nums ${debe > 1 ? "font-semibold text-marca" : "text-stone-400"}`}
                            >
                              {$(debe)}
                            </td>
                            <td className="py-2 pr-2">
                              <select
                                aria-label={`Estado de ${o.numero}`}
                                value={o.estado}
                                onChange={(e) =>
                                  cambiarEstado(
                                    o,
                                    e.target.value as EstadoOrden,
                                  )
                                }
                                className={`rounded-full border-0 px-2 py-1 text-xs font-medium ${COLOR_ESTADO[o.estado]}`}
                              >
                                {ESTADOS_ORDEN.map((x) => (
                                  <option key={x}>{x}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {debe > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setCobrando(o)}
                                  className="rounded-md border border-marca px-2 py-1 text-xs font-medium text-marca"
                                >
                                  $ Pago
                                </button>
                              )}{" "}
                              <button
                                type="button"
                                onClick={() => setEditando(o)}
                                className="rounded-md px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                aria-label={`Eliminar ${o.numero}`}
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `¿Eliminar la orden ${o.numero} de ${o.cliente}?`,
                                    )
                                  )
                                    return;
                                  try {
                                    await repo.borrarOrden(o.id!);
                                    setOrdenes((l) =>
                                      (l ?? []).filter((x) => x.id !== o.id),
                                    );
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : String(e),
                                    );
                                  }
                                }}
                                className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                              >
                                🗑
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-stone-500">
                    {Math.min(limite, ordenadas.length)} de {ordenadas.length}{" "}
                    órdenes · total{" "}
                    {$(ordenadas.reduce((t, o) => t + o.total, 0))} · saldo{" "}
                    {$(
                      ordenadas.reduce((t, o) => t + Math.max(0, saldo(o)), 0),
                    )}
                  </p>
                  {ordenadas.length > limite && (
                    <button
                      type="button"
                      onClick={() => setLimite((l) => l + 100)}
                      className="mt-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
                    >
                      Mostrar más
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {vista === "meses" && (
            <section className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                    <th className="py-2">Mes</th>
                    <th className="text-right">Pedidos</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Materiales</th>
                    <th className="text-right">Mano de obra</th>
                    <th className="text-right">Cobrado</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr
                      key={m.mes}
                      className="cursor-pointer border-b border-stone-100 tabular-nums hover:bg-stone-50"
                      onClick={() => {
                        setMes(m.mes);
                        setFiltro("todas");
                        setVista("ordenes");
                      }}
                    >
                      <td className="py-1.5 capitalize">
                        {nombrePeriodo(m.mes)}
                      </td>
                      <td className="text-right">{m.cantidad}</td>
                      <td className="text-right">{$(m.total)}</td>
                      <td className="text-right">{$(m.materiales)}</td>
                      <td className="text-right">{$(m.manoDeObra)}</td>
                      <td className="text-right">{$(m.cobrado)}</td>
                      <td className="text-right">{$(m.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-stone-500">
                Tocá un mes para ver sus órdenes.
              </p>
            </section>
          )}

          {vista === "saldos" && (
            <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              {saldos.length === 0 ? (
                <p className="text-sm text-stone-500">Nadie debe nada. 🎉</p>
              ) : (
                <ul className="divide-y divide-stone-100 text-sm">
                  {saldos.map((s) => {
                    const ficha = fichas.find(
                      (f) => f.nombre.toLowerCase() === s.cliente.toLowerCase(),
                    );
                    return (
                      <li
                        key={s.cliente}
                        className="flex flex-wrap items-center justify-between gap-2 py-2"
                      >
                        <div>
                          <p className="font-medium">{s.cliente}</p>
                          <p className="text-xs text-stone-500">
                            {s.ordenes} {s.ordenes === 1 ? "orden" : "órdenes"}{" "}
                            con saldo · última {fechaCorta(s.ultima)}
                            {ficha?.telefono ? ` · Tel. ${ficha.telefono}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold tabular-nums text-marca">
                            {$(s.saldo)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setBuscar(s.cliente);
                              setFiltro("con saldo");
                              setMes("");
                              setVista("ordenes");
                            }}
                            className="rounded-md border border-stone-300 px-2 py-1 text-xs"
                          >
                            Ver órdenes
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {vista === "clientes" && (
            <Clientes
              fichas={fichas}
              ordenes={lista}
              onVer={(nombre) => {
                setBuscar(nombre);
                setFiltro("todas");
                setMes("");
                setVista("ordenes");
              }}
            />
          )}
        </>
      )}

      {editando && (
        <Formulario
          inicial={editando}
          clientes={nombresClientes}
          tipos={tipos}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
      {cobrando && (
        <Cobro
          orden={cobrando}
          onGuardar={guardar}
          onCerrar={() => setCobrando(null)}
        />
      )}
      {importando && (
        <Importar
          existentes={lista}
          onCerrar={() => setImportando(false)}
          onImportar={async (p) => {
            await repo.importarOrdenes(
              empresaId,
              p.ordenes.map((o) => ({ ...o, unidadId: unidad?.id ?? null })),
            );
            // No se pisan los datos de contacto que ya estaban cargados.
            const conocidos = new Set(
              fichas.map((f) => f.nombre.toLowerCase()),
            );
            await repo.guardarFichasClientes(
              empresaId,
              p.clientes.filter((c) => !conocidos.has(c.nombre.toLowerCase())),
            );
            setImportando(false);
            setAviso(
              `Listo: se agregaron ${p.ordenes.length} órdenes y la lista de clientes.`,
            );
            await recargar();
          }}
        />
      )}
    </div>
  );
}

function Clientes({
  fichas,
  ordenes,
  onVer,
}: {
  fichas: ClientePlanilla[];
  ordenes: OrdenTrabajo[];
  onVer: (nombre: string) => void;
}) {
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(60);
  const cantidad = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of ordenes) {
      const k = o.cliente.trim().toLowerCase();
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [ordenes]);
  const lista = fichas.filter((f) =>
    [f.nombre, f.localidad, f.telefono, f.email].some((x) =>
      x.toLowerCase().includes(q.trim().toLowerCase()),
    ),
  );
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar cliente"
        className="w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm"
      />
      {lista.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">
          No hay clientes cargados. Se agregan solos al cargar una orden o al
          pasar la planilla.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100 text-sm">
          {lista.slice(0, limite).map((f) => (
            <li
              key={f.nombre}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div>
                <p className="font-medium">{f.nombre}</p>
                <p className="text-xs text-stone-500">
                  {[
                    [f.domicilio, f.localidad].filter(Boolean).join(", "),
                    f.telefono && `Tel. ${f.telefono}`,
                    f.email,
                    f.cuit && `CUIT ${f.cuit}`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sin datos de contacto"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onVer(f.nombre)}
                className="rounded-md border border-stone-300 px-2 py-1 text-xs"
              >
                {cantidad.get(f.nombre.toLowerCase()) ?? 0} órdenes
              </button>
            </li>
          ))}
        </ul>
      )}
      {lista.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + 100)}
          className="mt-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
        >
          Mostrar más
        </button>
      )}
    </section>
  );
}
