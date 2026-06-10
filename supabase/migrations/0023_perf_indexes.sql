-- Índices para que patients_doctor_scope no haga full scan.
create index if not exists idx_appts_dentist_name
  on appointments(clinic_id, dentist_name);

create index if not exists idx_doctor_works_patient
  on doctor_works(doctor_id, patient_id);
