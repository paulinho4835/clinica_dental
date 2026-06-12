# Diario de depuración — Vapi "reagendar" (2026-06-11)

Registro cronológico del problema "el bot dice que reagendó la cita pero la agenda
no cambia" y de cómo se fue resolviendo, capa por capa. Cada capa tapaba a la
siguiente, por eso tomó varios intentos llegar a la causa final.

**Archivos tocados:** `app/api/vapi/webhook/route.ts`, `lib/vapi.ts`
**Resultado final:** reagendar por voz funciona (confirmado por el usuario).

---

## Síntoma inicial

El usuario llama al asistente de voz "Recepcionista Dentica", pide reagendar su cita,
y el bot responde **"tu cita ha sido reprogramada para el 18 de junio a las 12"**...
pero en la agenda la cita **seguía a las 8:30**. El clásico patrón "el webhook miente
con ok": el webhook responde 200, el LLM asume éxito e inventa la confirmación de voz.

---

## Capa 1 — Fecha/hora no normalizada + falta el teléfono del llamante

**Commit:** `ff37dc4`

**Qué encontramos:** `update_appointment` construía `new Date()` con la hora cruda
que mandaba el LLM ("2:00" en vez de "14:00", "18/06/2026" en vez de "2026-06-18"),
produciendo `Invalid Date`. Además, el LLM no siempre incluía `phone` en los argumentos.

**Cómo lo resolvimos:**
- Aplicar `normalizeDate` / `normalizeTime` antes de construir el `Date`.
- Guard explícito: si la fecha/hora no es parseable → mensaje de error (no seguir).
- Fallback del teléfono: usar `message.call.customer.number` cuando el LLM no manda `phone`.
- Capturar `updateError` de Supabase y devolverlo en vez de fingir éxito.

**Por qué no bastó:** corrigió casos de fecha/hora, pero seguía fallando. Había un
bug más profundo debajo.

---

## Capa 2 — El bug crítico: reasignar `const` lanza TypeError silencioso

**Commit:** `9f57a3e`

**Qué encontramos:** el código buscaba la cita por `patient_id` y, si no la
encontraba, intentaba reasignar la variable con un truco de TypeScript:
```typescript
const { data: appt } = await admin.from("appointments")...
// ...más abajo:
(appt as typeof apptByName) = apptByName ?? null;  // ❌
```
Esto **compila** pero en runtime (ESM strict mode) lanza
`TypeError: Assignment to constant variable`. El handler se caía, Next.js devolvía
500, pero **Vapi igual mostraba "Completed successfully"** y el LLM inventaba el éxito.

**Cómo lo resolvimos:**
- Renombrar el primer resultado a `apptByPatientId`.
- Declarar `let appt = apptByPatientId ?? null;` desde el inicio.
- Asignar correctamente en el fallback (`appt = apptByName;`).

**Por qué no bastó:** arregló el crash, pero el reagendar seguía sin guardar. Faltaba
ver qué paso exacto fallaba.

---

## Capa 3 — Mensajes DEBUG temporales para localizar la falla

**Commit:** `481db8b` (revertido después)

**Qué hicimos:** como el webhook respondía 200 sin pistas, insertamos mensajes que el
bot **diría en voz alta** revelando el punto exacto de falla:
- `"DEBUG: no paciente. normalized=... clinicId=..."`
- `"DEBUG: no cita. patient=... id=... byId=..."`
- `"DEBUG: update error: ..."`

**Lo que aprendimos:** en la prueba siguiente el bot NO dijo ningún DEBUG —
señal de que el deploy aún no había propagado, o de que el flujo llegaba a un
"success path" sin tocar esos puntos. Esto nos llevó a mirar el flujo completo
cancelar→reagendar.

---

## Capa 4 — Query que excluye el estado recién puesto (cancelar → reagendar)

**Commit:** `17b23d5`

**Qué encontramos:** en la conversación, el LLM **cancelaba** la cita primero
(status='cancelled') y **luego** intentaba reagendar. Pero la query de reschedule
filtraba `.not("status", "in", "(cancelled,...)")` → no encontraba la cita que
acababa de cancelar → fallaba.

