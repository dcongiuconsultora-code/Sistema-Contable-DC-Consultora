"use client";

import { useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import { mayor, type SaldosIniciales } from "@/lib/contabilidad/indicadores";
import {
  asientoRefundicionIva,
  revisarAsiento,
  sumasYSaldos,
} from "@/lib/contabilidad/sumas-saldos";
import { fechaCorta, pesos } from "@/lib/formato";
import { nombreCuenta, PLAN_MODELO } from "@/lib/plan/plan";
import { type ConfigUnidades, nombreUnidad } from "@/lib/unidades/unidades";

const IMPUTABLES = PLAN_MODELO.filter((c) => c.imputable);
const ORIGENES = ["Todos", "ARCA", "Cliente", "Banco", "Manual"] as const;

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaSiguiente(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function numero(texto: string) {
  const limpio = texto.replace(/\./g, "").replace(",", ".").trim();
  const n = Number(limpio);
  return limpio && Number.isFinite(n) ? n : 0;
}

interface LineaForm {
  cuenta: string;
  debe: string;
  haber: string;
}

const LINEA_VACIA: LineaForm = { cuenta: "", debe: "", haber: "" };

function etiquetaCuenta(codigo: string) {
  return codigo ? `${codigo} ${nombreCuenta(codigo)}` : "";
}

/** "1.2.05.011 Amortización…" o solo el código → código. */
function codigoDe(texto: string) {
  const codigo = texto.trim().split(/\s+/)[0] ?? "";
  if (IMPUTABLES.some((c) => c.codigo === codigo)) return codigo;
  const porNombre = IMPUTABLES.find(
    (c) => c.nombre.toLowerCase() === texto.trim().toLowerCase(),
  );
  return porNombre?.codigo ?? codigo;
}

function FormAsiento({
  inicial,
  asientos,
  iniciales,
  unidades,
  onGuardar,
  onCancelar,
}: {
  inicial: Asiento | null;
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  unidades: ConfigUnidades;
  onGuardar: (a: Asiento) => Promise<void>;
  onCancelar: () => void;
}) {
  const [fecha, setFecha] = useState(inicial?.fecha ?? hoy());
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const [unidad, setUnidad] = useState<string>(inicial?.unidad ?? "");
  const [lineas, setLineas] = useState<LineaForm[]>(
    inicial
      ? inicial.lineas.map((l) => ({
          cuenta: etiquetaCuenta(l.cuenta),
          debe: l.debe ? String(l.debe).replace(".", ",") : "",
          haber: l.haber ? String(l.haber).replace(".", ",") : "",
        }))
      : [LINEA_VACIA, LINEA_VACIA],
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const armado: Asiento = {
    id: inicial?.id,
    fecha,
    origen: "Manual",
    descripcion: descripcion.trim(),
    unidad: unidad || null,
    lineas: lineas
      .map((l) => {
        const cuenta = codigoDe(l.cuenta);
        return {
          cuenta,
          nombre: nombreCuenta(cuenta),
          debe: numero(l.debe),
          haber: numero(l.haber),
        };
      })
      .filter((l) => l.cuenta && (l.debe || l.haber)),
  };
  const debe = armado.lineas.reduce((s, l) => s + l.debe, 0);
  const haber = armado.lineas.reduce((s, l) => s + l.haber, 0);

  const cambiar = (i: number, campo: keyof LineaForm, valor: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  function refundicionIva() {
    const saldos = mayor(asientos, iniciales, fecha);
    const r = asientoRefundicionIva(saldos);
    if (!r) return setErrores(["No hay saldos de IVA a esa fecha."]);
    setErrores([]);
    setDescripcion(`Refundición de IVA al ${fechaCorta(fecha)}`);
    setLineas(
      r.lineas.map((l) => ({
        cuenta: etiquetaCuenta(l.cuenta),
        debe: l.debe ? String(l.debe).replace(".", ",") : "",
        haber: l.haber ? String(l.haber).replace(".", ",") : "",
      })),
    );
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const problemas = revisarAsiento(armado);
    if (!armado.descripcion) problemas.unshift("Poné una descripción.");
    setErrores(problemas);
    if (problemas.length) return;
    setGuardando(true);
    try {
      await onGuardar(armado);
    } catch (err) {
      setErrores([err instanceof Error ? err.message : String(err)]);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={guardar}
      className="space-y-3 rounded-xl border border-marca/30 bg-white p-5 shadow-sm"
    >
      <datalist id="cuentas-imputables">
        {IMPUTABLES.map((c) => (
          <option key={c.codigo} value={`${c.codigo} ${c.nombre}`} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">
          {inicial ? "Editar asiento" : "Nuevo asiento"}
        </h3>
        <button
          type="button"
          onClick={refundicionIva}
          className="rounded-md border border-stone-300 px-3 py-1 text-sm text-stone-700 hover:bg-stone-50"
        >
          Armar la refundición de IVA a esta fecha
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
        <label className="block text-sm">
          <span className="text-stone-600">Fecha</span>
          <input
            id="asiento-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Descripción</span>
          <input
            id="asiento-descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Amortización de bienes de uso del ejercicio"
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
          />
        </label>
        {unidades.unidades.length > 0 && (
          <label className="block text-sm">
            <span className="text-stone-600">Unidad</span>
            <select
              id="asiento-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5"
            >
              <option value="">Compartido</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1">Cuenta</th>
              <th className="w-36 py-1 text-right">Debe</th>
              <th className="w-36 py-1 text-right">Haber</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <input
                    id={`asiento-cuenta-${i}`}
                    list="cuentas-imputables"
                    value={l.cuenta}
                    onChange={(e) => cambiar(i, "cuenta", e.target.value)}
                    placeholder="Escribí el código o el nombre"
                    className="w-full min-w-56 rounded-md border border-stone-300 px-2 py-1"
                  />
                </td>
                {(["debe", "haber"] as const).map((campo) => (
                  <td key={campo} className="py-1 pl-1">
                    <input
                      id={`asiento-${campo}-${i}`}
                      inputMode="decimal"
                      value={l[campo]}
                      onChange={(e) => cambiar(i, campo, e.target.value)}
                      className="w-full rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                ))}
                <td className="py-1 pl-1">
                  {lineas.length > 2 && (
                    <button
                      type="button"
                      aria-label="Quitar renglón"
                      onClick={() =>
                        setLineas(lineas.filter((_, j) => j !== i))
                      }
                      className="rounded px-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-1.5">
                <button
                  type="button"
                  onClick={() => setLineas([...lineas, LINEA_VACIA])}
                  className="text-sm font-medium text-marca"
                >
                  + Agregar renglón
                </button>
              </td>
              <td className="cifra py-1.5">{pesos(debe)}</td>
              <td className="cifra py-1.5">{pesos(haber)}</td>
              <td />
            </tr>
            {Math.abs(debe - haber) > 0.005 && (
              <tr>
                <td colSpan={3} className="text-right text-xs text-amber-700">
                  Diferencia: {pesos(debe - haber)}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
      {errores.length > 0 && (
        <ul className="list-inside list-disc text-sm text-red-700">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Guardar asiento
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

async function descargarSumasSaldos(
  ss: ReturnType<typeof sumasYSaldos>,
  empresa: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sumas y saldos");
  ws.columns = [
    { width: 14 },
    { width: 48 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
  ];
  ws.addRow([`${empresa} · Balance de sumas y saldos`]).font = {
    bold: true,
    size: 13,
  };
  ws.addRow([`Del ${fechaCorta(ss.desde)} al ${fechaCorta(ss.hasta)}`]);
  ws.addRow([]);
  const enc = ws.addRow([
    "Código",
    "Cuenta",
    "Saldo anterior",
    "Debe",
    "Haber",
    "Saldo deudor",
    "Saldo acreedor",
  ]);
  enc.font = { bold: true };
  for (const f of ss.filas)
    ws.addRow([
      f.codigo,
      f.nombre,
      f.anterior,
      f.debe,
      f.haber,
      f.saldo > 0 ? f.saldo : null,
      f.saldo < 0 ? -f.saldo : null,
    ]);
  const primera = 5;
  const ultima = primera + ss.filas.length - 1;
  const total = ws.addRow(["", "Totales"]);
  total.font = { bold: true };
  for (const col of ["D", "E", "F", "G"])
    ws.getCell(`${col}${total.number}`).value = {
      formula: `SUM(${col}${primera}:${col}${ultima})`,
    };
  for (const col of [3, 4, 5, 6, 7])
    ws.getColumn(col).numFmt = "#,##0.00;[Red]-#,##0.00";
  const archivo = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([archivo]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Sumas y saldos ${empresa} ${ss.desde} a ${ss.hasta}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Libro diario completo, asientos manuales y balance de sumas y saldos. */
export function LibroDiario({
  asientos,
  iniciales,
  unidades,
  empresa,
  onGuardar,
  onBorrar,
}: {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  unidades: ConfigUnidades;
  empresa: string;
  onGuardar: (a: Asiento) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const inicioEjercicio = iniciales.fecha ? diaSiguiente(iniciales.fecha) : "";
  const [vista, setVista] = useState<"sumas" | "diario">("sumas");
  const [desde, setDesde] = useState(inicioEjercicio);
  const [hasta, setHasta] = useState(hoy());
  const [origen, setOrigen] = useState<(typeof ORIGENES)[number]>("Todos");
  const [buscar, setBuscar] = useState("");
  const [cantidad, setCantidad] = useState(100);
  const [editando, setEditando] = useState<Asiento | null | "nuevo">(null);
  const [error, setError] = useState<string | null>(null);

  const desdeEfectivo = desde || inicioEjercicio || "1900-01-01";
  const ss = useMemo(
    () => sumasYSaldos(asientos, iniciales, desdeEfectivo, hasta),
    [asientos, iniciales, desdeEfectivo, hasta],
  );
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return asientos.filter(
      (a) =>
        a.fecha >= desdeEfectivo &&
        a.fecha <= hasta &&
        (origen === "Todos" || a.origen === origen) &&
        (!q ||
          a.descripcion.toLowerCase().includes(q) ||
          a.lineas.some(
            (l) => l.cuenta.startsWith(q) || l.nombre.toLowerCase().includes(q),
          )),
    );
  }, [asientos, desdeEfectivo, hasta, origen, buscar]);

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold">Libro diario</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          Todos los asientos: los que arma el sistema solo (ARCA, cobros y
          pagos, banco) y los que cargás a mano (ajustes, amortizaciones,
          refundiciones). El balance de sumas y saldos sale de cualquier
          período, para el balance anual o uno intermedio.
        </p>
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-stone-600">Desde</span>
          <input
            id="diario-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Hasta</span>
          <input
            id="diario-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
          {(
            [
              ["sumas", "Sumas y saldos"],
              ["diario", "Asientos"],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1 ${vista === id ? "bg-white font-medium shadow-sm" : "text-stone-600"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setEditando("nuevo")}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Nuevo asiento
        </button>
      </div>
      {!iniciales.fecha && (
        <p className="text-sm text-amber-700">
          Sin saldos de inicio cargados: el saldo anterior de cada cuenta
          arranca en cero.
        </p>
      )}

      {editando && (
        <FormAsiento
          key={editando === "nuevo" ? "nuevo" : editando.id}
          inicial={editando === "nuevo" ? null : editando}
          asientos={asientos}
          iniciales={iniciales}
          unidades={unidades}
          onGuardar={async (a) => {
            await onGuardar(a);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {vista === "sumas" ? (
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
            <h3 className="font-semibold">
              Balance de sumas y saldos · {fechaCorta(desdeEfectivo)} al{" "}
              {fechaCorta(hasta)}
            </h3>
            <button
              type="button"
              onClick={() => descargarSumasSaldos(ss, empresa)}
              className="rounded-md border border-marca px-3 py-1 text-sm font-medium text-marca hover:bg-marca-claro"
            >
              Descargar Excel
            </button>
          </div>
          <div className="max-h-[40rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Cuenta</th>
                  <th className="px-3 py-2 text-right">Saldo anterior</th>
                  <th className="px-3 py-2 text-right">Debe</th>
                  <th className="px-3 py-2 text-right">Haber</th>
                  <th className="px-3 py-2 text-right">Saldo deudor</th>
                  <th className="px-3 py-2 text-right">Saldo acreedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {ss.filas.map((f) => (
                  <tr key={f.codigo}>
                    <td className="px-3 py-1.5">
                      <span className="text-stone-400 tabular-nums">
                        {f.codigo}
                      </span>{" "}
                      {f.nombre}
                    </td>
                    <td className="cifra px-3 py-1.5 text-stone-500">
                      {f.anterior ? pesos(f.anterior) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {f.debe ? pesos(f.debe) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {f.haber ? pesos(f.haber) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {f.saldo > 0 ? pesos(f.saldo) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {f.saldo < 0 ? pesos(-f.saldo) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-stone-50 font-semibold">
                <tr>
                  <td className="px-3 py-2">Totales</td>
                  <td />
                  <td className="cifra px-3 py-2">{pesos(ss.totales.debe)}</td>
                  <td className="cifra px-3 py-2">{pesos(ss.totales.haber)}</td>
                  <td className="cifra px-3 py-2">
                    {pesos(ss.totales.deudor)}
                  </td>
                  <td className="cifra px-3 py-2">
                    {pesos(ss.totales.acreedor)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {Math.abs(ss.totales.deudor - ss.totales.acreedor) > 0.005 && (
            <p className="border-t border-stone-200 px-4 py-2 text-sm text-amber-700">
              ⚠ Los saldos deudores y acreedores no cierran (
              {pesos(ss.totales.deudor - ss.totales.acreedor)}): revisá los
              saldos de inicio.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              id="diario-origen"
              aria-label="Origen"
              value={origen}
              onChange={(e) =>
                setOrigen(e.target.value as (typeof ORIGENES)[number])
              }
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
            >
              {ORIGENES.map((o) => (
                <option key={o} value={o}>
                  {o === "Todos" ? "Todos los orígenes" : o}
                </option>
              ))}
            </select>
            <input
              id="diario-buscar"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por descripción o cuenta"
              className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            />
            <span className="self-center text-sm text-stone-500">
              {filtrados.length} asientos
            </span>
          </div>
          {filtrados.slice(0, cantidad).map((a, i) => (
            <article
              key={a.id ?? `${a.fecha}-${i}`}
              className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">
                  {fechaCorta(a.fecha)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-xs ${a.origen === "Manual" ? "bg-marca-claro text-marca" : "bg-stone-100 text-stone-600"}`}
                >
                  {a.origen}
                </span>
                <span className="min-w-0 flex-1 truncate">{a.descripcion}</span>
                {unidades.unidades.length > 0 && (
                  <span className="text-xs text-stone-500">
                    {nombreUnidad(a.unidad ?? null, unidades)}
                  </span>
                )}
                {a.origen === "Manual" && a.id && (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditando(a)}
                      className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("¿Borrar este asiento?")) return;
                        try {
                          setError(null);
                          await onBorrar(a.id!);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                      className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                    >
                      Borrar
                    </button>
                  </span>
                )}
              </div>
              <table className="mt-1 w-full text-sm">
                <tbody>
                  {a.lineas.map((l, j) => (
                    <tr key={j} className="text-stone-700">
                      <td className={`py-0.5 ${l.haber ? "pl-8" : ""}`}>
                        <span className="text-stone-400 tabular-nums">
                          {l.cuenta}
                        </span>{" "}
                        {l.nombre}
                      </td>
                      <td className="cifra w-36 py-0.5">
                        {l.debe ? pesos(l.debe) : ""}
                      </td>
                      <td className="cifra w-36 py-0.5">
                        {l.haber ? pesos(l.haber) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
          {filtrados.length > cantidad && (
            <button
              type="button"
              onClick={() => setCantidad(cantidad + 100)}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-sm"
            >
              Ver 100 más
            </button>
          )}
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
