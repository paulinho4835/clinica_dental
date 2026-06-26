-- 0061_anamnesis_invitation_review.sql — Revisión y aprobación del historial
-- Lo que el paciente envía YA NO entra directo al expediente: queda como
-- "propuesta pendiente" en la invitación. El doctor la revisa y decide
-- aplicarla al expediente o descartarla. Así el paciente nunca modifica el
-- registro clínico oficial por sí solo.

alter table anamnesis_invitations
  add column if not exists submitted_data      jsonb,
  add column if not exists submitted_allergies text[] not null default '{}',
  add column if not exists submitted_alerts    text[] not null default '{}',
  add column if not exists reviewed_at         timestamptz,
  add column if not exists review_action       text
    check (review_action in ('applied', 'discarded'));

-- Estados de una invitación:
--   completed_at IS NULL                      → pendiente (paciente no envió)
--   completed_at, reviewed_at IS NULL         → enviada, esperando revisión
--   reviewed_at, review_action = 'applied'    → aplicada al expediente
--   reviewed_at, review_action = 'discarded'  → descartada por el doctor

-- Actualización: el staff de la clínica puede registrar la revisión
-- (reviewed_at / review_action). El envío del paciente usa service-role.
drop policy if exists anamnesis_invitations_update on anamnesis_invitations;
create policy anamnesis_invitations_update on anamnesis_invitations
  for update
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

notify pgrst, 'reload schema';
