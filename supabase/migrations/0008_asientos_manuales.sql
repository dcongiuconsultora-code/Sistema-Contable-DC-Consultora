-- Asientos que carga el estudio a mano (ajustes, amortizaciones, refundiciones, cierre).

create table public.asientos_manuales (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fecha date not null,
  descripcion text not null default '',
  -- [{ cuenta, debe, haber, detalle? }]
  lineas jsonb not null check (jsonb_typeof(lineas) = 'array' and jsonb_array_length(lineas) >= 2),
  unidad_id uuid references public.unidades_negocio (id) on delete set null,
  creado_por uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en timestamptz not null default now()
);
create index on public.asientos_manuales (empresa_id, fecha);

alter table public.asientos_manuales enable row level security;
create policy "ver" on public.asientos_manuales for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.asientos_manuales for all using (public.es_estudio()) with check (public.es_estudio());
