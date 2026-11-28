-- Órdenes de trabajo (pedidos a medida) de una unidad de negocio que fabrica, como Fabriestant
-- en Grupo N&P: qué se pidió, cuánto sale, cuánto se gastó en materiales, en qué estado está y
-- los pagos a cuenta. Se activa por unidad, así lo ven solo las empresas que lo usan.
alter table public.unidades_negocio add column if not exists ordenes_trabajo boolean not null default false;

create table public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidad_id uuid references public.unidades_negocio (id) on delete set null,
  numero text not null default '',
  fecha date not null,
  cliente text not null default '',
  tipo text not null default '',
  detalle text not null default '',
  cantidad numeric not null default 0,
  total numeric not null default 0,
  iva_aparte numeric not null default 0,
  con_factura boolean not null default false,
  factura text not null default '',
  materiales numeric not null default 0,
  plazo_dias integer,
  estado text not null default 'No empezado' check (estado in ('No empezado', 'En proceso', 'Terminado')),
  pagos jsonb not null default '[]',
  creado_en timestamptz not null default now()
);
create index on public.ordenes_trabajo (empresa_id, fecha);

-- Las órdenes las lleva el propio cliente día a día: las puede cargar, corregir y borrar.
alter table public.ordenes_trabajo enable row level security;
create policy "ver" on public.ordenes_trabajo for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.ordenes_trabajo for insert with check (public.puede_ver(empresa_id));
create policy "cambiar" on public.ordenes_trabajo for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "borrar" on public.ordenes_trabajo for delete using (public.puede_ver(empresa_id));

-- Datos de contacto de los clientes cargados a mano (vienen de la planilla de clientes).
alter table public.contrapartes add column if not exists domicilio text not null default '';
alter table public.contrapartes add column if not exists localidad text not null default '';
alter table public.contrapartes add column if not exists telefono text not null default '';
alter table public.contrapartes add column if not exists email text not null default '';
create policy "cambiar" on public.contrapartes for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
