-- Lo que informa la constancia de inscripción de ARCA (actividades con código, impuestos con su
-- alta, otros regímenes, DNI y fecha de la constancia), para tenerlo en la ficha del cliente.
alter table public.empresas add column datos_arca jsonb;
