"use client";

import { useState } from "react";
import { fechaCorta, pesos } from "@/lib/formato";
import { leerPlanDePago } from "@/lib/planes/leer-plan";
import { cuotasDelPlan, type PlanPago } from "@/lib/vencimientos/vencimientos";

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function numero(t: string) {
  const s = t.trim();
  const limpio = /,\d{1,2}$/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s.replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const NUEVO: PlanPago = {
  organismo: "ARCA",
  numero: "",
  descripcion: "",
  cuotas: 6,
  primeraCuota: mesActual(),
  importeCuota: 0,
  diaVencimiento: null,
  cuotasPagadas: [],
  estado: "vigente",
};

function Formulario({
  inicial,
  onGuardar,
  onCancelar,
}: {
  inicial: PlanPago;
  onGuardar: (p: PlanPago) => Promise<void>;
  onCancelar: () => void;
}) {
  const [p, setP] = useState(inicial);
  const [importe, setImporte] = useState(
    inicial.importeCuota ? String(inicial.importeCuota).replace(".", ",") : "",
  );
  const [error, setError] = useState<string | null>(null);
  const campo =
    "mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!(p.cuotas >= 1)) return setError("Indicá la cantidad de cuotas.");
        setError(null);
        try {
          await onGuardar({ ...p, importeCuota: numero(importe) });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
      className="space-y-3 rounded-xl border border-marca/30 bg-white p-5 shadow-sm"
    >
      <h3 className="font-semibold">
        {inicial.id ? "Editar plan" : "Nuevo plan de pago"}
      </h3>
      {p.detalleCuotas?.length ? (
        <p className="rounded-md bg-emerald-50 p-2 text-sm text-emerald-900">
          ✓ Leído del PDF: {p.detalleCuotas.length} cuotas, del{" "}
          {fechaCorta(p.detalleCuotas[0].fecha)} al{" "}
          {fechaCorta(p.detalleCuotas[p.detalleCuotas.length - 1].fecha)}, con
          el importe exacto de cada una. Revisá los datos y guardá.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-stone-600">Organismo</span>
          <input
            id="plan-organismo"
            list="plan-organismos"
            value={p.organismo}
            onChange={(e) => setP({ ...p, organismo: e.target.value })}
            className={campo}
          />
          <datalist id="plan-organismos">
            {[
              "ARCA",
              "Rentas Jujuy",
              "ARBA",
              "AGIP",
              "Rentas Córdoba",
              "Rentas Salta",
              "Municipalidad",
            ].map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Número de plan</span>
          <input
            id="plan-numero"
            value={p.numero}
            onChange={(e) => setP({ ...p, numero: e.target.value })}
            placeholder="K123456"
            className={campo}
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Qué incluye</span>
          <input
            id="plan-descripcion"
            value={p.descripcion}
            onChange={(e) => setP({ ...p, descripcion: e.target.value })}
            placeholder="IVA enero a junio 2026"
            className={campo}
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Cantidad de cuotas</span>
          <input
            id="plan-cuotas"
            type="number"
            min={1}
            max={240}
            value={p.cuotas}
            onChange={(e) => setP({ ...p, cuotas: Number(e.target.value) })}
            className={campo}
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Mes de la primera cuota</span>
          <input
            id="plan-primera"
            type="month"
            value={p.primeraCuota}
            onChange={(e) =>
              e.target.value && setP({ ...p, primeraCuota: e.target.value })
            }
            className={campo}
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Importe de la cuota (aprox.)</span>
          <input
            id="plan-importe"
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0,00"
            className={`${campo} text-right tabular-nums`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Día de vencimiento</span>
          <select
            id="plan-dia"
            value={p.diaVencimiento ?? ""}
            onChange={(e) =>
              setP({
                ...p,
                diaVencimiento: e.target.value ? Number(e.target.value) : null,
              })
            }
            className={`${campo} bg-white`}
          >
            <option value="">Según calendario de Mis Facilidades (ARCA)</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Día {d} de cada mes
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Estado</span>
          <select
            id="plan-estado"
            value={p.estado}
            onChange={(e) =>
              setP({ ...p, estado: e.target.value as PlanPago["estado"] })
            }
            className={`${campo} bg-white`}
          >
            <option value="vigente">Vigente</option>
            <option value="cancelado">Cancelado (terminado)</option>
            <option value="caducado">Caducado</option>
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white"
        >
          Guardar plan
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

/** Planes de pago (Mis Facilidades y provinciales) con sus cuotas. */
export function PlanesPago({
  planes,
  puedeEditar,
  cuitEmpresa,
  onGuardar,
  onBorrar,
}: {
  planes: PlanPago[];
  puedeEditar: boolean;
  /** Para avisar si el PDF es de otro contribuyente. */
  cuitEmpresa?: string;
  onGuardar: (p: PlanPago) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<PlanPago | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const hoyIso = hoy();

  async function subirPdf(archivo: File) {
    setError(null);
    setAviso(null);
    setLeyendo(true);
    try {
      const { leerPdf } = await import("@/lib/pdf/abrir");
      const lineas = (await leerPdf(archivo)).map((l) => l.texto);
      const leido = leerPlanDePago(lineas);
      if (!leido)
        throw new Error(
          "No reconocí el PDF: por ahora se leen los planes de Mis Facilidades (ARCA) y de Rentas Jujuy.",
        );
      if (cuitEmpresa && leido.cuit && leido.cuit !== cuitEmpresa)
        setAviso(
          `Ojo: el plan es del CUIT ${leido.cuit} y esta empresa es ${cuitEmpresa}. Revisá que estés en la empresa correcta antes de guardar.`,
        );
      const primera = leido.cuotas[0];
      const existente = planes.find(
        (p) => p.numero === leido.numero && p.organismo === leido.organismo,
      );
      setEditando({
        ...(existente ?? NUEVO),
        organismo: leido.organismo,
        numero: leido.numero,
        descripcion: leido.descripcion || existente?.descripcion || "",
        cuotas: leido.cuotas.length,
        primeraCuota: primera.fecha.slice(0, 7),
        importeCuota: primera.importe,
        diaVencimiento: Number(primera.fecha.slice(8, 10)),
        detalleCuotas: leido.cuotas,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  }

  async function marcar(p: PlanPago, cuota: number, pagada: boolean) {
    setError(null);
    try {
      await onGuardar({
        ...p,
        cuotasPagadas: pagada
          ? [...new Set([...p.cuotasPagadas, cuota])].sort((a, b) => a - b)
          : p.cuotasPagadas.filter((n) => n !== cuota),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <section>
          <h1 className="text-2xl font-semibold">Planes de pago</h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Los planes de Mis Facilidades de ARCA y los provinciales, con cada
            cuota y su vencimiento. Las cuotas aparecen en los vencimientos, en
            los avisos al cliente y, si quedan sin pagar, en rojo.
          </p>
        </section>
        {puedeEditar && !editando && (
          <div className="flex flex-wrap gap-2">
            <label className="cursor-pointer rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              {leyendo ? "Leyendo el PDF…" : "Subir PDF del plan"}
              <input
                id="plan-pdf"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) subirPdf(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setEditando(NUEVO)}
              className="rounded-md border border-marca px-4 py-2 text-sm font-medium text-marca hover:bg-marca-claro"
            >
              + Cargar a mano
            </button>
          </div>
        )}
      </div>

      {aviso && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {aviso}
        </p>
      )}
      {editando && (
        <Formulario
          key={editando.id ?? "nuevo"}
          inicial={editando}
          onGuardar={async (p) => {
            await onGuardar(p);
            setEditando(null);
            setAviso(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {planes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          No hay planes de pago cargados.
        </p>
      ) : (
        planes.map((p) => {
          const cuotas = cuotasDelPlan(p);
          const pagadas = p.cuotasPagadas.length;
          const proxima = cuotas.find((c) => !c.pagada);
          return (
            <section
              key={p.id}
              className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
                <div>
                  <h3 className="font-semibold">
                    {p.organismo} {p.numero && `· Plan ${p.numero}`}
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-xs ${p.estado === "vigente" ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-600"}`}
                    >
                      {p.estado}
                    </span>
                  </h3>
                  <p className="text-sm text-stone-500">
                    {p.descripcion || "Sin descripción"} · {pagadas} de{" "}
                    {p.cuotas} cuotas pagadas
                    {proxima &&
                      p.estado === "vigente" &&
                      ` · próxima: cuota ${proxima.numero} el ${fechaCorta(proxima.fecha)}`}
                  </p>
                </div>
                {puedeEditar && (
                  <div className="flex gap-1 text-sm">
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm("¿Borrar este plan de pago?")) return;
                        try {
                          await onBorrar(p.id!);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                      className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100"
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-4 py-2">Cuota</th>
                      <th className="px-4 py-2">Vence</th>
                      <th className="px-4 py-2 text-right">Importe</th>
                      {cuotas.some((c) => c.fecha2) && (
                        <th className="px-4 py-2 text-right">2° vencimiento</th>
                      )}
                      <th className="px-4 py-2 text-right">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {cuotas.map((c) => {
                      const vencida =
                        !c.pagada && c.fecha < hoyIso && p.estado === "vigente";
                      return (
                        <tr
                          key={c.numero}
                          className={vencida ? "bg-red-50" : undefined}
                        >
                          <td className="px-4 py-1.5">
                            {c.numero} de {p.cuotas}
                          </td>
                          <td className="px-4 py-1.5 tabular-nums">
                            {fechaCorta(c.fecha)}
                          </td>
                          <td className="cifra px-4 py-1.5">
                            {c.importe ? pesos(c.importe) : "—"}
                          </td>
                          {cuotas.some((x) => x.fecha2) && (
                            <td className="px-4 py-1.5 text-right text-xs tabular-nums text-stone-500">
                              {c.fecha2
                                ? `${fechaCorta(c.fecha2)} · ${pesos(c.importe2 ?? 0)}`
                                : ""}
                            </td>
                          )}
                          <td className="px-4 py-1.5 text-right">
                            {puedeEditar ? (
                              <label className="inline-flex items-center gap-1.5">
                                <input
                                  type="checkbox"
                                  aria-label={`Cuota ${c.numero} pagada`}
                                  checked={c.pagada}
                                  onChange={(e) =>
                                    marcar(p, c.numero, e.target.checked)
                                  }
                                />
                                <span
                                  className={
                                    c.pagada
                                      ? "text-emerald-700"
                                      : vencida
                                        ? "font-medium text-red-700"
                                        : "text-stone-500"
                                  }
                                >
                                  {c.pagada
                                    ? "Pagada"
                                    : vencida
                                      ? "Vencida"
                                      : "Pendiente"}
                                </span>
                              </label>
                            ) : (
                              <span
                                className={
                                  c.pagada
                                    ? "text-emerald-700"
                                    : vencida
                                      ? "font-medium text-red-700"
                                      : "text-stone-500"
                                }
                              >
                                {c.pagada
                                  ? "Pagada"
                                  : vencida
                                    ? "Vencida"
                                    : "Pendiente"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
