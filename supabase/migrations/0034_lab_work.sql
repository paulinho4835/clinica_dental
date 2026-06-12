-- Trabajo enviado a laboratorio externo (prótesis, ortodoncia, etc.).
alter table doctor_works
  add column lab_work text,
  add column lab_cost numeric(12,2) not null default 0;
