# Preguntas adicionales de registro por clínica

## Contexto

El alta de paciente nuevo se hace hoy mediante un enlace público (`/h/[token]`,
`kind: "new"`) que la clínica envía por WhatsApp. El paciente completa datos
personales (`lib/schemas/patient-intake.ts`) y un historial médico fijo
(`lib/schemas/anamnesis.ts`) igual para **todas** las clínicas: antecedentes
patológicos, hábitos, alergias, embarazo, motivo de consulta, etc.

Cada clínica es distinta y quiere capturar datos propios en ese mismo
formulario (seguro médico, código de convenio, cómo llegó al paciente más allá
de las opciones fijas, etc.). Hoy eso no es posible sin tocar código.

## Decisiones

- Las preguntas clínicas existentes (antecedentes, hábitos, alergias,
  embarazo...) siguen siendo **fijas y no editables** por la clínica. No se
  permite ocultarlas ni modificarlas en esta fase: alimentan alertas y
  resúmenes en otras partes del sistema (ficha, impresión) y forman parte del
  criterio clínico mínimo de la app.
- Las preguntas adicionales solo aparecen en el alta de **paciente nuevo**
  (`kind: "new"`). No se repiten en el formulario de actualización de
  historial de un paciente existente (`kind: "existing"`): son datos de
  intake que se capturan una sola vez.
- Tres tipos de pregunta en el MVP: texto libre (una línea), sí/no, y opción
  única (radio, con opciones que la clínica define). Sin fecha, número,
  multi-selección ni texto largo por ahora — se agregan después si hace
  falta.
- La configuración vive en `clinics.settings` (jsonb), igual que
  `clinical_hours` — sin tabla nueva.
- Las respuestas del paciente **no** entran al jsonb `submitted_data` /
  `anamnesis_data` (esos se validan contra `AnamnesisSchema`, que descarta
  cualquier clave no declarada). Van en columnas nuevas y dedicadas.
- Cada respuesta guardada es un **snapshot** `{ key, label, type, value }`, no
  solo `{ key: value }`: si la clínica luego edita o borra la pregunta, la
  respuesta ya guardada en la ficha conserva su etiqueta original y sigue
  siendo legible.
- Addon opt-in (`preguntas_registro`, apagado por defecto), siguiendo el
  modelo de negocio existente (plan único + add-ons manuales). Solo `admin`
  configura las preguntas, igual que el resto de Ajustes.

## Alcance del MVP

- Sección "Preguntas adicionales de registro" en Ajustes: agregar, editar,
  reordenar, activar/desactivar y borrar preguntas. Máximo 10 preguntas
  activas por clínica.
- El formulario público de alta (`/h/[token]`, `kind: "new"`) muestra las
  preguntas activas de la clínica en una sección nueva, después de "Datos
  personales".
- Validación server-side de tipo y de las preguntas marcadas `required`.
- Sección "Preguntas adicionales" en la ficha del paciente, mostrando las
  respuestas guardadas (snapshot), visible para los mismos roles que ven el
  historial clínico.
- Panel de revisión de "Registros entrantes": al aprobar un alta, las
  respuestas custom se copian de la invitación al paciente igual que el resto
  de datos.

Fuera de alcance:

