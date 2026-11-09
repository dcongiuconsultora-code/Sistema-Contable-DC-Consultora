-- Monotributo: categoría de cada empresa y la tabla de categorías vigente (la carga el estudio).
alter table public.empresas add column categoria_monotributo text;
alter table public.empresas add column actividad_monotributo text check (actividad_monotributo in ('servicios', 'bienes'));

-- Parámetros generales del estudio (por ejemplo, la tabla de categorías del monotributo).
create table public.parametros (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);
alter table public.parametros enable row level security;
create policy "ver" on public.parametros for select to authenticated using (true);
create policy "estudio carga" on public.parametros for all using (public.es_estudio()) with check (public.es_estudio());
