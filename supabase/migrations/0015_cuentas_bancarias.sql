-- Cuentas bancarias y billeteras virtuales de cada empresa (CBU/CVU, alias). Las cargan el cliente o
-- el estudio.
create table public.cuentas_bancarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  clase text not null check (clase in ('banco', 'billetera')),
  entidad text not null,
  tipo_cuenta text not null default 'cc' check (tipo_cuenta in ('cc', 'ca', 'billetera')),
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  numero text not null default '',
  cbu text not null default '' check (cbu = '' or cbu ~ '^\d{22}$'),
  alias text not null default '',
  cuenta_contable text not null,
  unidad_id uuid references public.unidades_negocio (id) on delete set null,
  activa boolean not null default true,
  creada_en timestamptz not null default now()
);
create index on public.cuentas_bancarias (empresa_id);
alter table public.cuentas_bancarias enable row level security;
create policy "ver" on public.cuentas_bancarias for select using (public.puede_ver(empresa_id));
create policy "cargar" on public.cuentas_bancarias for insert with check (public.puede_ver(empresa_id));
create policy "cambiar" on public.cuentas_bancarias for update using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));
create policy "borrar" on public.cuentas_bancarias for delete using (public.puede_ver(empresa_id));

-- El cobro o pago puede indicar la cuenta exacta por la que entró o salió la plata.
alter table public.movimientos add column cuenta_bancaria_id uuid references public.cuentas_bancarias (id) on delete set null;
