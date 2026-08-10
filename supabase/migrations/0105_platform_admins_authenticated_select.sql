-- El layout consulta platform_admins con la sesión del usuario para detectar
-- al operador de plataforma. RLS limita el resultado a su propia fila.
grant select on table public.platform_admins to authenticated;