**Cómo lo resolvimos:**
- Cuando `action=reschedule` y no hay cita activa, segundo intento: buscar la cita
  **cancelada** más próxima del paciente (por `patient_id` y por nombre).
- Reagendar sobre esa cita (vuelve a `status='scheduled'`).
- Eliminar los mensajes DEBUG temporales.

**Por qué no bastó:** acercó la solución, pero en la prueba real seguía fallando con
"no pude identificar el número de teléfono". Faltaba la causa final.

---

## Capa 5 — LA CAUSA RAÍZ: identificador inconsistente entre tools

**Commit:** `daf2dc2` — el fix que finalmente funcionó.

**Cómo lo diagnosticamos:** analizando el transcript de la llamada de las 11:28 PM:
1. `lookup_appointment` con el teléfono → **no encontró** al paciente (el teléfono de
   su ficha no coincide con el número desde el que llama).
2. El usuario dio su **carnet** (4835946) → `lookup_appointment` con `identity` SÍ
   lo encontró y mostró la cita. ✅
3. Pidió reagendar → `update_appointment`... que **solo buscaba por teléfono** →
   "paciente no encontrado" → el LLM se confundió (balbuceó "el viernes dicho para
   los cumplir...") y luego **inventó** la confirmación.

**La causa raíz:** `lookup_appointment` aceptaba teléfono O carnet/nombre (`identity`),
pero `update_appointment` solo resolvía por teléfono. Identificadores inconsistentes
entre dos tools que operan sobre la misma entidad.

**Cómo lo resolvimos (3 partes):**

1. **Código (`route.ts`):** `update_appointment` ahora resuelve al paciente igual que
   lookup — 1º por teléfono, 2º por `identity` (carnet en `national_id` o nombre en
   `full_name` con ILIKE). Carnets dictados con espacios ("48 35 94 6") se limpian con
   `identity.replace(/[\s.\-]/g, "")`.

2. **Mensajes de error duros:** todos los `result` de error ahora empiezan con
   "ERROR: la cita NO fue modificada" + instrucción para el LLM (ej. "pide el carnet y
   vuelve a llamar con identity"). Esto impide que el LLM invente confirmaciones.

3. **Esquema y prompt (`lib/vapi.ts`):** se agregó el parámetro `identity` a
   `update_appointment`, `phone` dejó de ser required (solo `action`), y el system
   prompt del asistente dinámico ganó dos reglas:
   - "Si encontraste al paciente por identity, pasa ese MISMO identity en cada llamada."
   - "Solo confirma éxito si el resultado lo dice; si empieza con ERROR, NO inventes."

**Cambios manuales requeridos en el dashboard de Vapi** (el asistente estático no se
controla por código):
- Tool `update_appointment` → agregar parámetro `identity` (string); dejar solo
  `action` como required.
- System prompt → agregar las dos reglas de arriba.

**Resultado:** ✅ reagendar por voz funciona.

---

## Lecciones que quedaron en memoria global (`~/.claude/CLAUDE.md`)

1. El identificador de búsqueda debe ser **consistente** entre tools relacionadas.
2. Los mensajes de error del webhook deben empezar con "ERROR" y ser instrucciones
   para el LLM (anti "el webhook miente con ok").
3. Normalizar identificadores dictados por voz (carnet, teléfono, fechas).
4. No reasignar `const` (TypeError silencioso en ESM strict → 500 disfrazado de éxito).
5. Cuidado con queries que excluyen el estado que acabas de poner (cancelar→reagendar).

---

## Cómo verificar el webhook sin hacer una llamada real

Probar contra producción con el formato objeto exacto de Vapi (no string):
```javascript
const WEBHOOK = 'https://clinica-dental-one-vert.vercel.app/api/vapi/webhook';
await fetch(WEBHOOK, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: {
      type: 'tool-calls',
      call: { id: 'test', customer: { number: '' } },
      toolCallList: [{ id: 'tc-1', function: {
        name: 'update_appointment',
        arguments: { identity: '4835946', action: 'reschedule', new_date: '2026-06-18', new_time: '12:00' },
      } }],
    },
  }),
}).then(r => r.json()).then(console.log);
```
Nota: en Node, no nombres una variable `URL` (sombrea el constructor global → fetch falla).
