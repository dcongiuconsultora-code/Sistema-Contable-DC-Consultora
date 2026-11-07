-- El cliente también importa los archivos de ARCA de su empresa (Mis Comprobantes, Mis Retenciones,
-- SIRCREB). Cada uno borra solo los archivos que subió; los comprobantes repetidos no se duplican
-- porque se actualizan sobre el mismo registro.

alter table public.archivos_importados alter column cargado_por set default auth.uid();

create policy "cliente importa archivos" on public.archivos_importados for insert
  with check (public.puede_ver(empresa_id));
create policy "cada uno borra lo que subió" on public.archivos_importados for delete
  using (public.puede_ver(empresa_id) and cargado_por = auth.uid());

create policy "cliente importa comprobantes" on public.comprobantes for insert
  with check (public.puede_ver(empresa_id));
-- Reimportar un comprobante que ya estaba lo actualiza en lugar de duplicarlo.
create policy "cliente actualiza comprobantes" on public.comprobantes for update
  using (public.puede_ver(empresa_id)) with check (public.puede_ver(empresa_id));

create policy "cliente importa retenciones" on public.deducciones for insert
  with check (public.puede_ver(empresa_id));
create policy "cada uno borra las retenciones de sus archivos" on public.deducciones for delete
  using (
    public.puede_ver(empresa_id)
    and exists (select 1 from public.archivos_importados a where a.id = archivo_id and a.cargado_por = auth.uid())
  );

-- La política anterior quedó contenida en "cliente importa archivos".
drop policy "cliente sube resúmenes bancarios" on public.archivos_importados;
