"use client";

import { useMemo, useRef, useState } from "react";
import type { Comprobante } from "@/lib/arca/tipos";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import type { TicketExtraido } from "@/lib/tickets/esquema";
import type { LectorTicket } from "@/lib/tickets/lector";
import { type ConfigUnidades, SIN_UNIDADES } from "@/lib/unidades/unidades";
import { leerQrDeImagen } from "@/lib/tickets/qr";
import {
  claveComprobante,
  combinarConQr,
  revisarTicket,
  ticketAComprobante,
} from "@/lib/tickets/validar";

export interface TicketCargado {
  id: string;
  foto: string; // URL local de la imagen, para mostrarla
  datos: TicketExtraido;
  porQr: boolean;
  /** Unidad de negocio, en empresas que las tienen. */
  unidad?: string;
}

interface Props {
  cuitCliente: string;
  onCuitCliente: (cuit: string) => void;
  /** Recibidos importados de ARCA, para saber qué tickets ya aparecen ahí. */
  comprasArca: Comprobante[];
  tickets: TicketCargado[];
  onTickets: (t: TicketCargado[]) => void;
  /** null: no hay lectura automática disponible y se carga a mano. */
  lector: LectorTicket | null;
  /** Mensaje para mostrar cuando no hay lectura automática. */
  sinLector?: string;
  /** Si se indica, se ofrece probar con una foto de ejemplo. */
  ticketEjemplo?: () => Promise<File>;
  /** Unidades de negocio de la empresa (vacío si no tiene). */
  unidades?: ConfigUnidades;
}

const VACIO: TicketExtraido = {
  legible: true,
  tipoCodigo: 81,
  tipoTexto: "",
  cuitEmisor: "",
  razonSocialEmisor: "",
  cuitReceptor: "",
  puntoVenta: 0,
  numero: 0,
  fecha: "",
  netoGravado21: 0,
  netoGravado105: 0,
  netoGravado27: 0,
  iva21: 0,
  iva105: 0,
  iva27: 0,
  noGravado: 0,
  percepcionIva: 0,
  percepcionIibb: 0,
  otrosTributos: 0,
  total: 0,
  cae: "",
  dudas: [],
};

const TIPOS: [number, string][] = [
  [81, "Tique Factura A"],
  [1, "Factura A"],
  [51, "Factura M"],
  [82, "Tique Factura B"],
  [6, "Factura B"],
  [111, "Tique Factura C"],
  [11, "Factura C"],
  [83, "Tique (consumidor final)"],
  [3, "Nota de Crédito A"],
  [112, "Tique Nota de Crédito A"],
];

type CampoNumero = {
  [K in keyof TicketExtraido]: TicketExtraido[K] extends number ? K : never;
}[keyof TicketExtraido];
type CampoTexto = "cuitEmisor" | "razonSocialEmisor" | "cuitReceptor" | "fecha";

const IMPORTES: [CampoNumero, string][] = [
  ["netoGravado21", "Neto 21%"],
  ["iva21", "IVA 21%"],
  ["netoGravado105", "Neto 10,5%"],
  ["iva105", "IVA 10,5%"],
  ["netoGravado27", "Neto 27%"],
  ["iva27", "IVA 27%"],
  ["noGravado", "No gravado / exento"],
  ["percepcionIva", "Percepción IVA"],
  ["percepcionIibb", "Percepción IIBB"],
  ["otrosTributos", "Otros tributos"],
  ["total", "Total"],
];

function nuevoId() {
  return crypto.randomUUID();
}

