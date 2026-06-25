-- 0059_evolution_notes_soap.sql — Notas clínicas SOAP (Fase 2)
-- Amplía patient_evolution_notes con estructura SOAP y vínculo a cita.
-- Backward compat: notas libres existentes quedan como note_type='free', body intacto.
-- También corrige el bug de RLS en 0048 que excluía al rol 'colega'.

-- ── Columnas nuevas en patient_evolution_notes ───────────────────────────────
alter table patient_evolution_notes
  add column if not exists note_type      text not null default 'free'
    check (note_type in ('free', 'soap')),
  add column if not exists appointment_id uuid
    references appointments(id) on delete set null,
  add column if not exists subjective     text not null default '',
  add column if not exists objective      text not null default '',
  add column if not exists assessment     text not null default '',
  add column if not exists plan           text not null default '';

create index if not exists evolution_notes_appointment_idx
  on patient_evolution_notes (appointment_id)
  where appointment_id is not null;

-- ── Columnas nuevas en patient_evolution_note_history ───────────────────────
-- Nullable: los registros históricos anteriores no tienen estos campos.
alter table patient_evolution_note_history
  add column if not exists note_type   text,
  add column if not exists subjective  text,
  add column if not exists objective   text,
  add column if not exists assessment  text,
  add column if not exists plan        text;

-- ── Trigger actualizado: captura cambios en CUALQUIER campo de contenido ────
create or replace function log_evolution_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
    -- Disparar si cambió el body O cualquiera de los campos SOAP.
    if (
      new.body       is distinct from old.body       or
      new.subjective is distinct from old.subjective or
      new.objective  is distinct from old.objective  or
      new.assessment is distinct from old.assessment or
      new.plan       is distinct from old.plan
    ) then
      insert into patient_evolution_note_history
        (note_id, patient_id, clinic_id, author_id, author_name,
         body, version_created_at, action,
         note_type, subjective, objective, assessment, plan)
      values
        (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name,
         old.body, old.created_at, 'edited',
         old.note_type, old.subjective, old.objective, old.assessment, old.plan);
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into patient_evolution_note_history
      (note_id, patient_id, clinic_id, author_id, author_name,
       body, version_created_at, action,
       note_type, subjective, objective, assessment, plan)
    values
      (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name,
       old.body, old.created_at, 'deleted',
       old.note_type, old.subjective, old.objective, old.assessment, old.plan);
    return old;
  end if;
  return null;
end;
$$;

-- ── Corrección de RLS: agregar 'colega' al policy de insert (bug en 0048) ───
-- 0048 creó evolution_insert sin incluir el rol 'colega'. Lo reemplazamos.
drop policy if exists evolution_insert on patient_evolution_notes;

create policy evolution_insert on patient_evolution_notes
  for insert
  with check (
    clinic_id  = (select auth_clinic_id())
    and author_id = (select auth.uid())
    and (select auth_role()) in
      ('admin', 'odontologo_general', 'especialista', 'colega')
  );
