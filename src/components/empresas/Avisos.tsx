"use client";

import { useEffect, useMemo, useState } from "react";
import {
  completarPlantilla,
  linkGmail,
  PLANTILLAS_BASE,
  type Plantilla,
} from "@/lib/avisos/avisos";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { vencimientos } from "@/lib/vencimientos/vencimientos";

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function cuando(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Enviado = Awaited<ReturnType<Repositorio["avisosEnviados"]>>[number];

/** Avisos a los clientes con modelos prearmados: quedan en la app con constancia de lectura. */
export function Avisos({
  repo,
  empresas,
}: {
  repo: Repositorio;
  empresas: Empresa[];
}) {
  const [propias, setPropias] = useState<Plantilla[]>([]);
  const [elegida, setElegida] = useState(0);
  const [asunto, setAsunto] = useState(PLANTILLAS_BASE[0].asunto);
  const [cuerpo, setCuerpo] = useState(PLANTILLAS_BASE[0].cuerpo);
  const [destino, setDestino] = useState<Set<string>>(new Set());
  const [fechaLimite, setFechaLimite] = useState(sumarDias(hoyIso(), 5));
  const [mails, setMails] = useState<Record<string, string[]>>({});
  const [enviados, setEnviados] = useState<Enviado[]>([]);
  const [recien, setRecien] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const todas = [...PLANTILLAS_BASE, ...propias];
  const recargar = () =>
    Promise.all([
      repo.plantillas(),
      repo.mailsPorEmpresa(),
      repo.avisosEnviados(),
    ])
      .then(([p, m, e]) => {
        setPropias(p);
        setMails(m);
        setEnviados(e);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const elegir = (i: number) => {
    setElegida(i);
    setAsunto(todas[i].asunto);
    setCuerpo(todas[i].cuerpo);
  };

  const hoy = hoyIso();
  const textos = useMemo(() => {
    const venc = vencimientos(empresas, hoy, sumarDias(hoy, 30)).lista;
    return new Map(
      empresas.map((e) => {
        const datos = {
          empresa: e.razon_social,
          mes: hoy.slice(0, 7),
          fechaLimite,
          estudio: "DC Consultora",
          vencimientos: venc.filter((v) => v.empresaId === e.id),
        };
        return [
          e.id,
          {
            asunto: completarPlantilla(asunto, datos),
            cuerpo: completarPlantilla(cuerpo, datos),
          },
        ];
      }),
    );
  }, [empresas, asunto, cuerpo, fechaLimite, hoy]);

  const primera = empresas.find((e) => destino.has(e.id));
  const vista = primera ? textos.get(primera.id) : null;

  async function enviar() {
    setError(null);
    setAviso(null);
    setEnviando(true);
    try {
      const ids = empresas.filter((e) => destino.has(e.id)).map((e) => e.id);
      for (const id of ids) {
        const t = textos.get(id)!;
        await repo.enviarAviso(id, t.asunto, t.cuerpo);
      }
      setRecien(ids);
      setAviso(
        `Listo: el aviso quedó en los mensajes de ${ids.length} ${ids.length === 1 ? "empresa" : "empresas"}. Cuando lo lean vas a ver "Leído" abajo. Si además querés mandarlo por mail, usá los botones de Gmail.`,
      );
      setEnviados(await repo.avisosEnviados());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  async function guardarComoModelo() {
    const nombre = prompt("Nombre del modelo:", todas[elegida]?.nombre);
    if (!nombre) return;
    try {
      const actual = todas[elegida];
      const esPropia = actual?.id && propias.some((p) => p.id === actual.id);
      await repo.guardarPlantilla({
        id: esPropia && actual.nombre === nombre ? actual.id : undefined,
        nombre,
        asunto,
        cuerpo,
      });
      await recargar();
      setAviso(`Modelo "${nombre}" guardado.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const nombreEmpresa = (id: string) =>
    empresas.find((e) => e.id === id)?.razon_social ?? "—";

  return (
    <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Avisos a clientes</h2>
        <p className="mt-1 text-sm text-stone-600">
          Recordatorios y pedidos de documentación con texto prearmado. El aviso
          queda en los mensajes del cliente dentro de la app, con constancia de
          cuándo se mandó y de si lo leyó; además lo podés mandar por mail desde
          tu Gmail.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {todas.map((p, i) => (
          <button
            key={`${p.nombre}-${i}`}
            type="button"
            onClick={() => elegir(i)}
            className={`rounded-full border px-3 py-1 text-sm ${elegida === i ? "border-marca bg-marca-claro text-marca" : "border-stone-300 hover:border-marca"}`}
          >
            {p.nombre}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-2">
          <label className="block text-sm">
            <span className="text-stone-600">Asunto</span>
            <input
              id="aviso-asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-600">Texto</span>
            <textarea
              id="aviso-cuerpo"
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              rows={12}
              className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
            />
          </label>
          <p className="text-xs text-stone-500">
            Se completan solos: {"{empresa}"}, {"{mes}"}, {"{mes_anterior}"},{" "}
            {"{vencimientos}"} (los de los próximos 30 días de cada empresa),{" "}
            {"{fecha_limite}"} y {"{estudio}"}.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-stone-600">Fecha límite</span>
              <input
                id="aviso-fecha-limite"
                type="date"
                value={fechaLimite}
                onChange={(e) => setFechaLimite(e.target.value)}
                className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
              />
            </label>
            <button
              type="button"
              onClick={guardarComoModelo}
              className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
            >
              Guardar como modelo
            </button>
          </div>
        </div>

        <fieldset className="text-sm">
          <legend className="mb-1 text-stone-600">Para</legend>
          <label className="flex items-center gap-2 border-b border-stone-100 pb-1 font-medium">
            <input
              type="checkbox"
              checked={destino.size === empresas.length && empresas.length > 0}
              onChange={(e) =>
                setDestino(
                  e.target.checked
                    ? new Set(empresas.map((x) => x.id))
                    : new Set(),
                )
              }
            />
            Todas las empresas
          </label>
          <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto">
            {empresas.map((e) => (
              <label key={e.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Avisar a ${e.razon_social}`}
                  checked={destino.has(e.id)}
                  onChange={(ev) => {
                    const n = new Set(destino);
                    if (ev.target.checked) n.add(e.id);
                    else n.delete(e.id);
                    setDestino(n);
                  }}
                />
                <span className="min-w-0 truncate">{e.razon_social}</span>
                {!mails[e.id]?.length && (
                  <span
                    className="text-xs text-stone-400"
                    title="Sin mails invitados"
                  >
                    (sin mail)
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {vista && (
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm">
          <div className="mb-1 text-xs uppercase tracking-wide text-stone-500">
            Así le llega a {primera?.razon_social}
          </div>
          <div className="font-semibold">{vista.asunto}</div>
          <p className="mt-2 whitespace-pre-wrap">{vista.cuerpo}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!destino.size || enviando || !cuerpo.trim()}
          onClick={enviar}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {enviando
            ? "Enviando…"
            : `Enviar por la app${destino.size ? ` (${destino.size})` : ""}`}
        </button>
        {recien
          .filter((id) => mails[id]?.length)
          .map((id) => {
            const t = textos.get(id)!;
            return (
              <a
                key={id}
                href={linkGmail(mails[id], t.asunto, t.cuerpo)}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
              >
                ✉ Gmail: {nombreEmpresa(id)}
              </a>
            );
          })}
      </div>
      {aviso && <p className="text-sm text-emerald-700">{aviso}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {enviados.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Avisos enviados ({enviados.length})
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-stone-100">
              {enviados.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-stone-500">
                    {cuando(e.creadoEn)}
                  </td>
                  <td className="py-1.5 pr-3">{nombreEmpresa(e.empresaId)}</td>
                  <td className="py-1.5 pr-3">{e.asunto}</td>
                  <td
                    className={`whitespace-nowrap py-1.5 text-right ${e.leido ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {e.leido ? "✓ Leído" : "Sin leer"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
