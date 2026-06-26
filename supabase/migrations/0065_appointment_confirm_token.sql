-- Confirmación de cita por el paciente (enlace en el recordatorio de WhatsApp).
-- `confirm_token` es un identificador imposible de adivinar que va en el enlace
-- /c/<token>; al abrirlo el paciente confirma o cancela su cita sin login.
-- `confirmed_at` sella el momento en que el paciente confirmó (distinto de que
-- la recepción la confirme manualmente; el estado 'confirmed' ya existía).

alter table appointments
  add column if not exists confirm_token uuid not null default gen_random_uuid(),
  add column if not exists confirmed_at timestamptz;

-- Único: el token identifica una sola cita. Postgres ya rellenó las filas
-- existentes con el default al agregar la columna.
create unique index if not exists appointments_confirm_token_idx
  on appointments (confirm_token);
