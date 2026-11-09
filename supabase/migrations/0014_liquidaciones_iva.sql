-- Liquidaciones de IVA por período: lo que el estudio corrige a mano y, al presentarla, el resultado
-- que se arrastra al mes siguiente (saldo técnico y de libre disponibilidad).
create table public.liquidaciones_iva (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-\d{2}$'),
  manual jsonb not null default '{}',
  presentada boolean not null default false,
  resultado jsonb,
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, periodo)
);
alter table public.liquidaciones_iva enable row level security;
create policy "ver" on public.liquidaciones_iva for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.liquidaciones_iva for all using (public.es_estudio()) with check (public.es_estudio());
