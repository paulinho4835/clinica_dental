# Dictado por voz para el odontograma

## Contexto

El odontograma actual representa cada diente con numeración FDI y guarda un
estado estructurado: condiciones por cara (`O`, `M`, `D`, `V`, `L`) y
condiciones de diente completo. El editor permite aplicar estos cambios con la
paleta y los persiste mediante `saveOdontogram`, que ya aplica permisos,
bloqueo horario y registra cada modificación en `odontogram_events`.

El objetivo es que un odontólogo pueda dictar varias observaciones clínicas y
que el sistema las convierta en cambios revisables del odontograma. La voz
acelera la carga; no sustituye el juicio clínico ni debe modificar por sí sola
un expediente.

Ejemplo:

> "Caries oclusal y distal en el cuarenta y seis; corona en el once; extracción indicada en el treinta y ocho."

Se propone como:

- `46`: caries en `O` y `D`.
- `11`: corona en diente completo.
- `38`: extracción indicada en diente completo.

## Decisiones

- Flujo de seguridad obligatorio: **dictar -> revisar -> aplicar al editor -> guardar**.
  Nunca habrá guardado automático desde el audio.
- El audio se transmite al proveedor de transcripción y se descarta al terminar
  la solicitud. No se almacena en Supabase ni en R2.
- Se usa un modelo de transcripción en español y un LLM separado para convertir
  el texto a operaciones JSON. No se entrenará un modelo propio en el MVP.
- El LLM solo puede proponer operaciones dentro de un esquema Zod estricto; la
  validación determinista del servidor es la autoridad final.
- Se reutilizan los tipos, permisos y guardado ya existentes. Los cambios
  confirmados siguen creando eventos en `odontogram_events`.
- El MVP cubre odontograma permanente. El pediátrico se agrega cuando las
  pruebas de vocabulario y FDI adulto estén estables.

## Alcance del MVP

- Botón de micrófono en `OdontogramEditor` para iniciar/detener un dictado
  corto (máximo 60 segundos).
- Transcripción de español boliviano/latinoamericano.
- Varias operaciones en una frase.
- Condiciones existentes del odontograma adulto y operaciones de borrar.
- Panel de revisión con transcript, cambios propuestos, advertencias y acciones
  por cambio: aplicar, descartar o corregir manualmente desde la paleta.
- Registro técnico mínimo, sin audio ni transcript completo, para medir uso,
  errores y tasa de confirmación.

Fuera de alcance:

- Escucha continua, conversación con el sistema o ejecución por una frase de
  confirmación de voz.
- Diagnóstico clínico automatizado, recomendaciones terapéuticas o inferencias
  a partir del audio.
- Dictado del periodontograma, evolución clínica o plan de tratamiento.
- Almacenamiento/reproducción de audio.

## Arquitectura

```text
Navegador (MediaRecorder)
  -> POST /api/odontogram/voice/interpret
  -> transcriptor español (audio a texto)
  -> LLM con salida estructurada (texto a operaciones)
  -> validación de dominio y estado actual
  -> respuesta: transcript + propuestas + advertencias
  -> modal de revisión en el editor
  -> estado local TeethMap
  -> saveOdontogram existente + odontogram_events
```

El endpoint será autenticado y verificará el mismo permiso clínico que el
guardado. El cliente nunca recibe una API key de IA. `MediaRecorder` enviará un
único `Blob` `webm/opus` con `multipart/form-data`; se rechazará cualquier
archivo que exceda 60 segundos o 5 MB.

### Proveedores

- **Transcripción:** Deepgram en español mediante llamada servidor-a-servidor.
  La aplicación ya usa Deepgram con idioma `es` para Vapi, por lo que comparte
  vocabulario operativo y evita depender del reconocimiento variable del
  navegador. Se implementará detrás de `transcribeOdontogramAudio()` para poder
  reemplazarlo sin tocar la UI.
- **Interpretación:** proveedor configurado para IA mediante AI SDK y
  `generateObject` con esquema Zod. Se definirá una variable dedicada
  `ODONTOGRAM_VOICE_MODEL`; no se reutilizará el prompt del agente de
  recepción. Como fallback, se puede elegir el mismo proveedor de `AGENT_PROVIDER`,
  pero con modelo y límites independientes.
- **No usar Vapi:** Vapi resuelve llamadas telefónicas. El dictado es una
  interacción autenticada dentro de la ficha clínica y requiere control de
  payload, permisos y confirmación propios.

## Modelo de operaciones

Crear `lib/odontogram/voice.ts` como dominio puro, compartido por API y UI.