export function Tickets({
  cuitCliente,
  onCuitCliente,
  comprasArca,
  tickets,
  onTickets,
  lector,
  sinLector,
  ticketEjemplo,
  unidades = SIN_UNIDADES,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [borrador, setBorrador] = useState<TicketCargado | null>(null);
  const [estado, setEstado] = useState<"" | "leyendo">("");
  const [error, setError] = useState<string | null>(null);

  const enArca = useMemo(
    () => new Set(comprasArca.map(claveComprobante)),
    [comprasArca],
  );

  async function procesar(imagen: File) {
    setError(null);
    const foto = URL.createObjectURL(imagen);
    setEstado("leyendo");
    // El QR de ARCA, si está, da los datos exactos; la lectura de la foto completa el detalle de
    // IVA. Si no hay lectura automática o falla, los datos del QR se cargan igual.
    const qr = await leerQrDeImagen(imagen).catch(() => null);
    let leido: TicketExtraido = { ...VACIO, cuitReceptor: cuitCliente };
    if (lector) {
      try {
        leido = await lector(imagen);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setBorrador({
      id: nuevoId(),
      foto,
      datos: combinarConQr(leido, qr),
      porQr: Boolean(qr),
    });
    setEstado("");
  }

  const revision = borrador
    ? revisarTicket(borrador.datos, cuitCliente || null)
    : null;
  const hayErrores =
    revision?.observaciones.some((o) => o.gravedad === "error") ?? false;
  const faltaUnidad =
    unidades.unidades.length > 0 &&
    borrador !== null &&
    !(borrador.unidad ?? unidades.proveedores[borrador.datos.cuitEmisor]);
  const cambiar = (cambios: Partial<TicketExtraido>) =>
    borrador &&
    setBorrador({ ...borrador, datos: { ...borrador.datos, ...cambios } });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="text-sm">
            <span className="text-stone-600">CUIT del cliente</span>
            <input
              id="cuit-cliente"
              value={cuitCliente}
              onChange={(e) =>
                onCuitCliente(e.target.value.replace(/\D/g, "").slice(0, 11))
              }
              inputMode="numeric"
              placeholder="30711111111"
              className="mt-1 block w-44 rounded-md border border-stone-300 px-3 py-2 tabular-nums focus:border-marca focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={estado === "leyendo"}
            onClick={() => input.current?.click()}
            className="rounded-lg bg-marca px-5 py-3 font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {estado === "leyendo"
              ? "Leyendo el ticket…"
              : "📷 Sacar foto o elegir imagen"}
          </button>
          {ticketEjemplo && (
            <button
              type="button"
              disabled={estado === "leyendo"}
              onClick={async () => procesar(await ticketEjemplo())}
              className="rounded-md border border-marca px-3 py-2 text-sm font-medium text-marca hover:bg-marca-claro disabled:opacity-60"
            >
              Probar con un ticket de ejemplo
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) procesar(archivo);
              e.target.value = "";
            }}
          />
        </div>
        {!lector && sinLector && (
          <p className="mt-3 rounded-md bg-stone-100 p-3 text-sm text-stone-600">
            {sinLector}
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error} Podés completar los datos a mano.
          </p>
        )}
      </section>

      {borrador && revision && (
        <section className="overflow-hidden rounded-xl border-2 border-marca bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
            <h3 className="font-semibold">
              Revisá los datos antes de confirmar
            </h3>
            {borrador.porQr && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                QR de ARCA leído: datos exactos
              </span>
            )}
          </div>
          <div className="grid gap-5 p-4 md:grid-cols-[minmax(0,16rem)_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={borrador.foto}
              alt="Foto del comprobante"
              className="max-h-96 w-full rounded-lg border border-stone-200 object-contain"
            />
            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-stone-600">Tipo</span>
                  <select
                    value={borrador.datos.tipoCodigo}
                    onChange={(e) =>
                      cambiar({
                        tipoCodigo: Number(e.target.value),
                        tipoTexto: "",
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-2"
                  >
                    {!TIPOS.some(([c]) => c === borrador.datos.tipoCodigo) && (
                      <option value={borrador.datos.tipoCodigo}>
                        {borrador.datos.tipoTexto || "Otro"}
                      </option>
                    )}
                    {TIPOS.map(([c, n]) => (
                      <option key={c} value={c}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {(
                  [
                    ["fecha", "Fecha", "date"],
                    ["cuitEmisor", "CUIT del emisor", "text"],
                    ["razonSocialEmisor", "Emisor", "text"],
                    ["cuitReceptor", "CUIT del comprador", "text"],
                  ] as [CampoTexto, string, string][]
                ).map(([campo, etiqueta, tipo]) => (
                  <label key={campo} className="text-sm">
                    <span className="text-stone-600">{etiqueta}</span>
                    <input
                      type={tipo}
                      value={borrador.datos[campo]}
                      onChange={(e) => cambiar({ [campo]: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 focus:border-marca focus:outline-none"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["puntoVenta", "Punto de venta"],
                      ["numero", "Número"],
                    ] as [CampoNumero, string][]
                  ).map(([campo, etiqueta]) => (
                    <label key={campo} className="text-sm">
                      <span className="text-stone-600">{etiqueta}</span>
                      <input
                        inputMode="numeric"
                        value={borrador.datos[campo] || ""}
                        onChange={(e) =>
                          cambiar({
                            [campo]:
                              Number(e.target.value.replace(/\D/g, "")) || 0,
                          })
                        }
                        className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 tabular-nums focus:border-marca focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {IMPORTES.map(([campo, etiqueta]) => (
                  <label
                    key={campo}
                    className={`text-sm ${campo === "total" ? "col-span-2 sm:col-span-1" : ""}`}
                  >
                    <span className="text-stone-600">{etiqueta}</span>
                    <input
                      type="number"
                      step="0.01"
                      value={borrador.datos[campo] || ""}
                      placeholder="0,00"
                      onChange={(e) =>
                        cambiar({ [campo]: Number(e.target.value) || 0 })
                      }
                      className={`mt-1 block w-full rounded-md border px-3 py-2 text-right tabular-nums focus:border-marca focus:outline-none ${campo === "total" ? "border-marca font-semibold" : "border-stone-300"}`}
                    />
                  </label>
                ))}
              </div>
              {unidades.unidades.length > 0 && (
                <label className="block text-sm sm:w-1/2">
                  <span className="text-stone-600">Unidad de negocio</span>
                  <select
                    id="unidad-ticket"
                    value={
                      borrador.unidad ??
                      unidades.proveedores[borrador.datos.cuitEmisor] ??
                      ""
                    }
                    onChange={(e) =>
                      setBorrador({
                        ...borrador,
                        unidad: e.target.value || undefined,
                      })
                    }
                    className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-2"
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
              <div className="space-y-2 text-sm">
                <p
                  className={`font-medium ${revision.computaIva ? "text-emerald-700" : "text-stone-600"}`}
                >
                  {revision.computaIva
                    ? "✓ Genera crédito fiscal de IVA"
                    : "No genera crédito fiscal: se carga como gasto"}
                </p>
                {revision.observaciones.map((o) => (
                  <p
                    key={o.mensaje}
                    className={`rounded-md p-2 ${o.gravedad === "error" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}
                  >
                    {o.mensaje}
                  </p>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={hayErrores || faltaUnidad}
                  onClick={() => {
                    // Si no se eligió, queda la unidad del proveedor.
                    const unidad =
                      borrador.unidad ??
                      unidades.proveedores[borrador.datos.cuitEmisor];
                    onTickets([
                      ...tickets.filter((t) => t.id !== borrador.id),
                      { ...borrador, unidad },
                    ]);
                    setBorrador(null);
                  }}
                  className="rounded-md bg-marca px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirmar ticket
                </button>
                <button
                  type="button"
                  onClick={() => setBorrador(null)}
                  className="rounded-md px-4 py-2 text-stone-600 hover:bg-stone-100"
                >
                  Descartar
                </button>
                {hayErrores && (
                  <span className="self-center text-sm text-red-700">
                    Corregí lo marcado en rojo para confirmar.
                  </span>
                )}
                {!hayErrores && faltaUnidad && (
                  <span className="self-center text-sm text-red-700">
                    Elegí la unidad de negocio.
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
          Tickets cargados ({tickets.length})
        </h3>
        {tickets.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            Todavía no hay tickets. Los que se confirmen se suman al Libro IVA
            Compras hasta que aparezcan en Mis Comprobantes de ARCA.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tickets.map((t) => {
              const c = ticketAComprobante(
                revisarTicket(t.datos, cuitCliente || null),
                0,
              );
              const yaEnArca = enArca.has(claveComprobante(c));
              return (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={t.foto}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded border border-stone-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {c.contraparte || cuitConGuiones(c.cuitContraparte)}
                    </div>
                    <div className="text-xs text-stone-500">
                      {c.tipoNombre} {String(c.puntoVenta).padStart(5, "0")}-
                      {String(c.numeroDesde).padStart(8, "0")} ·{" "}
                      {c.fecha && fechaCorta(c.fecha)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="cifra font-medium">{pesos(c.total)}</div>
                    <div
                      className={`text-xs ${yaEnArca ? "text-emerald-700" : "text-amber-700"}`}
                    >
                      {yaEnArca ? "Ya está en ARCA" : "Pendiente en ARCA"}
                    </div>
                  </div>
                  <div className="flex basis-full justify-end gap-1 sm:basis-auto">
                    <button
                      type="button"
                      onClick={() => setBorrador(t)}
                      className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onTickets(tickets.filter((x) => x.id !== t.id))
                      }
                      className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
