-- Quién es del estudio y cómo entran los clientes.
-- Cualquiera puede pedir un código de ingreso, pero solo ve algo quien es del estudio o fue
-- invitado por el estudio a una empresa.

create table public.emails_estudio (
  email text primary key check (email = lower(email))
);
alter table public.emails_estudio enable row level security;
create policy "estudio ve" on public.emails_estudio for select using (public.es_estudio());
create policy "estudio administra" on public.emails_estudio for all using (public.es_estudio()) with check (public.es_estudio());

insert into public.emails_estudio values ('dcongiuconsultora@gmail.com');

create table public.invitaciones (
  email text not null check (email = lower(email)),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  invitado_en timestamptz not null default now(),
  primary key (email, empresa_id)
);
alter table public.invitaciones enable row level security;
create policy "estudio administra invitaciones" on public.invitaciones for all using (public.es_estudio()) with check (public.es_estudio());
create policy "ver invitaciones propias" on public.invitaciones for select
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Al crearse un usuario: si su mail es del estudio, rol estudio; si tiene invitaciones, se lo
-- asocia a esas empresas.
create or replace function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (usuario_id, nombre, rol)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', ''),
    case when exists (select 1 from public.emails_estudio where email = lower(new.email)) then 'estudio' else 'cliente' end
  );
  insert into public.miembros (usuario_id, empresa_id)
  select new.id, empresa_id from public.invitaciones where email = lower(new.email)
  on conflict do nothing;
  return new;
end;
$$;

-- Si se invita a alguien que ya tiene usuario, se lo asocia en el momento.
create function public.aplicar_invitacion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.miembros (usuario_id, empresa_id)
  select id, new.empresa_id from auth.users where lower(email) = new.email
  on conflict do nothing;
  return new;
end;
$$;

create trigger al_invitar after insert on public.invitaciones
  for each row execute function public.aplicar_invitacion();

-- Datos generales de cada archivo importado (por ejemplo, saldos y período de un resumen bancario).
alter table public.archivos_importados add column datos jsonb not null default '{}';

-- Movimientos bancarios: la cuenta del resumen a la que pertenecen y su posición, para rearmarlo igual.
alter table public.movimientos_bancarios add column orden integer not null default 0;
alter table public.movimientos_bancarios add column pagina integer not null default 1;
alter table public.movimientos_bancarios drop constraint movimientos_bancarios_empresa_id_cuenta_fecha_referencia_im_key;
alter table public.movimientos_bancarios add constraint movimientos_bancarios_unico unique (archivo_id, orden);
