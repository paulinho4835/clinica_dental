-- 0037_consents.sql — Addon Consentimientos Informados
-- Dos tablas:
--   consent_templates: plantillas globales (clinic_id NULL) + propias de clínica
--   consents:          consentimientos emitidos por paciente (snapshot + firma base64)

-- ─── consent_templates ───────────────────────────────────────────────────────

create table if not exists consent_templates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references clinics(id) on delete cascade,
  title       text not null,
  body        text not null,
  is_system   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- RLS especial: clinic_id puede ser NULL (plantillas del sistema visibles a todos)
alter table consent_templates enable row level security;

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

-- ─── consents ────────────────────────────────────────────────────────────────

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

create policy tenant_isolation on consents
  for all
  using  (clinic_id = (select auth_clinic_id()))
  with check (clinic_id = (select auth_clinic_id()));

-- ─── Seed: 8 plantillas del sistema ──────────────────────────────────────────

insert into consent_templates (clinic_id, title, body, is_system, sort_order) values

(null, 'Extracción dental simple',
$$Yo, {{nombre_paciente}}, declaro que he recibido información sobre el procedimiento de EXTRACCIÓN DENTAL SIMPLE que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos inherentes al procedimiento:
• Sangrado post-operatorio
• Inflamación y dolor durante la recuperación
• Riesgo de infección post-operatoria
• Posibilidad de alveolitis (dolor severo tardío)
• Lesión temporal de estructuras adyacentes

He recibido instrucciones de cuidado post-operatorio y mis preguntas han sido respondidas satisfactoriamente. Doy mi consentimiento libre y voluntario para la realización del procedimiento.

Fecha: {{fecha}}$$,
true, 1),

(null, 'Extracción de terceros molares',
$$Yo, {{nombre_paciente}}, declaro que he recibido información sobre el procedimiento de EXTRACCIÓN DE TERCEROS MOLARES (CORDALES) que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos:
• Sangrado e inflamación post-operatoria significativa
• Dolor durante varios días posteriores al procedimiento
• Riesgo de infección que puede requerir antibióticos
• Posibilidad de parestesia temporal de labio o mentón
• Comunicación con el seno maxilar (en molares superiores)
• Necesidad de reposo y dieta blanda por varios días

He recibido instrucciones post-operatorias y autorizo la realización del procedimiento.

Fecha: {{fecha}}$$,
true, 2),

(null, 'Anestesia local',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre la aplicación de ANESTESIA LOCAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo que la anestesia local puede presentar los siguientes efectos:
• Sensación de adormecimiento temporal en labios, lengua o mejilla
• Molestia transitoria en el punto de inyección
• Raramente: reacción alérgica al anestésico (muy poco frecuente)
• Hematoma en el sitio de punción

Declaro no ser alérgico/a a anestésicos locales del tipo amida (lidocaína, articaína). En caso de ser alérgico/a, lo he comunicado al profesional antes de firmar este documento.

Doy mi consentimiento para la aplicación de anestesia local.

Fecha: {{fecha}}$$,
true, 3),

(null, 'Endodoncia (tratamiento de conducto)',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de ENDODONCIA (TRATAMIENTO DE CONDUCTO) que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He comprendido que:
• El tratamiento puede requerir varias sesiones
• Es posible sentir molestias entre sesiones
• Existe riesgo de fractura de instrumentos dentro del conducto
• La pieza dental puede requerir corona protésica posterior al tratamiento
• En casos complejos, puede ser necesario derivar a un especialista
• El pronóstico depende del estado previo de la pieza dental

Doy mi consentimiento para iniciar y completar el tratamiento de endodoncia.

Fecha: {{fecha}}$$,
true, 4),

(null, 'Implante dental',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de IMPLANTE DENTAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He comprendido los siguientes aspectos del tratamiento:
• El procedimiento es quirúrgico y requiere anestesia local
• El proceso de oseointegración puede tardar 3 a 6 meses
• Existe riesgo de fracaso de la oseointegración (pérdida del implante)
• Puede presentarse inflamación, dolor e infección post-operatoria
• El tratamiento consta de varias etapas: cirugía, oseointegración y corona
• Fumar y ciertas enfermedades sistémicas reducen el pronóstico del implante
• El costo incluye únicamente la fase quirúrgica; la corona protésica es adicional

Doy mi consentimiento informado para la colocación del implante dental.

Fecha: {{fecha}}$$,
true, 5),

(null, 'Blanqueamiento dental',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de BLANQUEAMIENTO DENTAL que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo que:
• Puede producirse sensibilidad dental transitoria durante y después del tratamiento
• Los resultados varían según el tipo de coloración y la estructura dental
• Restauraciones existentes (coronas, resinas) no se blanquean con el tratamiento
• El efecto no es permanente; los hábitos alimentarios influyen en la duración
• No se recomienda en mujeres embarazadas o en período de lactancia

Doy mi consentimiento para la realización del blanqueamiento dental.

Fecha: {{fecha}}$$,
true, 6),

(null, 'Cirugía oral menor',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el procedimiento de CIRUGÍA ORAL MENOR que realizará el/la Dr./Dra. {{doctor}} en {{clinica}}.

He sido informado/a sobre los siguientes riesgos:
• Sangrado e inflamación post-operatoria
• Riesgo de infección que puede requerir antibióticos
• Posibilidad de dehiscencia (apertura) de la sutura
• Molestias durante el período de cicatrización
• Necesidad de sutura y posterior retiro de puntos

He recibido indicaciones sobre medicación y cuidados post-operatorios. Doy mi consentimiento libre y voluntario para la realización del procedimiento quirúrgico.

Fecha: {{fecha}}$$,
true, 7),

(null, 'Ortodoncia',
$$Yo, {{nombre_paciente}}, declaro que he sido informado/a sobre el TRATAMIENTO DE ORTODONCIA que supervisará el/la Dr./Dra. {{doctor}} en {{clinica}}.

Comprendo y acepto que:
• El tratamiento puede durar entre 12 y 36 meses dependiendo del caso
• Se requieren controles periódicos cada 3 a 6 semanas
• La higiene dental debe ser rigurosa durante todo el tratamiento
• Pueden presentarse molestias o dolor los primeros días tras cada ajuste
• El incumplimiento en el uso de aparatos removibles alarga el tratamiento
• Una vez finalizada la fase activa, se requiere el uso de retenedores indefinidamente
• Los resultados dependen en parte de la colaboración del paciente

Doy mi consentimiento para iniciar el tratamiento de ortodoncia.

Fecha: {{fecha}}$$,
true, 8);
