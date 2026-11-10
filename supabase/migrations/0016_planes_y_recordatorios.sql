-- Planes de pago (Mis Facilidades de ARCA y provinciales) y recordatorios automáticos.

create table public.planes_pago (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  organismo text not null default 'ARCA',
  numero text not null default '',
  descripcion text not null default '',
  cuotas integer not null check (cuotas between 1 and 240),
  primera_cuota text not null check (primera_cuota ~ '^\d{4}-\d{2}$'),
  importe_cuota numeric(16, 2) not null default 0,
  -- null = el día de Mis Facilidades del calendario (ARCA); si no, el día fijo del plan.
  dia_vencimiento smallint check (dia_vencimiento between 1 and 31),
  cuotas_pagadas integer[] not null default '{}',
  estado text not null default 'vigente' check (estado in ('vigente', 'cancelado', 'caducado')),
  creado_en timestamptz not null default now()
);
create index on public.planes_pago (empresa_id);
alter table public.planes_pago enable row level security;
create policy "ver" on public.planes_pago for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.planes_pago for insert with check (public.puede_ver(empresa_id));
create policy "cambiar" on public.planes_pago for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "borrar" on public.planes_pago for delete using (public.puede_ver(empresa_id));

-- Qué recordatorio ya se mandó a cada empresa (para no repetirlo). Solo lo escribe el servidor.
create table public.recordatorios_enviados (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  clave text not null,
  por_mail boolean not null default false,
  enviado_en timestamptz not null default now(),
  primary key (empresa_id, clave)
);
alter table public.recordatorios_enviados enable row level security;
create policy "ver" on public.recordatorios_enviados for select using (public.puede_ver(empresa_id));

-- Los avisos automáticos los escribe el servidor (sin usuario): quedan como del estudio.
alter table public.mensajes alter column autor drop not null;
create or replace function public.marcar_autor_mensaje() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    new.autor := null;
    new.de_estudio := true;
  else
    new.autor := auth.uid();
    new.de_estudio := public.es_estudio();
  end if;
  new.leido := false;
  return new;
end;
$$;
