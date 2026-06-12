-- Recepcionista que registró el cobro en la ficha del paciente.
alter table payments
  add column collected_by_id uuid references profiles(id) on delete set null;
