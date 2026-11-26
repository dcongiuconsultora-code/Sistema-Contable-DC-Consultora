"use client";

import { useEffect, useMemo, useState } from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import {
  linkWhatsapp,
  mensajeParaCliente,
  numeroWhatsapp,
  pendientesDeCliente,
} from "@/lib/avisos/cobranza";
import { linkGmail } from "@/lib/avisos/avisos";
import type { PlanPago } from "@/lib/vencimientos/vencimientos";

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Estado = Record<string, { por: string; error?: boolean }>;

/**
 * Recordatorios listos para mandar a cada cliente que debe cuotas o tiene algo por vencer:
 * por WhatsApp (un toque), por mail (desde la cuenta del estudio) o por la app.
 */
export function RecordatoriosClientes({
  repo,
  empresas,
  planes,
  onFicha,
}: {
  repo: Repositorio;
  empresas: Empresa[];
  planes: Record<string, PlanPago[]>;
  /** Abre la ficha para cargar el WhatsApp o el mail que falta. */
  onFicha: (empresaId: string) => void;
}) {
  const [dias, setDias] = useState(7);
  const [mails, setMails] = useState<Record<string, string[]>>({});
  const [correo, setCorreo] = useState<boolean | null>(null);
  const [enviado, setEnviado] = useState<Estado>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviandoTodos, setEnviandoTodos] = useState(false);
  useEffect(() => {
    repo.mailsPorEmpresa().then(setMails, () => {});
    repo.correoConfigurado().then(setCorreo, () => setCorreo(false));
  }, [repo]);

  const hoy = hoyIso();
  const lista = useMemo(
    () =>
      empresas
        .map((e) => {
          const pendientes = pendientesDeCliente(
            e,
            planes[e.id] ?? [],
            hoy,
            dias,
          );
          const para = [
            ...new Set(
              [e.email_contacto, ...(mails[e.id] ?? [])]
                .filter((m): m is string => Boolean(m && /@/.test(m)))
                .map((m) => m.trim().toLowerCase()),
            ),
          ];
          return {
            e,
            pendientes,
            para,
            whatsapp: numeroWhatsapp(e.telefono),
            mensaje: mensajeParaCliente(e.razon_social, pendientes),
            urgente: pendientes.some((p) => p.nivel === "urgente"),
          };
        })
        .filter((x) => x.pendientes.length)
        .sort((a, b) => Number(b.urgente) - Number(a.urgente)),
    [empresas, planes, mails, hoy, dias],
  );

  const marcar = (id: string, por: string, error = false) =>
    setEnviado((s) => ({ ...s, [id]: { por, error } }));

  async function porMail(x: (typeof lista)[number]) {
    try {
      await repo.mandarMailCliente(x.e.id, x.mensaje.asunto, x.mensaje.texto);
      marcar(x.e.id, `✓ Mail enviado a ${x.para.join(", ")}`);
    } catch (err) {
      marcar(x.e.id, err instanceof Error ? err.message : String(err), true);
    }
  }

  async function mailATodos() {
    setEnviandoTodos(true);
    for (const x of lista.filter((y) => y.para.length && !enviado[y.e.id]))
      await porMail(x);
    setEnviandoTodos(false);
  }

  const conMailSinEnviar = lista.filter(
    (x) => x.para.length && !enviado[x.e.id],
  ).length;

  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Recordatorios para mandar</h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Clientes que deben cuotas de planes o tienen algo por vencer, con el
            mensaje ya escrito. Mandalo por WhatsApp, por mail o por la app.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex rounded-full bg-stone-100 p-1">
            {[3, 7, 15].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                className={`rounded-full px-3 py-1 ${dias === n ? "bg-white font-medium shadow-sm" : "text-stone-500"}`}
              >
                {n} días
              </button>
            ))}
          </div>
          {correo && conMailSinEnviar > 0 && (
            <button
              type="button"
              disabled={enviandoTodos}
              onClick={() => {
                if (
                  confirm(
                    `¿Mandar el recordatorio por mail a ${conMailSinEnviar} ${conMailSinEnviar === 1 ? "cliente" : "clientes"}?`,
                  )
                )
                  mailATodos();
              }}
              className="rounded-full bg-marca px-3.5 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {enviandoTodos
                ? "Mandando…"
                : `✉️ Mandar mail a todos (${conMailSinEnviar})`}
            </button>
          )}
        </div>
      </div>
      {correo === false && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Para que los mails salgan directo desde el sistema (y los
          recordatorios automáticos de cada día lleguen también por mail) falta
          conectar el Gmail del estudio. Mientras tanto, “Mail” abre Gmail con
          el mensaje listo para que lo mandes vos.
        </p>
      )}
      {lista.length === 0 ? (
        <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
          🎉 Nadie debe cuotas ni tiene vencimientos en los próximos {dias}{" "}
          días.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {lista.map((x) => {
            const wa = linkWhatsapp(x.e.telefono, x.mensaje.texto);
            const estado = enviado[x.e.id];
            return (
              <li
                key={x.e.id}
                className={`rounded-xl border p-4 ${x.urgente ? "border-red-200 bg-red-50/40" : "border-stone-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {x.urgente && (
                        <span className="mr-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Urgente
                        </span>
                      )}
                      {x.e.razon_social}
                    </div>
                    <ul className="mt-1 space-y-0.5 text-sm text-stone-700">
                      {x.pendientes.map((p) => (
                        <li
                          key={p.texto}
                          className={
                            p.nivel === "urgente" ? "text-red-800" : ""
                          }
                        >
                          {p.nivel === "urgente" ? "⚠️" : "•"} {p.texto}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                      <span>
                        📱{" "}
                        {x.whatsapp ? (
                          `+${x.whatsapp}`
                        ) : (
                          <button
                            type="button"
                            onClick={() => onFicha(x.e.id)}
                            className="text-marca underline"
                          >
                            {x.e.telefono
                              ? "revisá el número en la ficha"
                              : "cargar WhatsApp"}
                          </button>
                        )}
                      </span>
                      <span>
                        ✉️{" "}
                        {x.para.length ? (
                          x.para.join(", ")
                        ) : (
                          <button
                            type="button"
                            onClick={() => onFicha(x.e.id)}
                            className="text-marca underline"
                          >
                            cargar mail
                          </button>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          marcar(x.e.id, "✓ Abriste WhatsApp con el mensaje")
                        }
                        className="rounded-lg bg-[#25d366] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                      >
                        WhatsApp
                      </a>
                    )}
                    {x.para.length > 0 &&
                      (correo ? (
                        <button
                          type="button"
                          onClick={() => porMail(x)}
                          className="rounded-lg bg-marca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                        >
                          Mail
                        </button>
                      ) : (
                        <a
                          href={linkGmail(
                            x.para,
                            x.mensaje.asunto,
                            x.mensaje.texto,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() =>
                            marcar(x.e.id, "✓ Abriste Gmail con el mensaje")
                          }
                          className="rounded-lg bg-marca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                        >
                          Mail
                        </a>
                      ))}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await repo.enviarAviso(
                            x.e.id,
                            x.mensaje.asunto,
                            x.mensaje.texto,
                          );
                          marcar(x.e.id, "✓ Quedó en sus mensajes de la app");
                        } catch (err) {
                          marcar(
                            x.e.id,
                            err instanceof Error ? err.message : String(err),
                            true,
                          );
                        }
                      }}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
                    >
                      En la app
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAbierto(abierto === x.e.id ? null : x.e.id)
                      }
                      className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100"
                    >
                      {abierto === x.e.id ? "Ocultar" : "Ver mensaje"}
                    </button>
                  </div>
                </div>
                {abierto === x.e.id && (
                  <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-stone-50 p-3 font-sans text-sm text-stone-700">
                    <b>{x.mensaje.asunto}</b>
                    {"\n\n"}
                    {x.mensaje.texto}
                  </pre>
                )}
                {estado && (
                  <p
                    className={`mt-2 text-xs ${estado.error ? "text-red-700" : "text-emerald-700"}`}
                  >
                    {estado.por}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
