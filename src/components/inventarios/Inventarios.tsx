"use client";

import { useState } from "react";
import { leerArchivo } from "@/lib/arca/leer-archivo";
import { fechaCorta, pesos } from "@/lib/formato";
import {
  type Inventario,
  inventarioDesdeFilas,
  modeloExcelInventario,
  type LineaInventario,
  RUBROS_STOCK,
  totalesPorCuenta,
  totalLinea,
} from "@/lib/inventarios/inventarios";
import { nombreCuenta } from "@/lib/plan/plan";
import { type ConfigUnidades, nombreUnidad } from "@/lib/unidades/unidades";

function finDeMes() {
  const d = new Date();
  const fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, "0")}-${String(fin.getDate()).padStart(2, "0")}`;
}

function numero(texto: string) {
  const t = texto.trim();
  if (!t) return 0;
  const limpio = /,\d{1,4}$/.test(t)
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t.replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

interface LineaForm {
  cuenta: string;
  producto: string;
  cantidad: string;
  medida: string;
  costo: string;
}

const aForm = (l: LineaInventario): LineaForm => ({
  cuenta: l.cuenta,
  producto: l.producto,
  cantidad: String(l.cantidad).replace(".", ","),
  medida: l.medida ?? "",
  costo: String(l.costo).replace(".", ","),
});

async function descargarModelo() {
  const archivo = await modeloExcelInventario();
  const url = URL.createObjectURL(new Blob([archivo]));
  const a = document.createElement("a");
  a.href = url;
  a.download = "Modelo de inventario.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function Editor({
  inicial,
  unidades,
  rubroPorDefecto,
  onGuardar,
  onCancelar,
}: {
  inicial: Inventario | null;
  unidades: ConfigUnidades;
  rubroPorDefecto: string;
  onGuardar: (i: Inventario) => Promise<void>;
  onCancelar: () => void;
}) {
  const [fecha, setFecha] = useState(inicial?.fecha ?? finDeMes());
  const [unidad, setUnidad] = useState(inicial?.unidad ?? "");
  const [descripcion, setDescripcion] = useState(inicial?.descripcion ?? "");
  const vacia = (): LineaForm => ({
    cuenta: rubroPorDefecto,
    producto: "",
    cantidad: "",
    medida: "",
    costo: "",
  });
  const [lineas, setLineas] = useState<LineaForm[]>(
    inicial?.lineas.length
      ? inicial.lineas.map(aForm)
      : [vacia(), vacia(), vacia()],
  );
  const [avisos, setAvisos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const armadas: LineaInventario[] = lineas
    .filter((l) => l.producto.trim() && numero(l.cantidad))
    .map((l) => ({
      cuenta: l.cuenta,
      producto: l.producto.trim(),
      cantidad: numero(l.cantidad),
      medida: l.medida.trim() || undefined,
      costo: numero(l.costo),
    }));
  const inv: Inventario = {
    id: inicial?.id,
    fecha,
    unidad: unidad || null,
    descripcion: descripcion.trim(),
    lineas: armadas,
  };
  const totales = totalesPorCuenta(inv);
  const total = Object.values(totales).reduce((s, v) => s + v, 0);
  const cambiar = (i: number, campo: keyof LineaForm, v: string) =>
    setLineas(lineas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));

  async function importar(archivo: File) {
    try {
      const { lineas: leidas, errores } = inventarioDesdeFilas(
        await leerArchivo(archivo),
        rubroPorDefecto,
      );
      setLineas([
        ...lineas.filter((l) => l.producto.trim()),
        ...leidas.map(aForm),
      ]);
      setAvisos([
        `Se leyeron ${leidas.length} productos de ${archivo.name}.`,
        ...errores,
      ]);
    } catch (e) {
      setAvisos([e instanceof Error ? e.message : String(e)]);
    }
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!armadas.length)
          return setAvisos(["Cargá al menos un producto con cantidad."]);
        setGuardando(true);
        try {
          await onGuardar(inv);
        } catch (err) {
          setAvisos([err instanceof Error ? err.message : String(err)]);
        } finally {
          setGuardando(false);
        }
      }}
      className="space-y-3 rounded-xl border border-marca/30 bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">
        {inicial ? "Editar inventario" : "Nuevo inventario"}
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-stone-600">Fecha del conteo</span>
          <input
            id="inv-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        {unidades.unidades.length > 0 && (
          <label className="block text-sm">
            <span className="text-stone-600">Unidad</span>
            <select
              id="inv-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5"
            >
              <option value="">Toda la empresa</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block min-w-48 flex-1 text-sm">
          <span className="text-stone-600">Nota (opcional)</span>
          <input
            id="inv-descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Conteo de fin de mes"
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
          />
        </label>
        <label className="cursor-pointer rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50">
          Importar de Excel
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="text-xs text-stone-500">
        Usá el{" "}
        <button
          type="button"
          onClick={descargarModelo}
          className="font-medium text-marca underline"
        >
          modelo de Excel
        </button>{" "}
        (Rubro, Producto, Cantidad, Unidad de medida, Costo unitario). También
        sirve el Excel que exporte el sistema de caja si tiene columnas de
        producto, cantidad y costo.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="py-1">Rubro</th>
              <th className="py-1">Producto</th>
              <th className="py-1 text-right">Cantidad</th>
              <th className="py-1">Medida</th>
              <th className="py-1 text-right">Costo unitario</th>
              <th className="py-1 text-right">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="py-1 pr-1">
                  <select
                    aria-label="Rubro"
                    value={l.cuenta}
                    onChange={(e) => cambiar(i, "cuenta", e.target.value)}
                    className="rounded-md border border-stone-300 bg-white px-1 py-1"
                  >
                    {RUBROS_STOCK.map((r) => (
                      <option key={r.cuenta} value={r.cuenta}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1 pr-1">
                  <input
                    id={`inv-producto-${i}`}
                    value={l.producto}
                    onChange={(e) => cambiar(i, "producto", e.target.value)}
                    className="w-full min-w-40 rounded-md border border-stone-300 px-2 py-1"
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    id={`inv-cantidad-${i}`}
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => cambiar(i, "cantidad", e.target.value)}
                    className="w-24 rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    aria-label="Medida"
                    value={l.medida}
                    onChange={(e) => cambiar(i, "medida", e.target.value)}
                    placeholder="u, kg"
                    className="w-16 rounded-md border border-stone-300 px-2 py-1"
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    id={`inv-costo-${i}`}
                    inputMode="decimal"
                    value={l.costo}
                    onChange={(e) => cambiar(i, "costo", e.target.value)}
                    className="w-28 rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                  />
                </td>
                <td className="cifra py-1">
                  {pesos(numero(l.cantidad) * numero(l.costo))}
                </td>
                <td>
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
                    className="rounded px-1.5 text-stone-400 hover:bg-stone-100"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => setLineas([...lineas, vacia()])}
        className="text-sm font-medium text-marca"
      >
        + Agregar producto
      </button>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-stone-200 pt-2 text-sm">
        {Object.entries(totales).map(([c, v]) => (
          <span key={c}>
            {nombreCuenta(c)}:{" "}
            <strong className="tabular-nums">{pesos(v)}</strong>
          </span>
        ))}
        <span className="ml-auto font-semibold">Total: {pesos(total)}</span>
      </div>
      {avisos.length > 0 && (
        <ul className="text-sm text-amber-800">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar inventario
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

/** Conteos de stock valuados, por fecha y unidad. Se usan como existencia final en los estados. */
export function Inventarios({
  inventarios,
  unidades,
  onGuardar,
  onBorrar,
}: {
  inventarios: Inventario[];
  unidades: ConfigUnidades;
  onGuardar: (i: Inventario) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<Inventario | "nuevo" | null>(null);
  const [rubro, setRubro] = useState<string>(RUBROS_STOCK[0].cuenta);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <section>
          <h1 className="text-2xl font-semibold">Inventarios y existencias</h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Una vez por mes (o al cierre) se carga el conteo de stock valuado al
            costo: a mano o subiendo un Excel. En los comercios es mercadería de
            reventa; en la fábrica, materia prima, producción en proceso y
            productos terminados. El estudio lo usa como existencia final para
            calcular el costo de lo vendido en los balances anuales e
            intermedios.
          </p>
        </section>
        {!editando && (
          <div className="flex items-center gap-2">
            <select
              aria-label="Rubro principal"
              value={rubro}
              onChange={(e) => setRubro(e.target.value)}
              className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
            >
              {RUBROS_STOCK.map((r) => (
                <option key={r.cuenta} value={r.cuenta}>
                  {r.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={descargarModelo}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-50"
            >
              Descargar modelo de Excel
            </button>
            <button
              type="button"
              onClick={() => setEditando("nuevo")}
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Nuevo inventario
            </button>
          </div>
        )}
      </div>

      {editando && (
        <Editor
          key={editando === "nuevo" ? "nuevo" : editando.id}
          inicial={editando === "nuevo" ? null : editando}
          unidades={unidades}
          rubroPorDefecto={rubro}
          onGuardar={async (i) => {
            await onGuardar(i);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {inventarios.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Todavía no hay inventarios cargados.
        </p>
      ) : (
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                {unidades.unidades.length > 0 && (
                  <th className="px-3 py-2">Unidad</th>
                )}
                <th className="px-3 py-2">Detalle</th>
                <th className="px-3 py-2 text-right">Valor</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {inventarios.map((inv) => {
                const t = totalesPorCuenta(inv);
                return (
                  <tr key={inv.id}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {fechaCorta(inv.fecha)}
                    </td>
                    {unidades.unidades.length > 0 && (
                      <td className="px-3 py-2">
                        {inv.unidad
                          ? nombreUnidad(inv.unidad, unidades)
                          : "Toda la empresa"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-stone-600">
                      {inv.descripcion && (
                        <div className="text-stone-800">{inv.descripcion}</div>
                      )}
                      {inv.lineas.length} productos ·{" "}
                      {Object.entries(t)
                        .map(([c, v]) => `${nombreCuenta(c)} ${pesos(v)}`)
                        .join(" · ")}
                    </td>
                    <td className="cifra px-3 py-2 font-medium">
                      {pesos(inv.lineas.reduce((s, l) => s + totalLinea(l), 0))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditando(inv)}
                        className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                      >
                        Ver / editar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("¿Borrar este inventario?")) return;
                          try {
                            setError(null);
                            await onBorrar(inv.id!);
                          } catch (e) {
                            setError(
                              e instanceof Error ? e.message : String(e),
                            );
                          }
                        }}
                        className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
