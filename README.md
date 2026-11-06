# Sistema Contable · DC Consultora

Sistema contable interno de la consultora: los clientes cargan su operación y el estudio genera libros, liquidaciones y estados contables.

## Estado actual: importador de ARCA

- Lee los archivos de **Mis Comprobantes** (emitidos y recibidos) en `.xlsx` o `.csv`.
- Reconoce el formato viejo (un solo IVA, deduce la alícuota) y el nuevo (desglose por alícuota).
- Notas de crédito en negativo, moneda extranjera convertida con el tipo de cambio, comprobantes repetidos omitidos.
- Facturas B y C recibidas: no computan crédito fiscal, todo va a no gravado (igual que la planilla).
- Arma el Libro IVA Ventas, el Libro IVA Compras y la liquidación de IVA del período (misma lógica que la pestaña "Liq IVA" de la planilla).

## Bancos

- Lee el resumen de **Banco Macro** en PDF, con todas sus cuentas.
- Controla movimiento por movimiento que el saldo cierre contra el que informa el banco.
- Clasifica cada movimiento con las cuentas del plan (SIRCREB y otras retenciones de IIBB, impuesto a los débitos y créditos, gastos bancarios, cobros y pagos, cheques, fondos comunes, etc.) y marca para revisar los que necesitan criterio.

## Tickets del cliente

- El cliente saca una foto del tique (o factura) que todavía no aparece en Mis Comprobantes.
- Si el comprobante tiene el **código QR de ARCA**, se leen de ahí los datos exactos (CUIT, punto de venta, número, fecha, total).
- La foto la lee **Claude** (API de Anthropic, salida estructurada) para completar neto, IVA por alícuota, percepciones y otros tributos.
- Controles: CUIT válido, IVA que corresponde a la alícuota, sumas que cierran, fecha, y que el tique A esté a nombre del cliente para computar crédito fiscal.
- Los tickets confirmados se suman al Libro IVA Compras y, cuando el comprobante aparece en ARCA, se usa el de ARCA (se cruzan por CUIT, punto de venta y número).
- La ruta `/api/tickets/leer` necesita la variable de entorno `ANTHROPIC_API_KEY` en el servidor.

Por ahora no guarda nada: los archivos se leen en el navegador. En `public/ejemplos/` hay dos archivos de prueba.

## Cómo correrlo

```bash
npm install
npm run dev     # abre http://localhost:3000
npm test        # pruebas del importador y la liquidación
```

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/lib/arca/` | Lectura de archivos y normalización de comprobantes de ARCA |
| `src/lib/iva/` | Libros y liquidación de IVA |
| `src/lib/bancos/` | Lectura de resúmenes bancarios y clasificación de movimientos |
| `src/lib/pdf/` | Extracción de texto de PDF con posiciones (pdf.js) |
| `src/components/importador/` | Pantalla de importación de ARCA |
| `src/components/bancos/` | Pantalla de bancos |
| `src/lib/tickets/` | Lectura de tickets: QR de ARCA, instrucciones para Claude, controles |
| `src/app/api/tickets/leer/` | Ruta del servidor que lee la foto con la API de Anthropic |
| `src/components/tickets/` | Pantalla de carga de tickets |
| `public/ejemplos/` | Archivos de ejemplo de Mis Comprobantes |
