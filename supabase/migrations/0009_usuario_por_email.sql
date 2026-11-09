-- Para que el servidor (con la clave de servicio) encuentre un usuario por su mail al crearle la
-- contraseña. No se expone a los usuarios de la app.
create function public.usuario_por_email(buscado text) returns table (id uuid)
language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(buscado);
$$;
revoke execute on function public.usuario_por_email(text) from public, anon, authenticated;
grant execute on function public.usuario_por_email(text) to service_role;