- Editar u ocultar las preguntas clínicas fijas existentes.
- Preguntas en el formulario de paciente existente (`kind: "existing"`).
- Tipos de pregunta adicionales (fecha, número, multi-selección, archivo).
- Lógica condicional entre preguntas (mostrar/ocultar según respuesta previa).
- Reportes o filtros agregados sobre las respuestas custom (ej. "cuántos
  pacientes tienen seguro X").

## Modelo de datos

### Configuración (`clinics.settings.custom_intake_questions`)

Array de objetos, sin migración nueva (mismo patrón que `clinical_hours`):

```ts
type IntakeQuestionType = "text" | "boolean" | "select";

interface IntakeQuestion {
  key: string;          // slug estable, ej. "seguro_medico" — no cambia si se edita el label
  label: string;         // texto que ve el paciente
  type: IntakeQuestionType;
  options?: string[];     // solo para type: "select", 2-8 opciones
  required: boolean;
  active: boolean;        // desactivada = no aparece en nuevos formularios, pero respuestas viejas se conservan
  position: number;       // orden de despliegue
}
```

`key` se genera una vez al crear la pregunta (slug del label + sufijo si hay
colisión) y no vuelve a cambiar aunque se edite el `label` — así una
respuesta ya guardada sigue emparejada con su pregunta si la clínica la edita
más tarde (aunque el snapshot ya lleva su propio `label`, mantener `key`
estable evita confusión al depurar).

### Respuestas propuestas (`anamnesis_invitations.submitted_custom jsonb`)

Migración `0097_intake_custom_answers.sql` agrega (verificar contra `git log`/`ls supabase/migrations` al implementar: la rama `consultorio-compartido-colegas`, aún sin mergear, también apunta a `0097` para `0091_shared_practice.sql` — la que se mergee primero se queda con `0097`, la otra renumera):

```sql
alter table anamnesis_invitations add column submitted_custom jsonb;
alter table patients add column custom_intake_answers jsonb not null default '[]'::jsonb;
```

Ambas columnas guardan el mismo formato: un array de snapshots.

```ts
interface IntakeAnswerSnapshot {
  key: string;
  label: string;          // copia del label vigente al momento de responder
  type: IntakeQuestionType;
  value: string | boolean; // string para "text"/"select", boolean para "boolean"
}
```

`submitted_custom` en `anamnesis_invitations` es nullable (invitaciones viejas
o clínicas sin el addon no la usan). `custom_intake_answers` en `patients` es
`not null default '[]'` porque todo paciente, tenga o no respuestas custom,
debe tener un array iterable en la ficha sin checks adicionales.

## Validación (server-side)

En `submit-action.ts`, al recibir el alta (`kind === "new"`):

1. Cargar `clinics.settings.custom_intake_questions`, filtrar por `active`.
2. Parsear el campo `custom` del FormData (JSON: `Record<string, string | boolean>`
   keyed por `key` de pregunta).
3. Para cada pregunta activa: si `required` y falta la clave o está vacía →
   error. Validar que el tipo del valor coincide (`boolean` para
   `type:"boolean"`, string no vacío para `text`, string presente en
   `options` para `select`).
4. Construir el array de snapshots `{ key, label, type, value }` con el
   `label` vigente de cada pregunta, y guardarlo en `submitted_custom`.
5. Ignorar cualquier clave del `custom` recibido que no corresponda a una
   pregunta activa de esa clínica (defensa en profundidad: el cliente no
   controla qué se guarda).

`applyAnamnesisInvitation` copia `submitted_custom` tal cual a
`patients.custom_intake_answers` al aprobar el alta — ya viene validado y en
formato snapshot, no requiere reprocesar.

## UI

### Ajustes → "Preguntas adicionales de registro" (admin, addon opt-in)

- Lista de preguntas con drag simple o botones subir/bajar para `position`.
- Cada fila: label, tipo (select), opciones (solo si type=select, un textarea
  o inputs separados por coma), checkbox required, toggle active, botón
  eliminar.
- Botón "Agregar pregunta". El `key` se genera automáticamente al guardar
  (slug del label); no es editable por el usuario.
- Guardado: server action que reemplaza el array completo en
  `clinics.settings.custom_intake_questions` (mismo patrón que otras
  actualizaciones de `settings`, ej. horario clínico).

### `/h/[token]` — formulario de alta (paciente)

- Nueva sección "Preguntas de {nombre de la clínica}" entre "Datos
  personales" y "¿Tiene o ha tenido alguna de estas condiciones?".
- Render dinámico según `type`: texto → `<input>`, boolean → dos botones
  Sí/No (mismo estilo que los checkboxes de antecedentes), select → radios
  con las `options` de la pregunta.
- Si la clínica no tiene el addon activo o no configuró ninguna pregunta,
  la sección no se renderiza (sin espacio vacío).

### Ficha del paciente

- Nueva sección "Preguntas adicionales" (solo si `custom_intake_answers` no
  está vacío) mostrando `label: value` de cada snapshot, en modo lectura.
  Sin edición inline en el MVP — si hay que corregir una respuesta, se
  reemplaza a mano desde la base o se anota en evolución (no forma parte de
  este alcance).

## Permisos

- Configurar preguntas (Ajustes): solo `admin` (igual que el resto de
  Ajustes/feature toggles).
- Enviar el enlace de alta: sin cambios (`admin`, `colega`,
  `isReceptionistLike`, ya definido en `createPatientIntakeInvitation`).
- Ver "Preguntas adicionales" en la ficha: mismos roles que ven el historial
  clínico (`canEditAnamnesis`).
- Responder el formulario público: sin sesión, autorizado solo por el token
  (igual que hoy).

## Criterios de aceptación

- Una clínica sin el addon activo no ve la sección en Ajustes ni en el
  formulario público; el comportamiento es idéntico al actual.
- Una clínica con 3 preguntas activas (una de cada tipo) ve las 3 en el
  formulario de alta, en el orden configurado.
- Enviar el formulario sin responder una pregunta `required` bloquea el envío
  con un mensaje claro, tanto en cliente (feedback inmediato) como en
  servidor (autoridad final).
- Aprobar el alta desde "Registros entrantes" copia las respuestas a
  `patients.custom_intake_answers` con el mismo `label` que vio el paciente.
- Editar el `label` de una pregunta en Ajustes NO cambia el texto ya mostrado
  en fichas de pacientes dados de alta antes de la edición (snapshot).
- Desactivar una pregunta la oculta de nuevos formularios sin borrar las
  respuestas ya guardadas en fichas existentes.
- Un paciente no puede inyectar respuestas para preguntas que no existen o
  están inactivas en esa clínica (se descartan server-side).

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Clínica agrega demasiadas preguntas y el formulario se vuelve largo | Tope de 10 preguntas activas, validado server-side al guardar en Ajustes. |
| Paciente manipula el FormData para mandar claves arbitrarias | Servidor solo acepta claves que coincidan con preguntas activas de esa clínica; todo lo demás se ignora. |
| Confusión entre `key` estable y `label` editable | El snapshot guardado siempre lleva su propio `label`; `key` es un detalle interno, no se muestra al usuario. |
| Pregunta `select` con opciones vacías o duplicadas | Validar en el formulario de Ajustes: mínimo 2 opciones no vacías, sin duplicados, antes de guardar. |

## Fase futura

- Tipos adicionales (fecha, número, archivo) si una clínica los pide.
- Permitir preguntas también en el historial de paciente existente, si surge
  un caso real de re-preguntar algo periódicamente.
- Edición inline de respuestas custom desde la ficha del paciente.
- Reportes/filtros agregados sobre respuestas custom.