```ts
type VoiceOperation =
  | {
      action: "set_surface";
      tooth: string;       // FDI, por ejemplo "46"
      surface: "O" | "M" | "D" | "V" | "L";
      condition: string;   // solo SURFACE_CONDITIONS
    }
  | {
      action: "set_whole";
      tooth: string;
      condition: string;   // solo WHOLE_CONDITIONS o x_rojo/x_azul
    }
  | {
      action: "clear_surface";
      tooth: string;
      surface: "O" | "M" | "D" | "V" | "L";
    }
  | {
      action: "clear_whole";
      tooth: string;
    };
```

Funciones requeridas:

- `voiceOperationsSchema`: límite de 20 operaciones, sin campos extra.
- `validateVoiceOperations(operations, dentition)`: valida FDI, cara,
  condición y compatibilidad con dentición adulta/pediátrica.
- `applyVoiceOperations(teeth, operations)`: devuelve un `TeethMap` nuevo sin
  mutar el original.
- `describeVoiceOperation(operation)`: etiqueta legible para el modal.
- `normalizeDentalTerms(text)`: solo normalizaciones deterministas previas al
  LLM (por ejemplo, `bucal -> vestibular`, `oclusal -> O`). No debe intentar
  diagnosticar ni adivinar dientes.

El LLM devolverá además `uncertainties`, nunca inventará una operación cuando
el diente, la cara o la condición no sean claros. Ejemplo: si oye "en el
treinta y..." debe pedir aclaración, no elegir `31` ni `38`.

## Endpoint y seguridad

Crear `app/api/odontogram/voice/interpret/route.ts`:

1. Obtener perfil y verificar rol permitido (`admin`, `odontologo_general`,
   `especialista`, `colega`) y bloqueo de horario, reutilizando la misma regla
   del guardado.
2. Aplicar rate limit por `clinicId:userId`: 10 dictados por 10 minutos.
3. Validar `Content-Type`, tamaño, duración declarada y tipo de audio permitido.
4. Transcribir; si no hay texto útil, responder `422` sin invocar al LLM.
5. Pedir al LLM exclusivamente el esquema `VoiceInterpretation`.
6. Ejecutar `validateVoiceOperations` en servidor y convertir operaciones
   inválidas a advertencias. Nunca devolver ni aplicar una operación inválida.
7. Devolver `200` con `{ transcript, operations, uncertainties, warnings }`.

Errores de proveedor se registran sin audio ni texto clínico completo; para la
UI se muestran mensajes genéricos y reintentables. El endpoint debe enviar
`Cache-Control: no-store`.

Variables de entorno:

```env
DEEPGRAM_API_KEY=
ODONTOGRAM_VOICE_PROVIDER=groq|google|openrouter|deepseek
ODONTOGRAM_VOICE_MODEL=
```

Las claves nunca se exponen con prefijo `NEXT_PUBLIC_`.

## UI y flujo clínico

Crear `components/odontogram/VoiceDictationButton.tsx` y
`components/odontogram/VoiceReviewDialog.tsx`.

1. El doctor pulsa **Dictar cambios**. El navegador solicita permiso de
   micrófono únicamente en ese momento.
2. Mientras graba, se muestra cronómetro, botón **Detener** y nota de que el
   audio no se guarda.
3. Al detener, el botón queda en estado **Interpretando** y no permite un
   segundo envío concurrente.
4. El diálogo muestra el texto transcrito y una lista visual de los cambios.
   Cada fila indica diente, cara/diente completo, condición y un control para
   descartarla.
5. Las incertidumbres se muestran separadas y bloquean la aplicación hasta que
   el usuario las descarte o corrija mediante la paleta.
6. **Aplicar al odontograma** actualiza solo el `teeth` local y activa el botón
   existente **Guardar cambios**. **Cancelar** no altera el odontograma.
7. El guardado sigue solicitando a `saveOdontogram` el baseline y estado final;
   por eso el historial conserva el actor y el diff real.

Accesibilidad: controles con etiquetas, estado de grabación anunciado por
`aria-live`, navegación completa por teclado y alternativa de entrada manual
si el micrófono está denegado o no disponible.

## Auditoría y observabilidad

El historial clínico existente es suficiente para saber qué cambios se
confirmaron. Para medir la función sin guardar información clínica sensible,
crear migración `0095_odontogram_voice_usage.sql` con una tabla de telemetría
de retención corta:

```sql
create table odontogram_voice_usage (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  actor_id uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  transcript_char_count integer not null,
  proposed_count smallint not null,
  applied_count smallint not null,
  uncertainty_count smallint not null,
  outcome text not null check (outcome in ('applied', 'cancelled', 'error')),
  latency_ms integer
);
```

RLS: inserción únicamente desde servidor autenticado; lectura para admin de la
misma clínica y superadmin según los patrones actuales. No guardar audio,
transcript, prompt ni respuesta cruda del modelo. Agregar una tarea de limpieza
para retener estas métricas 90 días.

## Vocabulario inicial

El prompt incluirá una tabla cerrada de equivalencias y todos los códigos
permitidos. Debe reconocer al menos:

