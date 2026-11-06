import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Importador } from "@/components/importador/Importador";
import { type LectorTicket, lectorDelPrototipo } from "@/lib/tickets/lector";

function Prototipo() {
  const [lector, setLector] = useState<LectorTicket | null>(null);
  const [buscando, setBuscando] = useState(true);

  useEffect(() => {
    lectorDelPrototipo()
      .then((l) => setLector(() => l))
      .finally(() => setBuscando(false));
  }, []);

  return (
    <Importador
      cargarEjemploAlInicio
      lector={lector}
      sinLector={
        buscando
          ? "Preparando la lectura automática…"
          : "La lectura automática de fotos funciona al abrir este prototipo en claude.ai. Igual podés subir la foto y completar los datos a mano."
      }
    />
  );
}

createRoot(document.getElementById("app")!).render(<Prototipo />);
