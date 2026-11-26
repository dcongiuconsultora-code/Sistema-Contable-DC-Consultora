"use client";

import { useEffect, useRef, useState } from "react";

export interface OpcionUsuario {
  texto: string;
  icono: string;
  onClick: () => void;
}

/** Botón redondo con las iniciales y un menú con las opciones de la cuenta. */
export function MenuUsuario({
  iniciales,
  titulo,
  opciones,
  punto,
}: {
  iniciales: string;
  titulo: string;
  opciones: OpcionUsuario[];
  /** Un puntito de aviso sobre el botón (por ejemplo, mensajes sin leer). */
  punto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Mi cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto(!abierto)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-marca text-sm font-semibold text-white ring-offset-2 hover:ring-2 hover:ring-marca/30"
      >
        {iniciales}
        {punto && (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />
        )}
      </button>
      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-stone-200 bg-white p-2 text-sm shadow-xl shadow-stone-900/10"
        >
          <div className="truncate px-3 py-2 text-xs text-stone-500">
            {titulo}
          </div>
          {opciones.map((o) => (
            <button
              key={o.texto}
              type="button"
              role="menuitem"
              onClick={() => {
                setAbierto(false);
                o.onClick();
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-stone-700 hover:bg-stone-100"
            >
              <span className="w-5 text-center">{o.icono}</span>
              {o.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Iniciales para el botón: "Comercial Andina SA" → "CA". */
export function inicialesDe(texto: string) {
  const palabras = texto
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(
      (p) =>
        /^[\p{L}\d]/u.test(p) && !/^(s\.?a\.?s?|s\.?r\.?l|y|de|&)$/i.test(p),
    );
  return (
    palabras
      .slice(0, 2)
      .map((p) => p[0])
      .join("") || "?"
  ).toUpperCase();
}
