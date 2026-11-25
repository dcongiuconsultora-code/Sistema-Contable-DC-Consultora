-- DDJJ mensual de Ingresos Brutos: impuesto determinado y deducciones (retenciones, percepciones,
-- SIRCREB). El saldo a favor se arrastra al mes siguiente y genera el asiento automático.
create table public.liquidaciones_iibb (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  periodo text not null check (periodo ~ '^\d{4}-\d{2}$'),
  datos jsonb not null default '{}',
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, periodo)
);
alter table public.liquidaciones_iibb enable row level security;
create policy "ver" on public.liquidaciones_iibb for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.liquidaciones_iibb for all using (public.es_estudio()) with check (public.es_estudio());
