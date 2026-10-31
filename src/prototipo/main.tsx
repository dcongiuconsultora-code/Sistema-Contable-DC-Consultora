import { createRoot } from "react-dom/client";
import { Importador } from "@/components/importador/Importador";

createRoot(document.getElementById("app")!).render(<Importador cargarEjemploAlInicio />);
