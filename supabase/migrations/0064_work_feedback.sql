-- 0064_work_feedback.sql — Calificación del paciente por trabajo realizado
-- Tras un trabajo, la clínica genera un enlace tokenizado; el paciente lo abre
-- SIN sesión, califica (estrellas + cómo se sintió + comentario) y al enviar se
-- guarda en esta tabla, vinculado al DOCTOR que hizo el trabajo. El token es de
-- un solo uso y expira. La escritura pública pasa por service-role (server
-- action que valida el token): por eso NO hay policy de insert/update pública.
-- RLS solo gobierna lo que ve el staff.

create table if not exists work_feedback (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  work_id      uuid not null references doctor_works(id) on delete cascade,
  -- Doctor copiado del trabajo: el vínculo sobrevive aunque el trabajo se edite.
  doctor_id    uuid references profiles(id) on delete set null,
  patient_id   uuid references patients(id) on delete set null,
  clinic_id    uuid not null references clinics(id) on delete cascade,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  submitted_at timestamptz,
  rating       int check (rating between 1 and 5),
  comfort      text check (comfort in
    ('muy_incomodo', 'incomodo', 'neutral', 'comodo', 'muy_comodo')),
  comment      text
);

create index if not exists work_feedback_doctor_idx on work_feedback (doctor_id);
create index if not exists work_feedback_clinic_idx on work_feedback (clinic_id);
create index if not exists work_feedback_token_idx  on work_feedback (token);
create index if not exists work_feedback_work_idx   on work_feedback (work_id);

alter table work_feedback enable row level security;

-- Lectura: el admin ve todas las calificaciones de su clínica; cada doctor ve
-- solo las suyas (doctor_id propio). La recepcionista NO ve calificaciones
-- (no es admin y no es doctor de ningún trabajo).
drop policy if exists work_feedback_select on work_feedback;
create policy work_feedback_select on work_feedback
  for select
  using (
    clinic_id = (select auth_clinic_id())
    and (
      (select auth_role()) = 'admin'
      or doctor_id = (select auth.uid())
    )
  );

-- Inserción: solo admin y recepcionista generan invitaciones (son quienes
-- contactan al paciente y ven su teléfono). El doctor ve resultados, no envía.
drop policy if exists work_feedback_insert on work_feedback;
create policy work_feedback_insert on work_feedback
  for insert
  with check (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  );

-- Borrado: admin de la clínica (p. ej. regenerar enlace pendiente).
drop policy if exists work_feedback_delete on work_feedback;
create policy work_feedback_delete on work_feedback
  for delete
  using (
    clinic_id = (select auth_clinic_id())
    and (select auth_role()) in ('admin', 'recepcionista')
  );

notify pgrst, 'reload schema';
