"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";

/**
 * Ingreso con mail y contraseña (la crea el estudio y cada uno la puede cambiar), o sin contraseña:
 * llega un mail con un link (y, si el mail lo trae, un código).
 */
export function Ingreso({ db }: { db: SupabaseClient }) {
  const [conClave, setConClave] = useState(true);
  const [clave, setClave] = useState("");
  const [email, setEmail] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [esperando, setEsperando] = useState(false);

  async function pedirMail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEsperando(true);
    const { error } = await db.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: window.location.origin },
    });
    setEsperando(false);
    if (error) {
      setError(
        error.status === 429
          ? "Se pidieron muchos mails seguidos. Esperá unos minutos y volvé a intentar."
          : `No se pudo mandar el mail: ${error.message}`,
      );
      return;
    }
    setEnviado(true);
  }

  async function entrarConClave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEsperando(true);
    const { error } = await db.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: clave,
    });
    setEsperando(false);
    if (error)
      setError(
        error.status === 400
          ? "El mail o la contraseña no son correctos. Si no tenés contraseña, pedísela al estudio."
          : `No se pudo entrar: ${error.message}`,
      );
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEsperando(true);
    const { error } = await db.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: codigo.trim(),
      type: "email",
    });
    setEsperando(false);
    if (error) setError("El código no es válido o ya venció. Pedí uno nuevo.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca to-[#7a2412] px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-dc.png"
          alt=""
          width={64}
          height={64}
          className="mb-3 h-16 w-16"
        />
        <p className="text-sm font-medium text-marca">DC Consultora</p>
        <h1 className="mt-1 text-2xl font-semibold">Sistema Contable</h1>

        {conClave ? (
          <form onSubmit={entrarConClave} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="text-stone-600">Usuario (tu mail)</span>
              <input
                id="email-clave"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2.5 focus:border-marca focus:outline-none"
              />
            </label>
            <label className="block text-sm">
              <span className="text-stone-600">Contraseña</span>
              <input
                id="clave-ingreso"
                type="password"
                required
                autoComplete="current-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2.5 focus:border-marca focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={esperando}
              className="w-full rounded-md bg-marca py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {esperando ? "Entrando…" : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConClave(false);
                setError(null);
              }}
              className="text-xs text-stone-500 underline"
            >
              Entrar sin contraseña, con un link al mail
            </button>
          </form>
        ) : !enviado ? (
          <form onSubmit={pedirMail} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="text-stone-600">Tu mail</span>
              <input
                id="email-ingreso"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2.5 focus:border-marca focus:outline-none"
              />
            </label>
            <button
              type="submit"
              disabled={esperando}
              className="w-full rounded-md bg-marca py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {esperando ? "Enviando…" : "Entrar"}
            </button>
            <p className="text-xs text-stone-500">
              Sin contraseña: te llega un mail para entrar.{" "}
              <button
                type="button"
                onClick={() => setConClave(true)}
                className="underline"
              >
                Entrar con contraseña
              </button>
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-4 text-sm">
            <p>
              Te mandamos un mail a <strong>{email}</strong>. Abrilo y tocá el
              link para entrar.
            </p>
            <p className="text-stone-500">
              Si no lo ves en unos minutos, revisá la carpeta de spam.
            </p>
            <form
              onSubmit={verificarCodigo}
              className="space-y-2 border-t border-stone-200 pt-4"
            >
              <label className="block">
                <span className="text-stone-600">
                  ¿El mail trae un código? Escribilo acá
                </span>
                <input
                  id="codigo-ingreso"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={codigo}
                  onChange={(e) =>
                    setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="123456"
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2.5 text-center text-lg tracking-[0.4em] tabular-nums focus:border-marca focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={codigo.length !== 6 || esperando}
                className="w-full rounded-md border border-marca py-2 font-medium text-marca disabled:opacity-50"
              >
                Entrar con el código
              </button>
            </form>
            <button
              type="button"
              onClick={() => setEnviado(false)}
              className="text-stone-500 underline"
            >
              Usar otro mail
            </button>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
