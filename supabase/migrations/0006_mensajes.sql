-- Mensajes entre el cliente y el estudio, por empresa.

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  autor uuid not null default auth.uid() references auth.users (id) on delete set null,
  -- Lo completa la base según quién escribe; no lo elige la app.
  de_estudio boolean not null default false,
  texto text not null check (length(trim(texto)) > 0 and length(texto) <= 4000),
  creado_en timestamptz not null default now(),
  leido boolean not null default false
);
create index on public.mensajes (empresa_id, creado_en);

create function public.marcar_autor_mensaje() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.autor := auth.uid();
  new.de_estudio := public.es_estudio();
  new.leido := false;
  return new;
end;
$$;

create trigger al_escribir_mensaje before insert on public.mensajes
  for each row execute function public.marcar_autor_mensaje();

alter table public.mensajes enable row level security;
create policy "ver" on public.mensajes for select using (public.puede_ver(empresa_id));
create policy "escribir" on public.mensajes for insert with check (public.puede_ver(empresa_id));
-- Marcar como leídos los mensajes que escribió la otra parte.
create policy "marcar leído" on public.mensajes for update
  using (public.puede_ver(empresa_id) and de_estudio <> public.es_estudio())
  with check (public.puede_ver(empresa_id));
