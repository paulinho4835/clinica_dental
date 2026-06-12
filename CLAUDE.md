# Contexto de Sesión — Clínica Dental SaaS

## Reglas absolutas
- **NUNCA hacer push sin autorización explícita del usuario.**
- Español neutro en toda la UI (sin voseo argentino: "haz" no "hacé", "puedes" no "podés", etc.)

> 📓 **Diario de depuración completo del bug "reagendar":** ver
> [`docs/VAPI-DEPURACION-REAGENDAR.md`](docs/VAPI-DEPURACION-REAGENDAR.md) —
> registro cronológico capa por capa de cada error y su solución.

## Lecciones aprendidas: integración Vapi (2026-06-11)

### Bugs reales que perdieron horas y cómo evitarlos

#### 1. El bug crítico: `parseArgs` solo aceptaba string, Vapi manda objeto
**Síntoma:** la voz dice "cita agendada" pero **nada se inserta** en la base de datos.
**Causa:** Vapi envía `arguments` ya como objeto JS en muchos flujos. Si el webhook hace
`JSON.parse(arguments)` sin verificar el tipo, falla silenciosamente y devuelve `{}` →
los campos salen `undefined` → el insert nunca llega a ejecutarse, pero el webhook
responde 200 → el LLM asume que tuvo éxito e inventa el mensaje de confirmación.
**Solución:** siempre hacer `typeof raw === "object" ? raw : JSON.parse(raw)`.

#### 2. Vapi usa varios formatos de tool call según la versión
Siempre normalizar el tool call antes de procesar:
```typescript
const raw = message.toolCallList?.[0] ?? message.toolCalls?.[0]
           ?? message.toolWithToolCallList?.[0]?.toolCall;
const toolCall = {
  id: raw.id,
  function: {
    name: raw.function?.name ?? raw.name,
    arguments: raw.function?.arguments ?? raw.arguments,
  },
};
```

#### 3. Las pruebas locales no reproducen el bug real
Si pruebas el webhook con `fetch()` desde la terminal, estás usando el formato string
(el que funciona). Vapi real usa el formato objeto (el que falla). Para detectar el bug
hay que probar **explícitamente con `arguments: argsObj` (objeto)**, no con
`arguments: JSON.stringify(argsObj)` (string).

#### 4. La base de datos local no es la de producción
`whatsapp-service/.env` apunta a `http://127.0.0.1:54321` (Supabase local).
Para consultar producción usar `vercel env pull .env.production --environment=production`,
pero Vercel redacta las variables sensibles (quedan vacías en el pull).
**La única forma de verificar contra producción** es desde el SQL Editor del dashboard
de Supabase, o configurando las credenciales reales de la nube en el `.env` del
servicio auxiliar.

#### 5. Citas sin `dentist_name` son invisibles en la agenda
La agenda filtra por el doctor logueado por defecto. Citas sin dentista asignado
no aparecen. Al crear citas vía Vapi, siempre asignar el primer doctor disponible:
```typescript
const { data: doctor } = await admin.from("profiles")
  .select("full_name").eq("clinic_id", clinicId)
  .in("role", ["odontologo_general", "especialista", "admin"])
  .order("full_name").limit(1).maybeSingle();
// insertar con dentist_name: doctor?.full_name ?? null
```

#### 6. El deploy automático de Vercel desde GitHub puede tardar 2-3 minutos
No asumir que el push refleja inmediatamente en producción. Verificar siempre con
una prueba real contra el webhook (formato objeto) y confirmar en la DB.

#### 7. `vercel --prod` sube archivos locales (commiteados o no); `git push` → auto-deploy
Si hay cambios sin commitear que urgen en producción, `vercel --prod` funciona.
Pero si el proyecto tiene auto-deploy de GitHub, el push es el camino limpio.

