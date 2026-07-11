-- 0082_doctor_works_invoiced.sql — registro de si se entregó factura al paciente
-- Campo informativo (no afecta montos ni comisiones). Nullable a propósito:
-- los trabajos anteriores a esta migración quedan en null = "sin dato".

alter table doctor_works
  add column if not exists invoiced boolean;

comment on column doctor_works.invoiced is
  'Si al paciente se le entregó factura por este trabajo. null = registrado antes de existir el campo.';

notify pgrst, 'reload schema';
