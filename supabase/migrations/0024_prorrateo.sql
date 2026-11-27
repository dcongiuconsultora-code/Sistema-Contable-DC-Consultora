-- Prorrateo entre unidades de negocio: un proveedor o una factura puntual se reparte por
-- porcentaje entre varias unidades ([{unidad, porcentaje}]).
alter table public.comprobantes add column if not exists reparto jsonb;
alter table public.proveedores_unidad add column if not exists reparto jsonb;
