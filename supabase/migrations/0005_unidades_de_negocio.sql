-- Unidades de negocio dentro de una misma razón social (por ejemplo, Grupo N&P: Fabriestant,
-- Drugstore y Minimarket). Las ventas se asignan por punto de venta, las compras por proveedor, el
-- banco por cuenta (si la cuenta es de una sola unidad) y los cobros y pagos los elige quien los carga.

create table public.unidades_negocio (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nombre text not null,
  puntos_venta integer[] not null default '{}',
  cuentas_bancarias text[] not null default '{}',
  orden integer not null default 0,
  unique (empresa_id, nombre)
);

create table public.proveedores_unidad (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  cuit text not null,
  unidad_id uuid not null references public.unidades_negocio (id) on delete cascade,
  primary key (empresa_id, cuit)
);

alter table public.movimientos add column unidad_id uuid references public.unidades_negocio (id) on delete set null;
alter table public.tickets add column unidad_id uuid references public.unidades_negocio (id) on delete set null;

alter table public.unidades_negocio enable row level security;
alter table public.proveedores_unidad enable row level security;

create policy "ver" on public.unidades_negocio for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.unidades_negocio for all using (public.es_estudio()) with check (public.es_estudio());

-- Qué proveedor es de qué unidad lo sabe mejor el cliente: lo pueden indicar los dos.
create policy "ver" on public.proveedores_unidad for select using (public.puede_ver(empresa_id));
create policy "asignar" on public.proveedores_unidad for insert with check (public.puede_ver(empresa_id));
create policy "cambiar" on public.proveedores_unidad for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "quitar" on public.proveedores_unidad for delete using (public.puede_ver(empresa_id));
