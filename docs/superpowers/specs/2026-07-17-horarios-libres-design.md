# Horarios libres para copiar y pegar (addon `disponibilidad`) — Diseño

## Contexto

La Dra. Claudia Pacheco (admin de una clínica) le pidió al equipo un módulo
que calcule automáticamente los horarios libres de cada doctor y genere un
texto listo para copiar y pegar en WhatsApp cuando responde consultas de
pacientes. Hoy lo arma a mano mirando la agenda, y a veces termina agendando
doble porque el texto que copia queda desactualizado.

El agente de IA (WhatsApp, addon `agente_ia_t3`) ya resuelve exactamente este
cálculo en su tool `check_availability` (`lib/agent/tools.ts`): huecos de la
grilla de horario (`buildSlots` de `lib/vapi-helpers.ts`) menos citas ya
reservadas menos bloques del addon "Disponibilidad Doctores". Este feature
expone ese mismo cálculo a un humano (admin/recepción) vía un botón en la
Agenda, en vez de duplicar la lógica.

## Alcance

Un botón **"Horarios libres"** en la barra de la Agenda (junto a "Imprimir
día"), visible solo para admin/recepción y solo con el addon `disponibilidad`
encendido (reusa los bloques de ese addon; sin el addon, el cálculo sigue
funcionando pero sin restar bloques de no-disponibilidad — no tiene sentido
ofrecer el botón sin la data completa).

Al hacer clic abre un modal:
1. Selector de **doctor** (solo odontólogo/especialista/colega/admin, mismo
   universo que ya usa el resto de la Agenda).
2. Selector de **rango**: próximos 3, 5 o 7 días (por defecto 5), calendario
   simple (no configurable por fecha puntual en esta primera versión — YAGNI).
3. **Vista previa** del texto generado (recalculado al cambiar doctor/rango).
4. Botón **"Copiar"** → `navigator.clipboard.writeText`, con confirmación
   visual breve ("Copiado ✓").

## Formato del texto

Replica el estilo que la Dra. ya usa (visto en su ejemplo con el bot):

```
Estos son los horarios disponibles para programar su cita:

✨ *Lunes 13:* 09:00 | 09:30 | 11:00 | 11:30 | 12:00 | 15:00
✨ *Martes 14:* 09:00 | 09:30 | 15:00 | 15:30
```

- Un emoji `✨` + día de la semana en negrita (`*Lunes 13:*`, formato WhatsApp)
  + horas separadas por ` | `.
- Días sin ningún horario libre se omiten del texto (no se lista "sin
  horarios"; si TODOS los días del rango están sin horarios, el texto es una
  sola línea: "No hay horarios disponibles en los próximos N días.").
- Domingo usa la misma grilla reducida que ya usa el agente
  (`buildSlots`: 9:00–11:00 en vez de 9:00–19:00) — mismo criterio, una sola
  fuente de verdad.

## Cálculo (reutiliza lógica existente, no la duplica)

Nueva función pura en `lib/freeSlots.ts`:

```typescript
export function freeSlotsForDay(
  dateISO: string,
  bookedIntervals: { start: number; end: number }[], // epoch ms
  availabilityBlocks: AvailabilityBlock[],
  dentistName: string,
): string[] // ["09:00", "09:30", ...]
```

Mismo algoritmo que `check_availability` en `lib/agent/tools.ts`: parte de
`buildSlots(dateISO)`, arma intervalos ocupados (citas de 60 min desde
`bookedIntervals` + bloques de `blocksForDay`/`blockRange` de
`lib/availability.ts` para ese doctor ese día), y filtra los slots que no
solapan ningún intervalo.

Y una función pura de formato:

```typescript
export function formatFreeSlotsMessage(
  days: { dateISO: string; label: string; slots: string[] }[],
): string
```

`label` ya viene armado por el caller (`"Lunes 13"`, capitalizado, en
español) para que la función de formato no dependa de `Intl`/zona horaria —
mantiene esta función 100% pura y testeable con inputs literales.

## Datos: server action, no cliente directo a Supabase

Nueva server action en `app/(dashboard)/agenda/actions.ts`:

```typescript
export async function getFreeSlotsText(
  dentistId: string,
  days: 3 | 5 | 7,
): Promise<{ text: string } | { error: string }>
```

- Valida rol (admin/recepcionista) y `features.disponibilidad`, mismo patrón
  que `createAvailabilityBlock` en `app/(dashboard)/disponibilidad/actions.ts`.
- Resuelve el nombre del doctor a partir de `dentistId` (tabla `profiles`,
  scoped a `clinic_id`).
- Trae citas del doctor en el rango (`appointments`, `status not in
  (cancelled, no_show)`) y bloques de `doctor_availability` del rango (mismo
  filtro `.or(weekday.not.is.null, and(date_from.lte.end, date_to.gte.start))`
  ya usado en `app/(dashboard)/agenda/page.tsx`).
- Arma los `days` (fechas + label en español, `Intl.DateTimeFormat` con
  `timeZone: BOLIVIA_TZ`) y llama a `freeSlotsForDay` + `formatFreeSlotsMessage`.
- Devuelve el texto ya armado — el cliente no ve filas crudas, solo el string
  a copiar (menos superficie, coherente con que el modal es "generar texto",
  no "explorar datos").

## Componentes nuevos

- `components/agenda/FreeSlotsModal.tsx` (client): selector doctor + rango,
  llama a `getFreeSlotsText` en un `useEffect`/acción al cambiar cualquiera de
  los dos, muestra la vista previa en un `<pre>` o `<textarea readOnly>`,
  botón Copiar con estado "Copiado ✓" transitorio (mismo patrón que otros
  botones de copiar del proyecto, si existen — si no, `setTimeout` de 2s).
- `AgendaShell.tsx`: nuevo botón "Horarios libres" junto a "Imprimir día",
  gated por `isAdmin && disponibilidadEnabled` (nueva prop, mismo patrón que
  `recordatoriosEnabled`/`avisoDoctoresEnabled`); abre el modal.
- `app/(dashboard)/agenda/page.tsx`: pasa `disponibilidadEnabled={features.disponibilidad}` a `AgendaShell`.

## Testing

`tests/freeSlots.test.ts` (Vitest, lógica pura, sin DOM/DB):
- `freeSlotsForDay`: slot ocupado por cita se excluye; slot cubierto por
  bloque de disponibilidad se excluye; slot libre aparece; domingo usa la
  grilla reducida; cita que empieza exactamente al cierre de un slot no lo
  bloquea (mismo borde que `findAvailabilityConflict`).
- `formatFreeSlotsMessage`: un día con slots, varios días, día sin slots se
  omite, todos los días sin slots → mensaje único de "no hay horarios".

## Fuera de alcance (YAGNI, se puede pedir después)

- Enviar el texto directo por WhatsApp (Baileys) — el pedido explícito de la
  Dra. es copiar/pegar manual, no automatizar el envío.
- Elegir fechas puntuales sueltas (solo rango de N días desde hoy).
- Configurar el formato del texto (emoji, separador) desde la UI.
