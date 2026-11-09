"use client";

import { useEffect, useState } from "react";
import { JURISDICCIONES } from "@/lib/arca/retenciones";
import { cuitConGuiones, pesos } from "@/lib/formato";
import { validarMovimiento } from "@/lib/movimientos/asiento";
import {
  MEDIOS,
  type Movimiento,
  type RetencionSufrida,
} from "@/lib/movimientos/tipos";
import type { ConfigUnidades } from "@/lib/unidades/unidades";
import {
  type CuentaBancaria,
  medioDeCuenta,
  nombreCuentaBancaria,
} from "@/lib/cuentas-bancarias/cuentas";

/** Lo que se quiere cobrar o pagar: un comprobante o el saldo de una cuenta corriente. */
export interface PedidoCobroPago {
  tipo: "cobro" | "pago_proveedor";
  contraparte: string;
  cuit: string;
  importe: number;
  /** Comprobante o comprobantes que se cancelan (va en la nota). */
  referencia: string;
  unidad?: string | null;
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function numero(t: string) {
  const s = t.trim();
  if (!s) return 0;
  const limpio = /,\d{1,2}$/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(s)
      ? s.replace(/\./g, "")
      : s.replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

const formato = (n: number) =>
  n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Registrar el cobro de una factura emitida o el pago de una recibida: en efectivo o por banco.
 * Los que van por banco se concilian solos cuando se sube el resumen.
 */
export function CobrarPagar({
  pedido,
  esEstudio,
  unidades,
  cuentas = [],
  onRegistrar,
  onCerrar,
}: {
  pedido: PedidoCobroPago;
  esEstudio: boolean;
  unidades: ConfigUnidades;
  cuentas?: CuentaBancaria[];
  onRegistrar: (m: Movimiento) => void;
  onCerrar: () => void;
}) {
  const esCobro = pedido.tipo === "cobro";
  const [fecha, setFecha] = useState(hoy());
  const [medio, setMedio] = useState("efectivo");
  const [importe, setImporteEscrito] = useState(formato(pedido.importe));
  const [importeEditado, setImporteEditado] = useState(false);
  const setImporte = (v: string) => {
    setImporteEditado(true);
    setImporteEscrito(v);
  };
  const [ret, setRet] = useState<Record<RetencionSufrida["impuesto"], string>>({
    IVA: "",
    Ganancias: "",
    IIBB: "",
  });
  const [jurisdiccion, setJurisdiccion] = useState("");
  const [unidad, setUnidad] = useState(pedido.unidad ?? "");
  const [errores, setErrores] = useState<string[]>([]);

  const retenciones: RetencionSufrida[] = esCobro
    ? (["IVA", "Ganancias", "IIBB"] as const)
        .map((impuesto) => ({
          impuesto,
          importe: numero(ret[impuesto]),
          ...(impuesto === "IIBB" ? { jurisdiccion } : {}),
        }))
        .filter((r) => r.importe > 0)
    : [];
  const totalRet = retenciones.reduce((s, r) => s + r.importe, 0);
  // Mientras no se toque el importe, lo cobrado es el pendiente menos las retenciones.
  useEffect(() => {
    if (!importeEditado)
      setImporteEscrito(formato(Math.max(0, pedido.importe - totalRet)));
  }, [totalRet, importeEditado, pedido.importe]);
  const neto = numero(importe);

  function registrar(e: React.FormEvent) {
    e.preventDefault();
    const cuenta = cuentas.find((c) => `cuenta:${c.id}` === medio);
    const m: Movimiento = {
      id: crypto.randomUUID(),
      tipo: pedido.tipo,
      fecha,
      importe: neto,
      medio: cuenta ? medioDeCuenta(cuenta) : medio,
      cuentaBancaria: cuenta?.id,
      contraparte: pedido.contraparte || "Consumidor final",
      cuitContraparte: pedido.cuit,
      retenciones: esCobro ? retenciones : undefined,
      nota: `${esCobro ? "Cobro" : "Pago"} de ${pedido.referencia}`,
      estado: esEstudio ? "aprobado" : "enviado",
      origen: "cliente",
      unidad: unidad || undefined,
    };
    // El CUIT viene del comprobante (no lo escribe nadie): no se vuelve a controlar acá.
    const problemas = [
      ...validarMovimiento(m).filter((e) => !/CUIT/.test(e)),
      ...(unidades.unidades.length && !unidad
        ? ["Elegí la unidad de negocio."]
        : []),
    ];
    setErrores(problemas);
    if (!problemas.length) onRegistrar(m);
  }

  return (
    <div
      role="dialog"
      aria-label={esCobro ? "Registrar cobro" : "Registrar pago"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
    >
      <form
        onSubmit={registrar}
        className="max-h-[95vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-white p-5 text-stone-900 shadow-xl sm:rounded-2xl"
      >
        <div>
          <h2 className="text-lg font-semibold">
            {esCobro ? "Registrar cobro" : "Registrar pago"}
          </h2>
          <p className="text-sm text-stone-600">
            {pedido.referencia} · {pedido.contraparte || "Consumidor final"}
            {pedido.cuit && ` · ${cuitConGuiones(pedido.cuit)}`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-stone-600">Fecha</span>
            <input
              id="cp-fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">
              {esCobro ? "Importe cobrado" : "Importe pagado"}
            </span>
            <input
              id="cp-importe"
              inputMode="decimal"
              value={importe}
              onChange={(e) => setImporte(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1.5 text-right tabular-nums"
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm text-stone-600">
            {esCobro ? "¿Cómo te pagaron?" : "¿Cómo pagaste?"}
          </legend>
          <div className="mt-1 grid gap-1.5">
            {[
              ...MEDIOS.filter((m) => m.id === "efectivo"),
              ...cuentas.map((c) => ({
                id: `cuenta:${c.id}`,
                nombre: nombreCuentaBancaria(c),
                bancario: true,
              })),
              ...MEDIOS.filter(
                (m) =>
                  m.id !== "efectivo" &&
                  // Si la empresa cargó sus cuentas, se usan esas en lugar de las genéricas.
                  !(
                    cuentas.length &&
                    ["banco_cc", "banco_ca", "mercadopago"].includes(m.id)
                  ),
              ),
            ].map((m) => (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${medio === m.id ? "border-marca bg-marca-claro" : "border-stone-200"}`}
              >
                <input
                  type="radio"
                  name="medio"
                  value={m.id}
                  checked={medio === m.id}
                  onChange={() => setMedio(m.id)}
                />
                {m.nombre}
              </label>
            ))}
          </div>
          {(medio.startsWith("cuenta:") ||
            MEDIOS.find((m) => m.id === medio)?.bancario) && (
            <p className="mt-1 text-xs text-stone-500">
              Cuando subas el resumen del banco se va a conciliar solo con el
              movimiento del mismo importe.
            </p>
          )}
        </fieldset>

        {esCobro && (
          <details className="rounded-md border border-stone-200 p-3 text-sm">
            <summary className="cursor-pointer">
              ¿Te hicieron retenciones?{" "}
              {totalRet > 0 && (
                <span className="text-stone-500">({pesos(totalRet)})</span>
              )}
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {(["IVA", "Ganancias", "IIBB"] as const).map((i) => (
                <label key={i} className="block">
                  <span className="text-stone-600">{i}</span>
                  <input
                    aria-label={`Retención de ${i}`}
                    inputMode="decimal"
                    value={ret[i]}
                    onChange={(e) => setRet({ ...ret, [i]: e.target.value })}
                    className="mt-1 block w-full rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                  />
                </label>
              ))}
            </div>
            {numero(ret.IIBB) > 0 && (
              <label className="mt-2 block">
                <span className="text-stone-600">
                  Provincia de la retención de IIBB
                </span>
                <select
                  value={jurisdiccion}
                  onChange={(e) => setJurisdiccion(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1"
                >
                  <option value="">Elegí…</option>
                  {Object.entries(JURISDICCIONES).map(([codigo, nombre]) => (
                    <option key={codigo} value={nombre}>
                      {nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="mt-2 text-xs text-stone-500">
              Importe cobrado + retenciones = lo que se cancela de la factura (
              {pesos(neto + totalRet)}).
            </p>
          </details>
        )}

        {unidades.unidades.length > 0 && (
          <label className="block text-sm">
            <span className="text-stone-600">Unidad de negocio</span>
            <select
              id="cp-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5"
            >
              <option value="">Elegí…</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}

        {errores.length > 0 && (
          <ul className="rounded-md bg-red-50 p-2 text-sm text-red-800">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-md bg-marca py-2 font-medium text-white hover:opacity-90"
          >
            {esCobro ? "Registrar cobro" : "Registrar pago"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-md px-4 py-2 text-stone-600 hover:bg-stone-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
