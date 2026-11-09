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

## Cobros y pagos del cliente

- El cliente registra cobros de clientes (con las retenciones que le hicieron), pagos a proveedores, sueldos, honorarios, gastos, impuestos y movimientos con los socios.
- Cada movimiento genera su asiento con el plan de cuentas modelo; el estudio lo aprueba u observa (Enviado → Aprobado / Observado).
- Los cobros y pagos por banco se cruzan con el resumen bancario (mismo importe y sentido, hasta 3 días de diferencia) y esos movimientos del banco quedan clasificados solos.

## Tablero de inicio

- Lo primero que ve el cliente: resultado del mes, ventas (con variación contra el mes anterior), plata disponible, lo que le deben y lo que debe.
- Índices con semáforo y explicación en palabras: rentabilidad (resultado ÷ ventas), liquidez corriente, prueba ácida y endeudamiento (pasivo ÷ patrimonio neto).
- Gráfico de ventas y compras por mes y lista de cosas para atender (observados, cobranzas de más de 60 días, banco sin conciliar).
- Se calcula con un libro diario armado solo (facturas de ARCA, tickets, cobros y pagos, movimientos del banco) más los saldos de inicio del último balance, que carga el estudio.

## Unidades de negocio

- Para empresas que llevan varios negocios dentro de una razón social (por ejemplo, Grupo N&P).
- Se definen en Empresas → Unidades de negocio: nombre, puntos de venta y cuentas bancarias propias.
- Las ventas se asignan por punto de venta, las compras por proveedor (ARCA → Unidades), el banco por cuenta (si es de una sola unidad) y los cobros, pagos y tickets según la unidad que se elige al cargarlos. Lo que no es de una sola unidad queda como "Compartido".
- El tablero tiene un selector de unidad y una tabla con ventas, compras, gastos, resultado, rentabilidad y caja de cada una. Liquidez y endeudamiento son siempre de toda la empresa.

## Cuentas corrientes

- Clientes: facturas de Mis Comprobantes emitidos, menos cobros y retenciones. Proveedores: recibidos y tickets, menos pagos.
- Se agrupan por CUIT; si un cobro o pago no tiene CUIT, se asigna por nombre.
- Saldo, comprobantes pendientes y antigüedad (los pagos cancelan primero lo más viejo).

## Conciliación bancaria

- Cada movimiento del banco queda **conciliado** (lo cargó el cliente), **automático** (impuestos, retenciones, gastos bancarios), **sugerido** (el banco trae el CUIT o el nombre de un cliente o proveedor conocido) o **sin registrar**.
- Los sugeridos se registran con un clic (o todos juntos) y los sin registrar con un formulario corto; entran a la cuenta corriente.
- Lista lo que el cliente cargó por banco y no aparece en el resumen.

## Tickets del cliente

- El cliente saca una foto del tique (o factura) que todavía no aparece en Mis Comprobantes.
- Si el comprobante tiene el **código QR de ARCA**, se leen de ahí los datos exactos (CUIT, punto de venta, número, fecha, total).
- La foto la lee **Claude** (API de Anthropic, salida estructurada) para completar neto, IVA por alícuota, percepciones y otros tributos.
- Controles: CUIT válido, IVA que corresponde a la alícuota, sumas que cierran, fecha, y que el tique A esté a nombre del cliente para computar crédito fiscal.
- Los tickets confirmados se suman al Libro IVA Compras y, cuando el comprobante aparece en ARCA, se usa el de ARCA (se cruzan por CUIT, punto de venta y número).
- La ruta `/api/tickets/leer` necesita la variable de entorno `ANTHROPIC_API_KEY` en el servidor.

## Balance (estados contables)

- Pestaña **Balance** (solo el estudio): fecha de cierre, inventario final, datos de la carátula.
- Descarga el Excel con el modelo de la **RT 54** (CPCE Jujuy, en `public/modelos/`): carátula, situación patrimonial, resultados, evolución del patrimonio neto, flujo de efectivo (sintético y directo), anexos de bienes de uso, propiedades de inversión, intangibles, previsiones, costo de ventas y gastos por naturaleza, y la composición de rubros de las notas.
- **Moneda homogénea (RT 6)**: reexpresa las partidas no monetarias con los índices FACPCE (Res. JG 539/18), calcula el RECPAM, deja el capital nominal con su "Ajuste de capital" y reexpresa los comparativos. Una hoja extra muestra los índices, el coeficiente y el asiento de reexpresión.
- Índices: vienen con la app (`src/lib/inflacion/indices-facpce.json`) y cada mes se sube el Excel nuevo de la FACPCE desde la misma pantalla.

## Menú por áreas

- **Impuestos** (ARCA, libros IVA, liquidación, retenciones, AXI), **Finanzas** (cobros y pagos, tickets, caja diaria, bancos y conciliación, cuentas corrientes, unidades), **Inventarios**, **Contabilidad** (solo el estudio) y **Mensajes**.
- Contabilidad: asientos manuales, libro diario, libro mayor, sumas y saldos, resultados mensuales, ajuste por inflación impositivo, estados contables (anual o intermedio) y ejercicio y saldos de inicio, con un período común arriba.

## Caja diaria, imputación e inventarios

- **Caja y bancos día por día**: saldo al empezar, lo que entró y salió cada día y el saldo al cierre de cada día; por cuenta y por unidad.
- Al cargar un cobro o pago se ve (y se puede cambiar) la **imputación contable**, con el asiento que genera.
- **Inventarios**: conteos de stock valuados por fecha y unidad (mercaderías, materias primas, en proceso, terminados), a mano o desde Excel. El de la fecha de cierre se usa como existencia final en los estados.

