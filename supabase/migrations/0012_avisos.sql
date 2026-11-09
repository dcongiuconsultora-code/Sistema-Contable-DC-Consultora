-- Avisos del estudio a los clientes: quedan como mensajes con asunto (con constancia de lectura).
alter table public.mensajes add column asunto text;

-- Modelos de avisos que arma el estudio (recordatorios, pedidos de documentación).
create table public.plantillas_aviso (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  asunto text not null,
  cuerpo text not null,
  actualizado_en timestamptz not null default now()
);
alter table public.plantillas_aviso enable row level security;
create policy "estudio administra" on public.plantillas_aviso for all using (public.es_estudio()) with check (public.es_estudio());
