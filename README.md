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
| `public/ejemplos/` | Archivos de ejemplo de Mis Comprobantes |