### Checklist de diagnóstico cuando Vapi dice "ok" pero no guarda nada
1. ¿El webhook responde la forma exacta `{ results: [{ toolCallId, result }] }`?
2. Probar el webhook con `arguments` como **objeto** (no string). ¿Dice "faltan datos"? → `parseArgs` bug.
3. Verificar en la DB de **producción** (no local) si se creó alguna fila.
4. Revisar que la herramienta tenga la **Server URL** configurada en Vapi dashboard → Tools.
5. Ver los **Logs** en Vapi dashboard para ver el payload exacto que envió.

---

## Estado actual del proyecto (2026-06-11)
- Branch: `main`
- Deploy: Vercel (automático con cada push)
- Stack: Next.js App Router, Supabase, Tailwind CSS, TypeScript

## Últimos cambios implementados

### Integración Vapi — sesión 2026-06-11 (commits en orden)

#### commit ff37dc4 — Fallback teléfono + normalización fecha/hora en `update_appointment`
- Agregado `callerNumberFromCall = message.call?.customer?.number ?? ""` para cuando el LLM no pasa `phone`
- `rawPhone` ahora usa ese fallback: `args.phone ?? args.phoneNumber ?? callerNumberFromCall`
- `normalizeDate` / `normalizeTime` aplicados antes de construir el `Date` (el LLM manda "2:00" no "14:00", "18/06/2026" no "2026-06-18", etc.)
- Guard explícito si `normDate` o `normTime` son null → mensaje de error amigable
- Guard si `isNaN(newStart.getTime())` → mensaje de error
- Captura de `updateError` con retorno de error al LLM

#### commit 9f57a3e — Fix crítico: `const appt` no se puede reasignar en ESM strict mode
**Era el bug principal que causaba el TypeError silencioso.**
- Antes: `const { data: appt }` + luego `(appt as ...) = apptByName` → `TypeError: Assignment to constant variable` en runtime, Next.js devuelve 500, Vapi muestra "Completed successfully" y el LLM inventa confirmación.
- Después: renombrar primer resultado a `apptByPatientId`, declarar `let appt` limpio, asignar correctamente.
- Si no hay cita por `patient_id`, buscar por `patient_name` ILIKE y vincular `patient_id` para futuras búsquedas.

#### commit 481db8b — Mensajes DEBUG temporales (ya revertidos en commit siguiente)
- Para diagnosticar: si paciente no encontrado → hablaba "DEBUG: no paciente...", si cita no encontrada → "DEBUG: no cita..."
- Sirvió para confirmar que el error ocurría en el flujo cancel→reschedule

#### commit 17b23d5 — Fix definitivo: reagendar tras cancelar en la misma llamada
**El bug final: el LLM cancela la cita y luego intenta reagendarla; la query de reschedule excluía `status='cancelled'` → encontraba nada → fallaba.**
- Cuando `action=reschedule` y `appt` es null, ahora hace un segundo intento buscando la cita cancelada más próxima del paciente (por `patient_id` y por nombre ILIKE).
- Se eliminan los mensajes DEBUG temporales.
- Mensajes de error amigables con `console.error` para logs de Vercel.

### Configuración manual en Vapi dashboard (hecha por el usuario)
El asistente estático "Recepcionista Dentica" tiene estas herramientas con Server URL apuntando al webhook:
- `lookup_appointment` (o `get_appointment`) — busca cita por teléfono o nombre
- `update_appointment` — confirmar / cancelar / reagendar
- `check_availability` — horarios libres por fecha y doctor
- `book_appointment` — nueva cita
- `get_current_date` — fecha actual en zona horaria Bolivia
- `get_doctors` — lista de doctores de la clínica

**IMPORTANTE**: El asistente estático de Vapi dashboard ≠ el `buildInboundAssistant()` dinámico de `lib/vapi.ts`.
El dinámico se usa cuando Vapi hace `assistant-request` (llamadas entrantes vía `phoneNumberId` sin asistente preconfigurado).
El estático es el configurado manualmente en el dashboard y tiene su propio system prompt.

