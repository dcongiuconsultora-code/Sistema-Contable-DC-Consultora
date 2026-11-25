-- DDJJ importadas desde el PDF presentado. La de IVA y el Libro IVA Digital van con la
-- liquidación del mes; las anuales (Ganancias) en su propia tabla, por fecha de cierre.
alter table public.liquidaciones_iva add column ddjj jsonb, add column libro jsonb;

create table public.declaraciones_juradas (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  impuesto text not null,
  periodo text not null,
  datos jsonb not null,
  archivo text,
  actualizado_en timestamptz not null default now(),
  primary key (empresa_id, impuesto, periodo)
);
alter table public.declaraciones_juradas enable row level security;
create policy "ver" on public.declaraciones_juradas for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.declaraciones_juradas for all using (public.es_estudio()) with check (public.es_estudio());
