"use client";

import { type ReactNode, useEffect } from "react";

/** Ventana encima de la pantalla, para formularios que no necesitan una página propia. */
export function Modal({
  titulo,
  subtitulo,
  onCerrar,
  children,
  ancho = "max-w-3xl",
}: {
  titulo: string;
  subtitulo?: string;
  onCerrar: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:p-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-stone-900/40 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`relative max-h-[92vh] w-full ${ancho} overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:mt-8 sm:rounded-3xl sm:p-6`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{titulo}</h2>
            {subtitulo && (
              <p className="mt-0.5 text-sm text-stone-500">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-full px-3 py-1 text-2xl leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