### Archivo clave: `app/api/vapi/webhook/route.ts`
Maneja todos los eventos Vapi:
- `assistant-request` → devuelve `buildInboundAssistant()` con `metadata: { clinicId }`
- `tool-calls` → ejecuta `lookup_appointment`, `update_appointment`, `check_availability`, `book_appointment`, `get_doctors`, `get_current_date`, `confirm_appointment`, `cancel_appointment`, `reschedule_appointment` (outbound)
- `end-of-call-report` → marca recordatorio como enviado/fallido

### Diagnóstico pendiente (si `update_appointment` sigue fallando)
1. Revisar Vercel Function Logs (`vercel logs --follow` o dashboard) para ver `console.error`
2. En Vapi dashboard → Logs → ver el payload exacto enviado al webhook
3. Confirmar en Supabase SQL Editor (nube, no local) que la fila cambia
4. Asegurarse de que `update_appointment` en Vapi tiene Server URL configurada

### Cambios anteriores
1. **Dark mode** — `darkMode: "class"` en Tailwind, CSS variables para invertir slate/white, token `night` fijo para elementos que no invierten, anti-flash script en `<body>`, `ThemeToggle` en sidebar.
2. **Inter font** — `next/font/google`, variable `--font-sans`, referenciada en `fontFamily.sans`.
3. **Brand color ramp** — escala `clinic` en `tailwind.config.ts`, badges migrados en historial e inventario.
4. **Odontograma rediseñado** — formas anatómicas con SVG clipPath, paleta de herramientas (`Tool` union type), etiquetas de cuadrante, línea de oclusión, leyenda agrupada.
5. **Voseo corregido** — 4 archivos corregidos a español neutro.

## Tarea pendiente principal: WhatsApp multi-clínica (Baileys)

### Contexto
- Actualmente hay una sola sesión Baileys global en `whatsapp-service/src/index.ts`.
- Cada clínica necesita su propio número de WhatsApp.

### Plan de implementación
1. **`whatsapp-service/src/index.ts`** — refactorizar a `Map<clinicId, SessionState>`:
   - `SessionState = { sock, isConnected, lastQR }`
   - Auth por clínica en `auth_info/{clinicId}/`
   - Endpoints: `/qr/:clinicId`, `/connect/:clinicId`, `/disconnect/:clinicId`, `/send-reminders/:clinicId`
2. **`whatsapp-service/src/reminders.ts`** — agregar parámetro `clinicId`, filtrar recordatorios por clínica.
3. **Migración SQL** — agregar `clinic_id uuid REFERENCES clinics(id)` a tabla `appointment_reminders`.
4. **`app/api/whatsapp/send-reminders/route.ts`** — pasar `profile.clinic_id` al servicio Baileys.
5. **Página de configuración de clínica** — sección WhatsApp con estado QR + botón conectar/desconectar.

## Decisiones técnicas importantes
- **CSS variables para dark mode**: `white` y `slate` redefinidos como `rgb(var(--name) / alpha)` en Tailwind → todas las clases invierten automáticamente en `.dark` sin tocar archivos individuales.
- **Token `night`**: color fijo `#0f172a`/`#1e293b` para elementos que deben permanecer oscuros en ambos temas (botones dark, toasts, error buttons).
- **`bg-red-50` en dark**: pasteles no invierten con el truco de variables; solución explícita `dark:bg-red-500/10`.
- **Odontograma**: `isAnterior(fdi)` (dígito FDI ≤ 3) → clip circular; posterior → rounded rect.
- **`@media print`**: fuerza variables del tema claro para que documentos impresos sean siempre blancos.

## Archivos clave a recordar
- `tailwind.config.ts` — dark mode, fuente, colores clinic/night
- `app/globals.css` — variables CSS `:root` y `.dark`
- `app/layout.tsx` — Inter font + anti-flash script
- `components/ui/ThemeToggle.tsx` — toggle light/dark
- `components/Sidebar.tsx` — contiene ThemeToggle
- `lib/odontogram/types.ts` — tipos, colores, labels
- `components/odontogram/Tooth.tsx` — SVG anatómico
- `components/odontogram/OdontogramEditor.tsx` — paleta de herramientas
- `whatsapp-service/src/index.ts` — servicio Baileys (sesión única, pendiente refactor)
