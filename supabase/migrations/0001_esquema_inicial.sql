-- Esquema inicial del sistema contable de DC Consultora.
-- Cada dato pertenece a una empresa (cliente de la consultora). El estudio ve y modifica todo;
-- cada usuario cliente ve solo las empresas a las que está asociado y solo puede cargar
-- movimientos y tickets, que quedan "enviados" hasta que el estudio los apruebe.

-- Usuarios y empresas ------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  razon_social text not null,
  cuit text not null unique check (cuit ~ '^\d{11}$'),
  condicion_iva text not null default 'Responsable inscripto',
  regimen_iibb text,
  jurisdicciones text[] not null default '{}',
  activa boolean not null default true,
  creada_en timestamptz not null default now()
);

create table public.perfiles (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null default '',
  rol text not null default 'cliente' check (rol in ('estudio', 'cliente')),
  creado_en timestamptz not null default now()
);

create table public.miembros (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  primary key (usuario_id, empresa_id)
);

-- Cada usuario nuevo recibe un perfil de cliente; el estudio se asigna a mano.
create function public.crear_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfiles (usuario_id, nombre) values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', ''));
  return new;
end;
$$;

create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

create function public.es_estudio() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfiles where usuario_id = auth.uid() and rol = 'estudio');
$$;

create function public.puede_ver(empresa uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.es_estudio()
      or exists (select 1 from public.miembros where usuario_id = auth.uid() and empresa_id = empresa);
$$;

-- Datos de ARCA --------------------------------------------------------------------------------

create table public.archivos_importados (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null check (tipo in ('emitidos', 'recibidos', 'mis_retenciones', 'sircreb', 'resumen_bancario')),
  nombre text not null,
  cargado_por uuid references auth.users (id),
  cargado_en timestamptz not null default now()
);

create table public.comprobantes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  operacion text not null check (operacion in ('ventas', 'compras')),
  origen text not null default 'arca' check (origen in ('arca', 'ticket')),
  archivo_id uuid references public.archivos_importados (id) on delete set null,
  fecha date not null,
  tipo_codigo integer not null,
  tipo_nombre text not null,
  letra text not null default '',
  clase text not null,
  punto_venta integer not null,
  numero_desde bigint not null,
  numero_hasta bigint not null,
  cae text not null default '',
  cuit_contraparte text not null default '',
  contraparte text not null default '',
  moneda text not null default 'ARS',
  tipo_cambio numeric(14, 6) not null default 1,
  alicuotas jsonb not null default '[]',
  neto_gravado numeric(16, 2) not null default 0,
  no_gravado numeric(16, 2) not null default 0,
  exento numeric(16, 2) not null default 0,
  otros_tributos numeric(16, 2) not null default 0,
  iva numeric(16, 2) not null default 0,
  total numeric(16, 2) not null,
  computa_iva boolean not null,
  advertencias jsonb not null default '[]',
  creado_en timestamptz not null default now(),
  -- Importar dos veces el mismo archivo no duplica comprobantes.
  unique (empresa_id, operacion, tipo_codigo, punto_venta, numero_desde, cuit_contraparte)
);
create index on public.comprobantes (empresa_id, fecha);

create table public.deducciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  archivo_id uuid references public.archivos_importados (id) on delete set null,
  origen text not null,
  impuesto text not null check (impuesto in ('IVA', 'Ganancias', 'IIBB', 'Otro')),
  jurisdiccion text,
  tipo text not null check (tipo in ('percepcion', 'retencion')),
  fecha date not null,
  cuit_agente text not null default '',
  agente text not null default '',
  regimen text not null default '',
  certificado text not null default '',
  comprobante text not null default '',
  importe numeric(16, 2) not null
);
create index on public.deducciones (empresa_id, fecha);

-- Lo que carga el cliente ----------------------------------------------------------------------

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  tipo text not null check (tipo in ('cobro', 'pago_proveedor', 'sueldo', 'honorarios', 'gasto', 'impuesto', 'socios')),
  fecha date not null,
  importe numeric(16, 2) not null check (importe > 0),
  medio text not null,
  contraparte text not null default '',
  cuit_contraparte text not null default '',
  cuenta text,
  con_factura boolean,
  retenciones jsonb not null default '[]',
  periodo text,
  nota text not null default '',
  estado text not null default 'enviado' check (estado in ('enviado', 'aprobado', 'observado')),
  observacion text,
  -- 'cliente' si lo cargó el cliente; 'banco' si lo registró el estudio desde la conciliación.
  origen text not null default 'cliente' check (origen in ('cliente', 'banco')),
  creado_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index on public.movimientos (empresa_id, fecha);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  datos jsonb not null,
  foto text,
  por_qr boolean not null default false,
  creado_por uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now()
);

