-- Quién cobró el pago al paciente (recepcionista que atendió la caja).
alter table doctor_works
  add column collected_by_id uuid references profiles(id) on delete set null;
