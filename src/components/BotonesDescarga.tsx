"use client";

import { useState } from "react";

/** Botones "PDF para presentar" y "Excel" que arman el archivo al tocarlos. */
export function BotonesDescarga({
  onDescargar,
  claro = false,
}: {
  onDescargar: (formato: "pdf" | "excel") => Promise<void>;
  /** Sobre fondo bordó (botones blancos). */
  claro?: boolean;
}) {
  const [armando, setArmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(
        [
          ["pdf", "PDF para presentar"],
          ["excel", "Excel"],
        ] as const
      ).map(([f, texto]) => (
        <button
          key={f}
          type="button"
          disabled={armando !== null}
          onClick={async () => {
            setArmando(f);
            setError(null);
            try {
              await onDescargar(f);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setArmando(null);
            }
          }}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium disabled:opacity-60 ${claro ? "border border-white/30 bg-white/10 text-white hover:bg-white/20" : "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50"}`}
        >
          {armando === f ? "Armando…" : `⬇ ${texto}`}
        </button>
      ))}
      {error && <span className="text-xs text-red-200">{error}</span>}
    </div>
  );
}
