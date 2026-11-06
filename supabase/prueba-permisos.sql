-- Prueba de permisos: simula un usuario del estudio y dos clientes de empresas distintas.
-- Correr con la API de administración de Supabase agregando "rollback;" al final: no deja datos.
begin;
create temp table resultado (prueba text, valor text) on commit drop;
grant all on resultado to authenticated, anon;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000e', 'estudio@prueba.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000a', 'cliente-a@prueba.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'cliente-b@prueba.local', 'authenticated', 'authenticated');
update public.perfiles set rol = 'estudio' where usuario_id = '00000000-0000-0000-0000-00000000000e';
insert into public.empresas (id, razon_social, cuit) values
  ('10000000-0000-0000-0000-00000000000a', 'Empresa A', '30711111111'),
  ('10000000-0000-0000-0000-00000000000b', 'Empresa B', '30722222222');
insert into public.miembros values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-00000000000a'),
                                   ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-00000000000b');
insert into public.movimientos (empresa_id, tipo, fecha, importe, medio, estado) values
  ('10000000-0000-0000-0000-00000000000a', 'cobro', '2026-10-01', 100, 'efectivo', 'aprobado'),
  ('10000000-0000-0000-0000-00000000000b', 'cobro', '2026-10-01', 200, 'efectivo', 'enviado');

-- Cliente A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
insert into resultado select 'A ve empresas', string_agg(razon_social, ',') from public.empresas;
insert into resultado select 'A ve movimientos (importes)', string_agg(importe::text, ',') from public.movimientos;
insert into public.movimientos (empresa_id, tipo, fecha, importe, medio) values ('10000000-0000-0000-0000-00000000000a', 'gasto', '2026-10-02', 50, 'efectivo');
insert into resultado select 'A cargó un gasto en su empresa', count(*)::text from public.movimientos where importe = 50;
update public.movimientos set importe = 999 where importe = 100;
insert into resultado select 'A no pudo cambiar un movimiento aprobado', (count(*) = 0)::text from public.movimientos where importe = 999;
savepoint s1;
do $$ begin
  insert into public.movimientos (empresa_id, tipo, fecha, importe, medio) values ('10000000-0000-0000-0000-00000000000b', 'gasto', '2026-10-02', 70, 'efectivo');
  insert into resultado values ('A cargó en la empresa de B', 'SÍ (MAL)');
exception when others then insert into resultado values ('A cargó en la empresa de B', 'no: rechazado');
end $$;
do $$ begin
  insert into public.movimientos (empresa_id, tipo, fecha, importe, medio, estado) values ('10000000-0000-0000-0000-00000000000a', 'gasto', '2026-10-02', 80, 'efectivo', 'aprobado');
  insert into resultado values ('A se autoaprobó un movimiento', 'SÍ (MAL)');
exception when others then insert into resultado values ('A se autoaprobó un movimiento', 'no: rechazado');
end $$;
do $$ begin
  insert into public.comprobantes (empresa_id, operacion, fecha, tipo_codigo, tipo_nombre, clase, punto_venta, numero_desde, numero_hasta, total, computa_iva)
  values ('10000000-0000-0000-0000-00000000000a', 'ventas', '2026-10-01', 1, 'Factura A', 'factura', 1, 1, 1, 10, true);
  insert into resultado values ('A cargó comprobantes de ARCA', 'SÍ (MAL)');
exception when others then insert into resultado values ('A cargó comprobantes de ARCA', 'no: rechazado');
end $$;

-- Estudio
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000e","role":"authenticated"}', true);
insert into resultado select 'Estudio ve empresas', string_agg(razon_social, ',' order by razon_social) from public.empresas;
update public.movimientos set estado = 'aprobado' where importe = 200;
insert into resultado select 'Estudio aprobó el de B', count(*)::text from public.movimientos where importe = 200 and estado = 'aprobado';

-- Sin usuario
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into resultado select 'Sin iniciar sesión ve movimientos', count(*)::text from public.movimientos;
reset role;
select json_agg(r) from resultado r;
