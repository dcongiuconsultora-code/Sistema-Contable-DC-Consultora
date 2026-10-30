# Sistema Contable · DC Consultora

Sistema contable interno de la consultora: los clientes cargan su operación y el estudio genera libros, liquidaciones y estados contables.

## Estado actual: importador de ARCA

- Lee los archivos de **Mis Comprobantes** (emitidos y recibidos) en `.xlsx` o `.csv`.
- Reconoce el formato viejo (un solo IVA, deduce la alícuota) y el nuevo (desglose por alícuota).
- Notas de crédito en negativo, moneda extranjera convertida con el tipo de cambio, comprobantes repetidos omitidos.
- Facturas B y C recibidas: no computan crédito fiscal, todo va a no gravado (igual que la planilla).
- Arma el Libro IVA Ventas, el Libro IVA Compras y la liquidación de IVA del período (misma lógica que la pestaña "Liq IVA" de la planilla).

Por ahora no guarda nada: los archivos se leen en el navegador. En `ejemplos/` hay dos archivos de prueba.

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
| `src/components/importador/` | Pantalla de importación |
| `ejemplos/` | Archivos de ejemplo de Mis Comprobantes |
