"use client";

import { useMemo } from "react";
import type { Empresa } from "@/lib/datos/repositorio";
import {
  cuotasVencidas,
  detallePlan,
  IMPUESTOS,
  type PlanPago,
  vencimientos,
} from "@/lib/vencimientos/vencimientos";

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function cuando(fecha: string, hoy: string) {
  if (fecha === hoy) return "Hoy";
  if (fecha === sumarDias(hoy, 1)) return "Mañana";
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Lo que le vence a la empresa en los próximos días y las cuotas de planes que quedaron sin pagar. */
export function AlertasCliente({
  empresa,
  planes,
  dias = 15,
}: {
  empresa: Empresa;
  planes: PlanPago[];
  dias?: number;
}) {
  const hoy = hoyIso();
  const proximos = useMemo(
    () =>
      vencimientos([empresa], hoy, sumarDias(hoy, dias), {
        [empresa.id]: planes,
      }).lista,
    [empresa, planes, hoy, dias],
  );
  const vencidas = useMemo(() => cuotasVencidas(planes, hoy), [planes, hoy]);
  if (!proximos.length && !vencidas.length) return null;
  const semana = sumarDias(hoy, 7);

  return (
    <section className="space-y-2">
      {vencidas.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">
            ⚠{" "}
            {vencidas.length === 1
              ? "Hay una cuota vencida"
              : `Hay ${vencidas.length} cuotas vencidas`}{" "}
            de planes de pago sin pagar
          </p>
          <ul className="mt-1 list-inside list-disc">
            {vencidas.slice(0, 5).map(({ plan, cuota }) => (
              <li key={`${plan.id}-${cuota.numero}`}>
                {detallePlan(plan, cuota)} · venció el{" "}
                {new Date(`${cuota.fecha}T12:00:00Z`).toLocaleDateString(
                  "es-AR",
                  { timeZone: "UTC" },
                )}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs">
            Si quedan cuotas impagas el plan puede caducar: avisale al estudio
            si ya la pagaste.
          </p>
        </div>
      )}
      {proximos.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">📅 Próximos vencimientos</p>
          <ul className="mt-1 space-y-0.5">
            {proximos.map((v) => (
              <li
                key={`${v.fecha}-${v.impuesto}-${v.detalle}`}
                className="flex flex-wrap gap-x-2"
              >
                <span
                  className={`w-20 shrink-0 font-medium capitalize ${v.fecha <= semana ? "text-red-700" : ""}`}
                >
                  {cuando(v.fecha, hoy)}
                </span>
                <span>
                  {IMPUESTOS[v.impuesto]}: {v.detalle}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
