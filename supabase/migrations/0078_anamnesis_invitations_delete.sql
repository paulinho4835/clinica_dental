-- 0078_anamnesis_invitations_delete.sql — política RLS de DELETE faltante
-- anamnesis_invitations solo tenía policies de select/insert/update: cualquier
-- delete() hecho con la sesión del usuario (no service-role) borraba 0 filas
-- en silencio, sin error, por RLS. Afectaba tanto a "eliminar registro
-- pendiente" (Pacientes) como al "regenerar enlace" existente.

drop policy if exists anamnesis_invitations_delete on anamnesis_invitations;
create policy anamnesis_invitations_delete on anamnesis_invitations
  for delete
  using (clinic_id = (select auth_clinic_id()));

notify pgrst, 'reload schema';
