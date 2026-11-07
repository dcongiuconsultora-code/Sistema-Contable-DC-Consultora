"use client";

import { useEffect, useState } from "react";
import type { Repositorio } from "@/lib/datos/repositorio";
import type { Unidad } from "@/lib/unidades/unidades";

/** "2, 3" → [2, 3] */
function numeros(texto: string) {
  return [
    ...new Set(
      texto
        .split(/[,\s;]+/)
        .map((x) => Number(x))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

/** "3-152-0942499576-9, 4-152-..." → lista de cuentas */
function cuentas(texto: string) {
  return [
    ...new Set(
      texto
        .split(/[,;\n]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ];
}

function FilaUnidad({
  unidad,
  onGuardar,
  onBorrar,
}: {
  unidad: Unidad | null;
  onGuardar: (u: Omit<Unidad, "id"> & { id?: string }) => Promise<void>;
  onBorrar?: () => void;
}) {
  const [nombre, setNombre] = useState(unidad?.nombre ?? "");
  const [pv, setPv] = useState(unidad?.puntosVenta.join(", ") ?? "");
  const [ctas, setCtas] = useState(unidad?.cuentasBancarias.join(", ") ?? "");
  const [guardando, setGuardando] = useState(false);
  const cambiado =
    !unidad ||
    nombre !== unidad.nombre ||
    pv !== unidad.puntosVenta.join(", ") ||
    ctas !== unidad.cuentasBancarias.join(", ");
  const id = unidad?.id ?? "nueva";
  return (
    <form
      className="grid gap-2 py-2 sm:grid-cols-[1.2fr_1fr_1.6fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        const datos = {
          id: unidad?.id,
          nombre,
          puntosVenta: numeros(pv),
          cuentasBancarias: cuentas(ctas),
        };
        // La fila para agregar se vacía enseguida, así se puede cargar la siguiente mientras guarda.
        if (!unidad) {
          setNombre("");
          setPv("");
          setCtas("");
        }
        setGuardando(true);
        await onGuardar(datos);
        setGuardando(false);
      }}
    >
      <label className="block text-xs">
        <span className="text-stone-500">Nombre</span>
        <input
          id={`unidad-nombre-${id}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Minimarket"
          className="mt-0.5 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="block text-xs">
        <span className="text-stone-500">Puntos de venta</span>
        <input
          id={`unidad-pv-${id}`}
          value={pv}
          onChange={(e) => setPv(e.target.value)}
          placeholder="2, 5"
          className="mt-0.5 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <label className="block text-xs">
        <span className="text-stone-500">
          Cuentas bancarias propias (número como en el resumen)
        </span>
        <input
          id={`unidad-cuentas-${id}`}
          value={ctas}
          onChange={(e) => setCtas(e.target.value)}
          placeholder="4-152-0960684459-7"
          className="mt-0.5 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
        />
      </label>
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={!cambiado || guardando || !nombre.trim()}
          className="rounded-md border border-marca px-3 py-1.5 text-sm font-medium text-marca disabled:opacity-40"
        >
          {unidad ? "Guardar" : "Agregar"}
        </button>
        {onBorrar && (
          <button
            type="button"
            onClick={onBorrar}
            className="rounded-md px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
          >
            Quitar
          </button>
        )}
      </div>
    </form>
  );
}

/** Unidades de negocio de una empresa (para clientes que llevan cada negocio por separado). */
export function UnidadesEmpresa({
  repo,
  empresaId,
}: {
  repo: Repositorio;
  empresaId: string;
}) {
  const [unidades, setUnidades] = useState<Unidad[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = () =>
    repo.unidades(empresaId).then(setUnidades, (e) => setError(e.message));
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, empresaId]);

  const guardar = async (u: Omit<Unidad, "id"> & { id?: string }) => {
    try {
      setError(null);
      await repo.guardarUnidad(empresaId, u);
      await recargar();
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      setError(
        /duplicate|unique/i.test(mensaje)
          ? "Ya hay una unidad con ese nombre."
          : mensaje,
      );
    }
  };

  return (
    <div className="mt-3 space-y-1 text-sm">
      <p className="text-stone-600">
        Solo si la empresa lleva negocios por separado. Las ventas se asignan
        por punto de venta y el banco por cuenta (si una cuenta la comparten
        varias unidades, dejala vacía: los cobros y pagos llevan la unidad que
        se elige al cargarlos). A cada proveedor se le asigna su unidad en ARCA
        → Unidades.
      </p>
      {unidades === null ? (
        <p className="text-stone-500">Cargando…</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {unidades.map((u) => (
            <FilaUnidad
              key={u.id}
              unidad={u}
              onGuardar={guardar}
              onBorrar={async () => {
                try {
                  await repo.borrarUnidad(u.id);
                  await recargar();
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                }
              }}
            />
          ))}
          <FilaUnidad unidad={null} onGuardar={guardar} />
        </div>
      )}
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}
