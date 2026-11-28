-- La columna OT de la planilla es el número de orden de trabajo, no un plazo en días.
alter table public.ordenes_trabajo drop column if exists plazo_dias;
alter table public.ordenes_trabajo add column if not exists ot text not null default '';
