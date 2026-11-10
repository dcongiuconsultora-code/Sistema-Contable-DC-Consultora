-- Ficha del cliente: datos de contacto, actividad e Ingresos Brutos.
alter table public.empresas
  add column actividad text not null default '',
  add column domicilio text not null default '',
  add column localidad text not null default '',
  add column provincia text not null default '',
  add column codigo_postal text not null default '',
  add column telefono text not null default '',
  add column email_contacto text not null default '',
  add column contacto text not null default '',
  add column inicio_actividades date,
  add column iibb_numero text not null default '',
  add column iibb_regimen text not null default '',
  add column notas text not null default '';
