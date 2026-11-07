-- Cierre de ejercicio (estados contables), índices de inflación y datos para los vencimientos.

-- Lo que el estudio completa al cerrar un ejercicio: inventario final, datos de la carátula.
create table public.cierres_ejercicio (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  cierre date not null,
  datos jsonb not null default '{}',
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, cierre)
);
alter table public.cierres_ejercicio enable row level security;
create policy "ver" on public.cierres_ejercicio for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.cierres_ejercicio for all using (public.es_estudio()) with check (public.es_estudio());

-- Índices FACPCE que se suben con el archivo nuevo de cada mes (los anteriores vienen con la app).
create table public.indices_inflacion (
  mes text primary key check (mes ~ '^\d{4}-\d{2}$'),
  valor numeric not null check (valor > 0),
  cargado_en timestamptz not null default now()
);
alter table public.indices_inflacion enable row level security;
create policy "ver" on public.indices_inflacion for select to authenticated using (true);
create policy "estudio carga" on public.indices_inflacion for all using (public.es_estudio()) with check (public.es_estudio());

-- Para el calendario de vencimientos: mes de cierre del ejercicio y qué impuestos tiene cada empresa
-- (null = los que corresponden por su condición frente al IVA).
alter table public.empresas add column mes_cierre smallint not null default 12 check (mes_cierre between 1 and 12);
alter table public.empresas add column impuestos text[];
