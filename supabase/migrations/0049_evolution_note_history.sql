-- 0049_evolution_note_history.sql — Historial inmutable de notas de evolución
-- Cada vez que una nota se EDITA o se BORRA, un trigger guarda la versión
-- anterior en patient_evolution_note_history. El registro es append-only e
-- inmutable: los clientes solo pueden leerlo (lo inserta el trigger con
-- SECURITY DEFINER), nunca modificarlo ni borrarlo. Sirve de respaldo
-- medico-legal ante errores o cambios del doctor.

create table if not exists patient_evolution_note_history (
  id                 uuid primary key default gen_random_uuid(),
  note_id            uuid not null,            -- referencia lógica (sin FK: sobrevive al borrado de la nota)
  patient_id         uuid not null,
  clinic_id          uuid not null,
  author_id          uuid,                     -- autor de ESA versión
  author_name        text not null,
  body               text not null,            -- contenido de la versión reemplazada/eliminada
  version_created_at timestamptz,              -- created_at original de la versión
  action             text not null check (action in ('edited', 'deleted')),
  changed_at         timestamptz not null default now()
);

create index if not exists evolution_note_history_patient_idx
  on patient_evolution_note_history (patient_id, changed_at desc);

alter table patient_evolution_note_history enable row level security;

-- Lectura: cualquier miembro de la clínica. Sin políticas de insert/update/delete
-- → los clientes NO pueden escribir ni alterar el historial. Solo el trigger.
create policy evolution_history_select on patient_evolution_note_history
  for select
  using (clinic_id = (select auth_clinic_id()));

-- ── Trigger: snapshot de la versión anterior ────────────────────────────────
create or replace function log_evolution_note_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'UPDATE') then
    -- Solo registrar si el cuerpo cambió (ignora toques de updated_at sin contenido).
    if (new.body is distinct from old.body) then
      insert into patient_evolution_note_history
        (note_id, patient_id, clinic_id, author_id, author_name, body, version_created_at, action)
      values
        (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name, old.body, old.created_at, 'edited');
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    insert into patient_evolution_note_history
      (note_id, patient_id, clinic_id, author_id, author_name, body, version_created_at, action)
    values
      (old.id, old.patient_id, old.clinic_id, old.author_id, old.author_name, old.body, old.created_at, 'deleted');
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists evolution_note_history on patient_evolution_notes;
create trigger evolution_note_history
  before update or delete on patient_evolution_notes
  for each row execute function log_evolution_note_change();
