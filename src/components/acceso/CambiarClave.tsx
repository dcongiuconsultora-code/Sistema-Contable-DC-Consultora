"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";

/** Cada usuario cambia su propia contraseña (la primera se la da el estudio). */
export function CambiarClave({
  db,
  onCerrar,
}: {
  db: SupabaseClient;
  onCerrar: () => void;
}) {
  const [clave, setClave] = useState("");
  const [repetida, setRepetida] = useState("");
  const [estado, setEstado] = useState<"listo" | "guardando" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (clave.length < 8)
      return setError("Tiene que tener al menos 8 caracteres.");
    if (clave !== repetida)
      return setError("Las dos contraseñas no coinciden.");
    setError(null);
    setEstado("guardando");
    const { error } = await db.auth.updateUser({ password: clave });
    if (error) {
      setEstado(null);
      return setError(
        /same/i.test(error.message)
          ? "Es igual a la que ya tenías."
          : `No se pudo cambiar: ${error.message}`,
      );
    }
    setEstado("listo");
  }

  return (
    <div
      role="dialog"
      aria-label="Cambiar contraseña"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-stone-900 shadow-xl">
        <h2 className="text-lg font-semibold">Cambiar mi contraseña</h2>
        {estado === "listo" ? (
          <>
            <p className="mt-3 text-sm text-emerald-700">
              Listo. La próxima vez entrá con la contraseña nueva.
            </p>
            <button
              type="button"
              onClick={onCerrar}
              className="mt-4 w-full rounded-md bg-marca py-2 font-medium text-white"
            >
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={guardar} className="mt-3 space-y-3 text-sm">
            <label className="block">
              <span className="text-stone-600">Contraseña nueva</span>
              <input
                id="clave-nueva"
                type="password"
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">Repetila</span>
              <input
                id="clave-repetida"
                type="password"
                autoComplete="new-password"
                value={repetida}
                onChange={(e) => setRepetida(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
              />
            </label>
            {error && <p className="text-red-700">{error}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={estado === "guardando"}
                className="flex-1 rounded-md bg-marca py-2 font-medium text-white disabled:opacity-50"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-md px-3 py-2 text-stone-600 hover:bg-stone-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
