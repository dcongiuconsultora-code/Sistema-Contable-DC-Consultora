const PESOS = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function pesos(n: number) {
  return PESOS.format(n);
}

export function fechaCorta(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function nombrePeriodo(periodo: string) {
  const [a, m] = periodo.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

export function cuitConGuiones(cuit: string) {
  return cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : cuit;
}

export function tasaTexto(clave: string) {
  return clave === "s/d" ? "Sin identificar" : `${clave.replace(".", ",")}%`;
}