- Dientes: `46`, `cuarenta y seis`, `cuatro seis`, `diente cuarenta y seis`.
- Caras: oclusal, mesial, distal, vestibular, bucal, lingual, palatino.
- Condiciones de cara: caries, caries recidivante, resina, amalgama, sellante,
  fractura y desgaste.
- Condiciones completas: corona, endodoncia, perno muñón, implante, prótesis,
  extracción indicada, ausente, movilidad y en erupción/incluido.
- Acciones: aplicar/marcar, borrar/quitar/eliminar, requerido y existente.

El texto de sistema debe prohibir expresamente: diagnosticar, completar datos
no dictados, traducir una duda a una operación, modificar dientes fuera del
conjunto FDI recibido y usar condiciones no enumeradas.

## Plan de implementación

### Fase 1: dominio y pruebas de seguridad

- Crear `lib/odontogram/voice.ts` con esquema, normalización, validación,
  aplicación inmutable y descripciones.
- Agregar `tests/odontogram/voice.test.ts` con una matriz de operaciones
  válidas/inválidas, FDI adulto, conflicto de órdenes y no mutación del estado.
- Definir un corpus versionado de al menos 100 dictados reales anonimizados en
  `tests/fixtures/odontogram-voice-es.json` con salida esperada o incertidumbre.

### Fase 2: servicios de IA y API

- Implementar `lib/odontogram/voice-transcription.ts` y
  `lib/odontogram/voice-interpretation.ts` aislando proveedores.
- Implementar la ruta autenticada, límites de tamaño/duración/rate limit y
  respuestas de error estables.
- Crear mocks de transcriptor y LLM para tests de ruta; ningún test llama a un
  proveedor externo.
- Agregar las variables de entorno a `.env.example`, sin valores reales.

### Fase 3: interfaz clínica

- Implementar el botón de grabación, manejo de permisos y conversión de Blob.
- Implementar diálogo de revisión, eliminación de propuestas y aplicación al
  estado local del editor.
- Mantener el editor completamente utilizable por clic cuando voz falle o esté
  desactivada.
- Agregar pruebas de componentes para estados: permiso denegado, grabando,
  procesando, respuesta con incertidumbre, aplicar y cancelar.

### Fase 4: telemetría, piloto y salida gradual

- Crear la migración de telemetría y la limpieza de 90 días.
- Proteger la función con feature flag `odontogram_dictado_voz`, apagado por
  defecto y activable por clínica.
- Ejecutar piloto con 2--3 odontólogos y el corpus de frases locales; corregir
  vocabulario y prompt antes de habilitar más clínicas.
- Revisar semanalmente: uso, porcentaje aplicado, incertidumbres, latencia y
  errores. No evaluar precisión solo por el texto transcrito: comparar las
  operaciones propuestas con las finalmente confirmadas.

## Criterios de aceptación

- Un usuario sin `clinical:write`, fuera de horario o de otra clínica no puede
  interpretar ni guardar cambios por voz.
- El audio nunca se persiste y las claves de proveedores no llegan al cliente.
- Para los 100 dictados del corpus, el sistema no produce operaciones inválidas;
  en frases ambiguas devuelve incertidumbre y cero operaciones especulativas.
- Una propuesta aceptada se refleja correctamente en el SVG antes del guardado.
- Cancelar o cerrar el diálogo deja el `TeethMap` exactamente igual.
- Guardar cambios desde voz crea los mismos eventos inmutables por diente/cara
  que guardar cambios realizados manualmente.
- El dictado falla de forma recuperable ante micrófono denegado, red caída,
  archivo inválido, rate limit o fallo de proveedor.
- El flujo es navegable con teclado y la interfaz informa los estados de
  grabación/procesamiento a lectores de pantalla.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Transcripción incorrecta de un FDI | Mostrar transcript y propuesta; no aplicar ni guardar automáticamente. |
| El LLM inventa una condición | Esquema Zod cerrado y validación determinista en servidor. |
| Ruido clínico o conversaciones cercanas | Dictado breve, micrófono cercano, límite de duración y confirmación humana. |
| Exposición de datos clínicos | Audio efímero, proveedor bajo acuerdo de procesamiento de datos, sin transcript en logs. |
| Costos o abuso | Límites de audio, rate limit, feature flag y métricas de uso por clínica. |
| Dependencia de un proveedor | Interfaces de transcripción e interpretación desacopladas y mocks de prueba. |

## Fase futura

- Añadir dentición pediátrica pasando el conjunto FDI temporal al validador.
- Permitir corrección por voz de una operación ya propuesta, siempre con nueva
  vista previa.
- Extender el patrón al periodontograma solo después de validar un vocabulario
  específico para sitios y medidas numéricas.
- Evaluar un modelo o fine-tuning especializado únicamente si el piloto muestra
  errores persistentes que no se resuelvan con corpus, normalización y prompt.
