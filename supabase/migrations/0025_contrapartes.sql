-- Clientes (y proveedores) que la empresa carga a mano, además de los que vienen de ARCA:
-- para elegirlos al registrar cobros y pagos.
create table public.contrapartes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null check (tipo in ('cliente', 'proveedor')),
  nombre text not null,
  cuit text not null default '',
  creado_en timestamptz not null default now(),
  unique (empresa_id, tipo, nombre)
);
alter table public.contrapartes enable row level security;
create policy "ver" on public.contrapartes for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.contrapartes for insert with check (public.puede_ver(empresa_id));
create policy "estudio administra" on public.contrapartes for all using (public.es_estudio()) with check (public.es_estudio());
