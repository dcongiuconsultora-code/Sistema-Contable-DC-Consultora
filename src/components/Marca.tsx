/** Logo y nombre del estudio, para el encabezado (fondo bordó) o sobre fondo claro. */
export function Marca({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={claro ? "/logo-dc.png" : "/logo-dc-blanco.png"}
        alt="DC Consultora"
        width={36}
        height={36}
        className="h-9 w-9"
      />
      <span className="leading-tight">
        <span className="block text-base font-semibold">DC Consultora</span>
        <span
          className={`block text-xs ${claro ? "text-stone-500" : "text-white/70"}`}
        >
          Sistema Contable
        </span>
      </span>
    </span>
  );
}
