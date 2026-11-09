"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Mensaje, Repositorio } from "@/lib/datos/repositorio";

const CADA = 30_000;

function cuando(iso: string) {
  const d = new Date(iso);
  const hoy = new Date();
  const hora = d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (d.toDateString() === hoy.toDateString()) return hora;
  return `${d.toLocaleDateString("es-AR", { day: "numeric", month: "short" })} ${hora}`;
}

/** Conversación entre el cliente y el estudio sobre una empresa. */
export function Mensajes({
  repo,
  empresaId,
  soyEstudio,
  visible,
  onNoLeidos,
}: {
  repo: Repositorio;
  empresaId: string;
  soyEstudio: boolean;
  /** Si la pantalla está a la vista, los mensajes nuevos se marcan como leídos. */
  visible: boolean;
  onNoLeidos: (cantidad: number) => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[] | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement>(null);

  const recargar = useCallback(async () => {
    try {
      let lista = await repo.mensajes(empresaId);
      const sinLeer = lista.filter(
        (m) => m.deEstudio !== soyEstudio && !m.leido,
      );
      if (visible && sinLeer.length) {
        await repo.marcarLeidos(empresaId, !soyEstudio);
        lista = lista.map((m) =>
          m.deEstudio !== soyEstudio ? { ...m, leido: true } : m,
        );
        onNoLeidos(0);
      } else onNoLeidos(sinLeer.length);
      setMensajes(lista);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [repo, empresaId, soyEstudio, visible, onNoLeidos]);

  useEffect(() => {
    recargar();
    const t = setInterval(recargar, CADA);
    return () => clearInterval(t);
  }, [recargar]);

  useEffect(() => {
    if (visible) final.current?.scrollIntoView({ block: "nearest" });
  }, [visible, mensajes?.length]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    setError(null);
    try {
      await repo.enviarMensaje(empresaId, texto);
      setTexto("");
      await recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section>
        <h1 className="text-2xl font-semibold">Mensajes</h1>
        <p className="mt-1 text-stone-600">
          {soyEstudio
            ? "Lo que te escribe el cliente sobre esta empresa. Contestale acá y lo ve cuando entra."
            : "¿Tenés una duda o algo para avisarle al estudio? Escribilo acá y te contestamos por este mismo lugar."}
        </p>
      </section>

      <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="max-h-[60vh] min-h-48 space-y-3 overflow-y-auto p-4">
          {mensajes === null ? (
            <p className="text-sm text-stone-500">Cargando…</p>
          ) : mensajes.length === 0 ? (
            <p className="py-10 text-center text-sm text-stone-500">
              Todavía no hay mensajes.
            </p>
          ) : (
            mensajes.map((m) => {
              const mio = m.deEstudio === soyEstudio;
              return (
                <div
                  key={m.id}
                  className={`flex ${mio ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mio ? "rounded-br-sm bg-marca text-white" : "rounded-bl-sm bg-stone-100 text-stone-900"}`}
                  >
                    {!mio && (
                      <div className="mb-0.5 text-xs font-semibold text-marca">
                        {m.deEstudio ? "Estudio" : "Cliente"}
                      </div>
                    )}
                    {m.asunto && (
                      <p className="mb-1 font-semibold">📌 {m.asunto}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                    <div
                      className={`mt-1 text-right text-[11px] ${mio ? "text-white/70" : "text-stone-500"}`}
                    >
                      {cuando(m.creadoEn)}
                      {mio && (m.leido ? " · Leído" : " · Enviado")}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={final} />
        </div>
        <form
          onSubmit={enviar}
          className="flex items-end gap-2 border-t border-stone-200 p-3"
        >
          <textarea
            id="mensaje-nuevo"
            aria-label="Mensaje"
            value={texto}
            maxLength={4000}
            rows={2}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Escribí tu mensaje…"
            className="min-w-0 flex-1 resize-none rounded-md border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Enviar
          </button>
        </form>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
