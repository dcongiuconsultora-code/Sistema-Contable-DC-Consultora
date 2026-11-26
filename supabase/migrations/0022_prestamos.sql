-- Préstamos bancarios como tipo de movimiento (cuotas y acreditación) y desglose de la cuota
-- (intereses, IVA, seguro y gastos; el resto es capital).
alter table public.movimientos drop constraint if exists movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check
  check (tipo in ('cobro', 'pago_proveedor', 'sueldo', 'honorarios', 'gasto', 'impuesto', 'socios', 'prestamo'));
alter table public.movimientos add column if not exists desglose jsonb;
