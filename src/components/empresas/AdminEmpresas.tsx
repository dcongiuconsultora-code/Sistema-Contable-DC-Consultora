"use client";

import { useEffect, useState } from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { cuitConGuiones } from "@/lib/formato";
import { cuitValido } from "@/lib/tickets/validar";
import { UnidadesEmpresa } from "./UnidadesEmpresa";

const CONDICIONES = ["Responsable inscripto", "Monotributo", "Exento"];

function Invitaciones({
  repo,
  empresa,
}: {
  repo: Repositorio;
  empresa: Empresa;
}) {
  const [emails, setEmails] = useState<string[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.invitaciones(empresa.id).then(setEmails, (e) => setError(e.message));
  }, [repo, empresa.id]);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    const email = nuevo.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return setError("Ese mail no parece válido.");
    setError(null);
    try {
      await repo.invitar(email, empresa.id);
      setEmails(await repo.invitaciones(empresa.id));
      setNuevo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function quitar(email: string) {
    try {
      await repo.quitarInvitacion(email, empresa.id);
      setEmails(await repo.invitaciones(empresa.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-stone-600">
        Usuarios del cliente que pueden entrar a esta empresa:
      </p>
      {emails === null ? (
        <p className="text-stone-500">Cargando…</p>
      ) : emails.length === 0 ? (
        <p className="text-stone-500">Todavía nadie.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {emails.map((e) => (
            <li
              key={e}
              className="flex items-center justify-between gap-2 px-3 py-1.5"
            >
              <span className="min-w-0 truncate">{e}</span>
              <button
                type="button"
                onClick={() => quitar(e)}
                className="shrink-0 rounded px-2 py-0.5 text-stone-500 hover:bg-stone-100"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={invitar} className="flex flex-wrap gap-2">
        <input
          id={`invitar-${empresa.id}`}
          type="email"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="mail del cliente"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5"
        />
        <button
          type="submit"
          className="rounded-md border border-marca px-3 py-1.5 font-medium text-marca hover:bg-marca-claro"
        >
          Dar acceso
        </button>
      </form>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

export function AdminEmpresas({
  repo,
  empresas,
  sinLeer = {},
  onCreada,
  onAbrir,
  onMensajes,
}: {
  repo: Repositorio;
  empresas: Empresa[];
  /** Mensajes del cliente sin leer, por empresa. */
  sinLeer?: Record<string, number>;
  onCreada: (e: Empresa) => void;
  onAbrir: (e: Empresa) => void;
  onMensajes?: (e: Empresa) => void;
}) {
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [condicion, setCondicion] = useState(CONDICIONES[0]);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [conUnidades, setConUnidades] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!razonSocial.trim()) return setError("Falta la razón social.");
    if (!cuitValido(cuit)) return setError("El CUIT no es válido.");
    setError(null);
    try {
      const nueva = await repo.crearEmpresa({
        razon_social: razonSocial.trim(),
        cuit,
        condicion_iva: condicion,
      });
      setRazonSocial("");
      setCuit("");
      onCreada(nueva);
      setAbierta(nueva.id);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(
        /duplicate|unique/i.test(mensaje)
          ? "Ya hay una empresa con ese CUIT."
          : mensaje,
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="mt-1 text-stone-600">
          Tus clientes. Para que un cliente entre al sistema, dale acceso con su
          mail: cuando entre por primera vez va a ver solo su empresa.
        </p>
      </section>

      <form
        onSubmit={crear}
        className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="block text-sm">
          <span className="text-stone-600">Razón social</span>
          <input
            id="nueva-razon-social"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">CUIT</span>
          <input
            id="nuevo-cuit"
            inputMode="numeric"
            value={cuit}
            onChange={(e) =>
              setCuit(e.target.value.replace(/\D/g, "").slice(0, 11))
            }
            placeholder="30711111111"
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Condición IVA</span>
          <select
            id="nueva-condicion"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-2"
          >
            {CONDICIONES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Agregar empresa
        </button>
        {error && <p className="text-sm text-red-700 sm:col-span-4">{error}</p>}
      </form>

      <section className="space-y-3">
        {empresas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
            Todavía no cargaste empresas.
          </p>
        ) : (
          empresas.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{e.razon_social}</div>
                  <div className="text-sm text-stone-500">
                    CUIT {cuitConGuiones(e.cuit)} · {e.condicion_iva}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sinLeer[e.id] ? (
                    <button
                      type="button"
                      onClick={() => onMensajes?.(e)}
                      className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
                    >
                      ✉ {sinLeer[e.id]}{" "}
                      {sinLeer[e.id] === 1
                        ? "mensaje nuevo"
                        : "mensajes nuevos"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      setConUnidades(conUnidades === e.id ? null : e.id)
                    }
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {conUnidades === e.id
                      ? "Ocultar unidades"
                      : "Unidades de negocio"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbierta(abierta === e.id ? null : e.id)}
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {abierta === e.id ? "Ocultar accesos" : "Accesos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAbrir(e)}
                    className="rounded-md bg-marca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Abrir
                  </button>
                </div>
              </div>
              {conUnidades === e.id && (
                <UnidadesEmpresa repo={repo} empresaId={e.id} />
              )}
              {abierta === e.id && <Invitaciones repo={repo} empresa={e} />}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
