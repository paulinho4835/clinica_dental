-- 0081_anamnesis_invitations_recepcionista.sql — recepción puede enviar registros
-- La política de INSERT de 0060 omitía a 'recepcionista': al enviar el enlace de
-- registro/anamnesis por WhatsApp, el insert fallaba por RLS solo para recepción.
-- Se recrea la política incluyendo el rol.

drop policy if exists anamnesis_invitations_insert on anamnesis_invitations;
create policy anamnesis_invitations_insert on anamnesis_invitations
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in
      ('admin', 'recepcionista', 'odontologo_general', 'especialista', 'colega')
  );

notify pgrst, 'reload schema';
