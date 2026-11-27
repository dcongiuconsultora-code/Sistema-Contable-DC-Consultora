-- Unidad de negocio elegida a mano para una factura (cuando un proveedor le vende a varias
-- unidades). Si está vacía, manda la unidad del proveedor.
alter table public.comprobantes add column if not exists unidad_id uuid references public.unidades_negocio (id) on delete set null;
