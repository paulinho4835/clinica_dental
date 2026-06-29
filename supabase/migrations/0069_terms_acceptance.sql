-- ----------------------------------------------------------------------------
-- Aceptación de Términos y Condiciones de la plataforma.
-- La PRIMERA vez que el administrador de una clínica inicia sesión, el dashboard
-- muestra un aviso bloqueante con los Términos y la Política de Privacidad hasta
-- que los acepta. Aquí se registra el instante de esa aceptación.
--   null  = todavía no aceptó (se muestra el aviso)
--   fecha = aceptado (no se vuelve a mostrar)
-- Solo aplica al rol 'admin': acepta en nombre de toda la clínica; el resto del
-- personal (recepción, doctores, asistentes) opera bajo esa aceptación.
-- La policy profiles_admin_write ya permite que el admin actualice su propia fila.
-- ----------------------------------------------------------------------------
alter table profiles
  add column if not exists terms_accepted_at timestamptz;
