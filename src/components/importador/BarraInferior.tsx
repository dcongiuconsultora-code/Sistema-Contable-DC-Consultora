"use client";

type SeccionBarra = "inicio" | "movimientos" | "tickets" | "mensajes";

/** En el celular: los accesos de todos los días abajo, como en las apps, con "Cargar" al medio. */
export function BarraInferior({
  seccion,
  noLeidos,
  onIr,
  onMenu,
  conMensajes = true,
}: {
  seccion: string;
  noLeidos: number;
  onIr: (d: { seccion: SeccionBarra }) => void;
  onMenu: () => void;
  conMensajes?: boolean;
}) {
  const boton = (s: SeccionBarra, icono: string, texto: string) => (
    <button
      type="button"
      onClick={() => onIr({ seccion: s })}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] ${seccion === s ? "font-semibold text-marca" : "text-stone-500"}`}
    >
      <span className="text-xl leading-none">{icono}</span>
      {texto}
      {s === "mensajes" && noLeidos > 0 && (
        <span className="absolute right-[28%] top-0.5 min-w-4 rounded-full bg-marca px-1 text-[10px] font-semibold text-white">
          {noLeidos}
        </span>
      )}
    </button>
  );
  return (
    <nav
      aria-label="Accesos rápidos"
      className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-stone-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      {boton("inicio", "🏠", "Inicio")}
      {boton("movimientos", "💸", "Cobros y pagos")}
      <button
        type="button"
        onClick={() => onIr({ seccion: "tickets" })}
        className="flex flex-1 flex-col items-center gap-0.5 pb-1.5 text-[11px] text-stone-600"
      >
        <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-marca text-2xl text-white shadow-lg shadow-marca/30">
          ＋
        </span>
        Cargar
      </button>
      {conMensajes ? (
        boton("mensajes", "💬", "Mensajes")
      ) : (
        <span className="flex-1" />
      )}
      <button
        type="button"
        onClick={onMenu}
        className="flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[11px] text-stone-500"
      >
        <span className="text-xl leading-none">☰</span>
        Más
      </button>
    </nav>
  );
}