## Avisos a clientes

- En Mi estudio: modelos de aviso (vencimientos del mes, pedido de documentación, libre) que se completan solos por empresa. Se envían a los mensajes de la app con constancia de lectura y se pueden abrir en Gmail ya escritos.

## Libro diario, asientos manuales y sumas y saldos

- Pestaña **Libro diario** (estudio): todos los asientos, los automáticos (ARCA, cobros y pagos, banco) y los manuales.
- Asientos manuales para ajustes, amortizaciones o cierre: se controla que balanceen y que las cuentas sean imputables. Botón para armar la refundición de IVA a una fecha.
- **Balance de sumas y saldos** de cualquier período (anual o intermedio): saldo anterior, debe, haber y saldo final; se descarga en Excel.
- Los asientos manuales entran al tablero, a los estados contables y al AXI.

## Ajuste por inflación impositivo

- En **Balance**: papel de trabajo con la estructura de la planilla del estudio. Ajuste estático (activo y pasivo impositivo al inicio, computable o no según el art. 106) y dinámico (retiros, compras de bienes no computables, aportes, mes a mes) con el IPC.
- Los importes salen del sistema y se pueden corregir; las correcciones quedan guardadas en el cierre. Descarga en Excel con fórmulas.

## Vencimientos

- Al entrar, el estudio ve **Mi estudio**: los vencimientos de los próximos 15, 30 o 60 días de todas las empresas, y las empresas.
- Calendario 2026 de la Comisión Federal de Impuestos por terminación de CUIT: IVA, Ganancias (sociedades y personas humanas, con la DDJJ al 5.º mes del cierre), SICORE, Bienes Personales, monotributo y Mis Facilidades.
- En cada empresa, "Impuestos" define el mes de cierre y qué impuestos tiene (si no se elige, los de su condición frente al IVA).

## Mensajes

- El cliente escribe dudas o avisos en la pestaña **Mensajes**; el estudio los ve por empresa y contesta ahí mismo.
- Los mensajes sin leer se marcan en la pestaña, en el selector de empresa y en la pantalla Empresas (se actualiza cada 30 segundos).
- Cada uno ve si su mensaje fue leído.

Por ahora no guarda nada: los archivos se leen en el navegador. En `public/ejemplos/` hay dos archivos de prueba.

## Base de datos (Supabase)

- Esquema y permisos en `supabase/migrations/`. Cada dato pertenece a una empresa; el estudio ve todo y cada cliente solo las empresas a las que fue invitado.
- Ingreso con **mail y contraseña**: el estudio crea la contraseña de cada cliente desde Empresas → Accesos ("Crear contraseña") y cada uno la puede cambiar desde "Contraseña". También se puede entrar sin contraseña con un link al mail. Los mails del estudio se listan en la tabla `emails_estudio`.
- Para crear contraseñas, el servidor necesita `SUPABASE_SERVICE_ROLE_KEY` (clave de servicio de Supabase; nunca va al navegador).
- El estudio puede **ver la app como el cliente** ("Ver como cliente").
- La app necesita estas variables (en `.env.local` para correrla en la compu, y en el servicio donde se publique):

```
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clave anónima del proyecto>
ANTHROPIC_API_KEY=<para leer las fotos de los tickets>
```

- Sin esas variables, la app funciona como prototipo (los datos no se guardan).
- Prueba de integración contra la base real: `SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... npx vitest run repositorio.integracion` (crea datos de prueba y los borra).

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
| `src/lib/movimientos/` | Cobros y pagos del cliente: asientos, validación y cruce con el banco |
| `src/lib/cuentas/` | Cuentas corrientes de clientes y proveedores |
| `src/components/cuentas/` | Pantalla de cuentas corrientes |
| `src/lib/contabilidad/` | Libro diario, mayor, balance, estado de resultados e índices |
| `src/components/tablero/` | Tablero de inicio |
| `src/lib/datos/` | Lectura y guardado en Supabase |
| `src/components/acceso/` | Ingreso con el mail |
| `src/components/empresas/` | Alta de empresas y accesos de los clientes |
| `supabase/` | Migraciones de la base y prueba de permisos |
| `src/lib/unidades/` | Asignación de ventas, compras, pagos y banco a cada unidad de negocio |
| `src/components/unidades/` | Asignación de proveedores a unidades |
| `src/lib/plan/` | Plan de cuentas modelo |
| `src/components/movimientos/` | Pantalla de cobros y pagos |
| `src/lib/tickets/` | Lectura de tickets: QR de ARCA, instrucciones para Claude, controles |
| `src/app/api/tickets/leer/` | Ruta del servidor que lee la foto con la API de Anthropic |
| `src/components/tickets/` | Pantalla de carga de tickets |
| `src/components/mensajes/` | Mensajes entre el cliente y el estudio |
| `src/lib/contabilidad/estados.ts` | Estados contables por rubro (RT 54) |
| `src/lib/contabilidad/reexpresion.ts` | Ajuste por inflación contable (RT 6) |
| `src/lib/contabilidad/exportar-rt54.ts` | Excel con el modelo RT 54 |
| `src/lib/inflacion/` | Índices FACPCE |
| `src/lib/vencimientos/` | Calendario de vencimientos |
| `src/components/balance/` | Pantalla de balance |
| `public/ejemplos/` | Archivos de ejemplo de Mis Comprobantes |
