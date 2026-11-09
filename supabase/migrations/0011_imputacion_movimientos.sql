-- Cuenta contable elegida a mano en un cobro o pago (tiene prioridad sobre la automática).
alter table public.movimientos add column imputacion text;
