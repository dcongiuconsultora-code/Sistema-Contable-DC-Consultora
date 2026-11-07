-- El cliente sube sus resúmenes bancarios (los comprobantes de ARCA y las retenciones los sigue
-- cargando solo el estudio).

create policy "cliente sube resúmenes bancarios" on public.archivos_importados for insert
  with check (public.puede_ver(empresa_id) and tipo = 'resumen_bancario');

create policy "cliente sube movimientos del resumen" on public.movimientos_bancarios for insert
  with check (
    public.puede_ver(empresa_id)
    and exists (
      select 1 from public.archivos_importados a
      where a.id = archivo_id and a.empresa_id = movimientos_bancarios.empresa_id and a.tipo = 'resumen_bancario'
    )
  );
