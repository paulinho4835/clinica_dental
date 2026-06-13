insert into consent_templates (clinic_id, title, body, is_system, sort_order)
select * from (values

(null::uuid, 'Extracción dental simple',
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

(null::uuid, 'Extracción de terceros molares',
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

(null::uuid, 'Anestesia local',
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

(null::uuid, 'Endodoncia (tratamiento de conducto)',
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

(null::uuid, 'Implante dental',
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

(null::uuid, 'Blanqueamiento dental',
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

(null::uuid, 'Cirugía oral menor',
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

(null::uuid, 'Ortodoncia',
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
true, 8)

) as t(clinic_id, title, body, is_system, sort_order)
where not exists (select 1 from consent_templates where is_system = true limit 1);
