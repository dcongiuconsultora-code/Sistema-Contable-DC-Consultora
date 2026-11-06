"use client";

import { useState } from "react";
import type { CuentaCorriente, Lado } from "@/lib/cuentas/cuenta-corriente";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";

interface Props {
  clientes: CuentaCorriente[];
  proveedores: CuentaCorriente[];
  fechaCorte: string;
}

const TEXTOS: Record<
  Lado,
  {
    titulo: string;
    total: string;
    cargo: string;
    abono: string;
    aFavor: string;
  }
> = {
  cliente: {
    titulo: "Clientes",
    total: "Total a cobrar",
    cargo: "Facturado",
    abono: "Cobrado",
    aFavor: "Saldo a favor del cliente",
  },
  proveedor: {
    titulo: "Proveedores",
    total: "Total a pagar",
    cargo: "Facturado",
    abono: "Pagado",
    aFavor: "Saldo a favor nuestro",
  },
};

function sumar(cuentas: CuentaCorriente[], f: (c: CuentaCorriente) => number) {
  return Math.round(cuentas.reduce((s, c) => s + f(c), 0) * 100) / 100;
}

function Detalle({
  cuenta,
  onCerrar,
}: {
  cuenta: CuentaCorriente;
  onCerrar: () => void;
}) {
  const t = TEXTOS[cuenta.lado];
  return (
    <section className="overflow-hidden rounded-xl border-2 border-marca bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h3 className="font-semibold">{cuenta.nombre}</h3>
          <p className="text-sm text-stone-500">
            {cuenta.cuit
              ? `CUIT ${cuitConGuiones(cuenta.cuit)}`
              : "Sin CUIT: cargado solo por nombre"}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-stone-500">
            Saldo
          </div>
          <div
            className={`cifra text-xl font-semibold ${cuenta.saldo < 0 ? "text-emerald-700" : ""}`}
          >
            {pesos(cuenta.saldo)}
          </div>
          {cuenta.saldo < 0 && (
            <div className="text-xs text-emerald-700">{t.aFavor}</div>
          )}
        </div>
      </div>

      {cuenta.pendientes.length > 0 && (
        <div className="border-b border-stone-200 px-4 py-3">
          <h4 className="mb-2 text-sm font-semibold">
            Comprobantes pendientes
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1 pr-3">Fecha</th>
                  <th className="py-1 pr-3">Comprobante</th>
                  <th className="py-1 pr-3 text-right">Total</th>
                  <th className="py-1 pr-3 text-right">Pendiente</th>
                  <th className="py-1 text-right">Días</th>
                </tr>
              </thead>
              <tbody>
                {cuenta.pendientes.map((p) => (
                  <tr key={p.descripcion + p.fecha}>
                    <td className="py-1 pr-3">{fechaCorta(p.fecha)}</td>
                    <td className="py-1 pr-3">{p.descripcion}</td>
                    <td className="cifra py-1 pr-3">{pesos(p.total)}</td>
                    <td className="cifra py-1 pr-3 font-medium">
                      {pesos(p.pendiente)}
                    </td>
                    <td
                      className={`cifra py-1 ${p.dias > 60 ? "font-medium text-red-700" : p.dias > 30 ? "text-amber-700" : ""}`}
                    >
                      {p.dias}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Concepto</th>
              <th className="px-4 py-2 text-right">{t.cargo}</th>
              <th className="px-4 py-2 text-right">{t.abono}</th>
              <th className="px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {cuenta.items.map((i, n) => (
              <tr key={n}>
                <td className="whitespace-nowrap px-4 py-2">
                  {fechaCorta(i.fecha)}
                </td>
                <td className="px-4 py-2">
                  {i.descripcion}
                  <span className="ml-2 text-xs text-stone-500">
                    {i.origen === "Cliente"
                      ? "cargado por el cliente"
                      : i.origen === "Banco"
                        ? "desde el banco"
                        : i.origen === "Ticket"
                          ? "ticket"
                          : "ARCA"}
                  </span>
                  {i.sinAprobar && (
                    <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                      sin aprobar
                    </span>
                  )}
                </td>
                <td className="cifra px-4 py-2">
                  {i.cargo ? pesos(i.cargo) : ""}
                </td>
                <td className="cifra px-4 py-2">
                  {i.abono ? pesos(i.abono) : ""}
                </td>
                <td className="cifra px-4 py-2 font-medium">
                  {pesos(i.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-stone-200 px-4 py-2 text-right">
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cerrar
        </button>
      </div>
    </section>
  );
}

export function CuentasCorrientes({
  clientes,
  proveedores,
  fechaCorte,
}: Props) {
  const [lado, setLado] = useState<Lado>("cliente");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [soloConSaldo, setSoloConSaldo] = useState(true);
  const cuentas = lado === "cliente" ? clientes : proveedores;
  const t = TEXTOS[lado];
  const visibles = cuentas.filter(
    (c) => !soloConSaldo || Math.abs(c.saldo) > 0.005,
  );
  const detalle = cuentas.find((c) => c.clave === abierta) ?? null;

  const total = sumar(cuentas, (c) => Math.max(0, c.saldo));
  const mas30 = sumar(
    cuentas,
    (c) => c.antiguedad.hasta60 + c.antiguedad.hasta90 + c.antiguedad.mas90,
  );
  const mas90 = sumar(cuentas, (c) => c.antiguedad.mas90);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-stone-200/70 p-1 text-sm">
          {(["cliente", "proveedor"] as Lado[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLado(l);
                setAbierta(null);
              }}
              className={`rounded-md px-3 py-1.5 font-medium ${lado === l ? "bg-white text-marca shadow-sm" : "text-stone-600"}`}
            >
              {TEXTOS[l].titulo} (
              {(l === "cliente" ? clientes : proveedores).length})
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            id="solo-con-saldo"
            type="checkbox"
            checked={soloConSaldo}
            onChange={(e) => setSoloConSaldo(e.target.checked)}
          />
          Solo con saldo
        </label>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          [t.total, total, ""],
          ["Con más de 30 días", mas30, "text-amber-700"],
          ["Con más de 90 días", mas90, "text-red-700"],
        ].map(([titulo, valor, clase]) => (
          <div
            key={titulo as string}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="text-xs uppercase tracking-wide text-stone-500">
              {titulo}
            </div>
            <div
              className={`cifra mt-1 text-left text-xl font-semibold ${clase}`}
            >
              {pesos(valor as number)}
            </div>
          </div>
        ))}
      </section>

      {detalle && (
        <Detalle cuenta={detalle} onCerrar={() => setAbierta(null)} />
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {visibles.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            {cuentas.length === 0
              ? `Todavía no hay ${lado === "cliente" ? "clientes" : "proveedores"}: se arman con Mis Comprobantes de ARCA, los tickets y los cobros y pagos cargados.`
              : "No hay cuentas con saldo."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">
                    {lado === "cliente" ? "Cliente" : "Proveedor"}
                  </th>
                  <th className="px-4 py-2 text-right">Hasta 30 días</th>
                  <th className="px-4 py-2 text-right">31 a 60</th>
                  <th className="px-4 py-2 text-right">61 a 90</th>
                  <th className="px-4 py-2 text-right">Más de 90</th>
                  <th className="px-4 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibles.map((c) => (
                  <tr
                    key={c.clave}
                    onClick={() =>
                      setAbierta(c.clave === abierta ? null : c.clave)
                    }
                    className={`cursor-pointer hover:bg-stone-50 ${c.clave === abierta ? "bg-marca-claro" : ""}`}
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.nombre}</div>
                      <div className="text-xs text-stone-500">
                        {c.cuit ? cuitConGuiones(c.cuit) : "sin CUIT"}
                      </div>
                    </td>
                    <td className="cifra px-4 py-2">
                      {c.antiguedad.hasta30 ? pesos(c.antiguedad.hasta30) : ""}
                    </td>
                    <td className="cifra px-4 py-2">
                      {c.antiguedad.hasta60 ? pesos(c.antiguedad.hasta60) : ""}
                    </td>
                    <td className="cifra px-4 py-2 text-amber-700">
                      {c.antiguedad.hasta90 ? pesos(c.antiguedad.hasta90) : ""}
                    </td>
                    <td className="cifra px-4 py-2 text-red-700">
                      {c.antiguedad.mas90 ? pesos(c.antiguedad.mas90) : ""}
                    </td>
                    <td
                      className={`cifra px-4 py-2 font-semibold ${c.saldo < 0 ? "text-emerald-700" : ""}`}
                    >
                      {pesos(c.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500">
          Antigüedad al {fechaCorta(fechaCorte)}. Los cobros y pagos cancelan
          primero los comprobantes más viejos. Hacé clic en una fila para ver el
          detalle.
        </p>
      </section>
    </div>
  );
}