-- Bancos -------------------------------------------------------------------------------------

create table public.movimientos_bancarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  archivo_id uuid references public.archivos_importados (id) on delete cascade,
  banco text not null,
  cuenta text not null,
  tipo_cuenta text not null default '',
  fecha date not null,
  descripcion text not null,
  referencia text not null default '',
  importe numeric(16, 2) not null,
  saldo numeric(16, 2),
  -- Movimiento del cliente con el que quedó conciliado, si lo hay.
  movimiento_id uuid references public.movimientos (id) on delete set null,
  unique (empresa_id, cuenta, fecha, referencia, importe, descripcion)
);
create index on public.movimientos_bancarios (empresa_id, fecha);

-- Contabilidad -------------------------------------------------------------------------------

create table public.saldos_iniciales (
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  fecha date not null,
  cuenta text not null,
  importe numeric(16, 2) not null,
  primary key (empresa_id, cuenta)
);

-- Seguridad: cada fila solo la ve quien tiene acceso a su empresa ------------------------------

alter table public.empresas enable row level security;
alter table public.perfiles enable row level security;
alter table public.miembros enable row level security;
alter table public.archivos_importados enable row level security;
alter table public.comprobantes enable row level security;
alter table public.deducciones enable row level security;
alter table public.movimientos enable row level security;
alter table public.tickets enable row level security;
alter table public.movimientos_bancarios enable row level security;
alter table public.saldos_iniciales enable row level security;

create policy "ver empresas propias" on public.empresas for select using (public.puede_ver(id));
create policy "estudio administra empresas" on public.empresas for all using (public.es_estudio()) with check (public.es_estudio());

create policy "ver el propio perfil" on public.perfiles for select using (usuario_id = auth.uid() or public.es_estudio());
create policy "estudio administra perfiles" on public.perfiles for all using (public.es_estudio()) with check (public.es_estudio());

create policy "ver membresías propias" on public.miembros for select using (usuario_id = auth.uid() or public.es_estudio());
create policy "estudio administra membresías" on public.miembros for all using (public.es_estudio()) with check (public.es_estudio());

-- Lo que importa el estudio: el cliente lo puede ver, solo el estudio lo carga.
create policy "ver" on public.archivos_importados for select using (public.puede_ver(empresa_id));
create policy "estudio carga" on public.archivos_importados for all using (public.es_estudio()) with check (public.es_estudio());
create policy "ver" on public.comprobantes for select using (public.puede_ver(empresa_id));
create policy "estudio carga" on public.comprobantes for all using (public.es_estudio()) with check (public.es_estudio());
create policy "ver" on public.deducciones for select using (public.puede_ver(empresa_id));
create policy "estudio carga" on public.deducciones for all using (public.es_estudio()) with check (public.es_estudio());
create policy "ver" on public.movimientos_bancarios for select using (public.puede_ver(empresa_id));
create policy "estudio carga" on public.movimientos_bancarios for all using (public.es_estudio()) with check (public.es_estudio());
create policy "ver" on public.saldos_iniciales for select using (public.puede_ver(empresa_id));
create policy "estudio carga" on public.saldos_iniciales for all using (public.es_estudio()) with check (public.es_estudio());

-- Movimientos: el cliente los carga y corrige mientras no estén aprobados, y siempre quedan "enviados".
create policy "ver" on public.movimientos for select using (public.puede_ver(empresa_id));
create policy "estudio administra" on public.movimientos for all using (public.es_estudio()) with check (public.es_estudio());
create policy "cliente carga" on public.movimientos for insert
  with check (public.puede_ver(empresa_id) and estado = 'enviado' and origen = 'cliente');
create policy "cliente corrige" on public.movimientos for update
  using (public.puede_ver(empresa_id) and estado <> 'aprobado')
  with check (public.puede_ver(empresa_id) and estado = 'enviado' and origen = 'cliente');

-- Tickets: el cliente los carga y los puede borrar.
create policy "ver" on public.tickets for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.tickets for insert with check (public.puede_ver(empresa_id));
create policy "corregir" on public.tickets for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "borrar" on public.tickets for delete using (public.puede_ver(empresa_id));

-- Fotos de los tickets, en un depósito privado: carpeta = id de la empresa.
insert into storage.buckets (id, name, public) values ('tickets', 'tickets', false) on conflict (id) do nothing;
create policy "ver fotos de tickets" on storage.objects for select
  using (bucket_id = 'tickets' and public.puede_ver(((storage.foldername(name))[1])::uuid));
create policy "subir fotos de tickets" on storage.objects for insert
  with check (bucket_id = 'tickets' and public.puede_ver(((storage.foldername(name))[1])::uuid));
