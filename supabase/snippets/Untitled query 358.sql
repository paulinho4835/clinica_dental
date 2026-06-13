-- Eliminar políticas existentes para recrearlas limpiamente
drop policy if exists consent_templates_select on consent_templates;
drop policy if exists consent_templates_insert on consent_templates;
drop policy if exists consent_templates_update on consent_templates;
drop policy if exists consent_templates_delete on consent_templates;

-- Recrear políticas
create policy consent_templates_select on consent_templates
  for select
  using (clinic_id = (select auth_clinic_id()) or clinic_id is null);

create policy consent_templates_insert on consent_templates
  for insert
  with check (clinic_id = (select auth_clinic_id()));

create policy consent_templates_update on consent_templates
  for update
  using (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

create policy consent_templates_delete on consent_templates
  for delete
  using (clinic_id = (select auth_clinic_id()));

-- Tabla consents (si no existe)
create table if not exists consents (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  template_id     uuid references consent_templates(id) on delete set null,
  title           text not null,
  body            text not null,
  created_by      uuid references profiles(id) on delete set null,
  signature_data  text,
  signed_at       timestamptz,
  status          text not null default 'pendiente'
                  check (status in ('pendiente', 'firmado')),
  created_at      timestamptz not null default now()
);

alter table consents enable row level security;

drop policy if exists tenant_isolation on consents;
create policy tenant_isolation on consents
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- Seed de plantillas del sistema (solo si no existen ya)
insert into consent_templates (clinic_id, title, body, is_system, sort_order)
select * from (values
(null, 'Extracción dental simple', $$Yo, {{nombre_paciente}}, declaro que he recibido información sobre el procedimiento de EXTRACCIÓN DENTAL SIMPLE que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos inherentes al procedimiento:
• Sangrado post-operatorio
• Inflamación y dolor durante la recuperación
• Riesgo de infección post-operatoria
• Posibilidad de alveolitis (dolor severo tardío)
• Lesión temporal de estructuras adyacentes

He recibido instrucciones de cuidado post-operatorio y mis preguntas han sido respondidas satisfactoriamente. Doy mi consentimiento libre y voluntario para la realización del procedimiento.

Fecha: {{fecha}}$$, true, 1)
) as t(clinic_id, title, body, is_system, sort_order)
where not exists (select 1 from consent_templates where is_system = true limit 1);
