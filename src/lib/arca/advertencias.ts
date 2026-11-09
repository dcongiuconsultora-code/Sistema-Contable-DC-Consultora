/** Qué hacer con cada aviso que deja la importación de ARCA, en palabras simples. */
export function queHacer(advertencia: string): string {
  if (/sin tipo de cambio/i.test(advertencia))
    return "Es una factura en moneda extranjera y el archivo no trae el tipo de cambio, así que el importe en pesos puede estar mal. Fijate el tipo de cambio en la factura; si el importe es chico, se puede dejar así.";
  if (/deducir la alícuota/i.test(advertencia))
    return "El archivo de ARCA trae el IVA en un solo número y no se puede saber si la factura tiene una alícuota o varias (por ejemplo 21 % y 10,5 %). El total está bien; si necesitás el detalle por alícuota, bajá de ARCA el archivo nuevo de Mis Comprobantes (que viene separado por alícuota) y volvé a subirlo.";
  if (/suma de netos/i.test(advertencia))
    return "Los importes por alícuota del archivo no suman el neto gravado. Compará con la factura: puede faltar una alícuota en el archivo de ARCA.";
  if (/no figuran en ninguna columna/i.test(advertencia))
    return "Parte del total no está en neto, IVA ni otros tributos. Suele pasar con combustibles (impuesto a los combustibles) o impuestos internos: en ese caso está bien y ese importe no computa IVA. Si no es eso, revisá la factura.";
  return "Compará los importes con la factura original.";
}
