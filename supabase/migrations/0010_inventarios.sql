-- Inventarios (conteos de stock valuados): los carga el cliente o el estudio, por fecha y unidad.
create table public.inventarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fecha date not null,
  unidad_id uuid references public.unidades_negocio (id) on delete set null,
  descripcion text not null default '',
  -- [{ cuenta (1.1.05.xxx), producto, cantidad, medida, costo }]
  lineas jsonb not null default '[]' check (jsonb_typeof(lineas) = 'array'),
  cargado_por uuid default auth.uid() references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now()
);
create index on public.inventarios (empresa_id, fecha);

alter table public.inventarios enable row level security;
create policy "ver" on public.inventarios for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.inventarios for insert with check (public.puede_ver(empresa_id));
create policy "cambiar" on public.inventarios for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "borrar" on public.inventarios for delete using (public.puede_ver(empresa_id));
