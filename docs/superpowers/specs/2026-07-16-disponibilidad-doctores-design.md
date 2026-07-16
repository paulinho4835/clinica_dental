# Disponibilidad de doctores (addon `disponibilidad`) — Diseño

**Fecha:** 2026-07-16
**Estado:** Aprobado por Paulo (addon opt-in; advertir sin bloquear; semanal + fechas puntuales; el Agente de IA lo respeta; admin Y recepción editan)

## Problema

No hay dónde registrar cuándo NO atiende cada doctor ("el Dr. X no viene los
lunes de 9:00 a 13:00", "está de vacaciones del 1 al 10 de agosto"). Las
recepcionistas agendan a ciegas, el agente de IA ofrece horarios donde el doctor
no está, y el admin revisa los horarios a mano.

## Solución

Módulo nuevo "Disponibilidad" (página `/disponibilidad`, addon opt-in
`disponibilidad`) donde admin y recepción registran **bloques de no
disponibilidad** por doctor. Esos bloques:

1. Se pintan en **gris** en la agenda (vista Día por columna de doctor; vista
   Semana cuando hay un doctor filtrado) con etiqueta "No disponible" y el
   motivo si lo hay.
2. Generan una **advertencia no bloqueante** al crear o editar una cita que caiga
   dentro del bloque ("El Dr. X no está disponible en ese horario"). La
   recepcionista puede continuar igual (excepciones reales existen).
3. Los **descuenta el Agente de IA**: `check_availability` (T3) no ofrece esos
   horarios y `book_appointment`/reagendar devuelven `ERROR:` si el horario
   pedido cae en un bloque del doctor asignado.
4. Dan al admin una **vista de consulta**: grilla semanal doctores × días con
   filtros por doctor y día, imprimible (`@media print` ya fuerza tema claro).

## Modelo de datos

Bloques de NO disponibilidad (el horario general de la clínica sigue siendo
8:00–20:00; esto registra excepciones). Dos formas, mismo registro:

- **Semanal recurrente:** `weekday` (0=lunes … 6=domingo) + rango horario.
- **Por fecha:** `date_from`–`date_to` (un día: mismo valor) + rango horario.
  "Todo el día" = 08:00–20:00 (la UI lo ofrece como atajo).

Migración `0090_doctor_availability.sql` — tabla `doctor_availability`:

| Columna | Tipo | Notas |
|---|---|---|
| id | uuid pk | `gen_random_uuid()` |
| clinic_id | uuid not null → clinics | cascade |
| dentist_id | uuid not null → profiles | cascade |
| weekday | smallint null | 0–6, 0=lunes; exclusivo con date_from |
| date_from | date null | exclusivo con weekday |
| date_to | date null | requerido si date_from; ≥ date_from |
| start_time | time not null | |
| end_time | time not null | > start_time |
| reason | text null | "No viene", "Vacaciones", etc. |
| created_by | uuid null → profiles | |
| created_at | timestamptz default now() | |

Checks: `(weekday is not null) <> (date_from is not null)`;
`date_from is null or (date_to is not null and date_to >= date_from)`;
`end_time > start_time`; `weekday between 0 and 6`.

RLS: select para toda la clínica (tenant por `clinic_id`); insert/update/delete
para `admin` y `recepcionista` de la clínica. Índice por
`(clinic_id, dentist_id)`.

## Decisiones de diseño

- **Modelo negativo (excepciones), no positivo.** Registrar "cuándo NO está" y
  no el horario completo de cada doctor. Configuración mínima; se puede
  evolucionar al modelo positivo después si un cliente lo pide.
- **Advertir, no bloquear**, al agendar en un bloque. Aviso ámbar inline en el
  modal/popover de cita; el guardado procede si confirman.
- **Identidad del doctor:** `dentist_id` (uuid de `profiles`) es la referencia;
  el nombre para pintar/avisar sale del join. La agenda agrupa columnas por
  `dentist_name`, así que el match visual usa el `full_name` del join (los
  appointments guardan `dentist_name = profile.full_name` de forma consistente).
- **Semana en la agenda:** los bloques grises solo se pintan en vista Semana
  cuando hay UN doctor filtrado en el dropdown (sin filtro sería ambiguo de
  quién es el gris). En vista Día siempre, en la columna de cada doctor.
- **Agente de IA:** solo resta bloques cuando puede atribuirlos sin ambigüedad —
  si el paciente pidió doctor, los de ese doctor; si no, los del doctor que
  `book_appointment` auto-asignaría. Solo activo si la clínica tiene el addon
  `disponibilidad` encendido (flag pasado a `buildTools`).
- **Zona horaria:** las horas de los bloques son hora de la clínica (Bolivia,
  UTC-4), igual que `buildSlots` del agente y `boliviaMinutesOfDay` de la
  agenda. Los `Date` se construyen con offset explícito `-04:00`.
- **Permisos:** admin y recepcionista crean/editan/borran (decisión de Paulo:
  el doctor avisa por teléfono y la recepción lo registra). Doctores y
  asistentes no ven la página; los doctores sí ven sus bloques grises en su
  agenda.
- **Sin estado "activo":** los bloques se borran, no se archivan. Los bloques
  por fecha pasados quedan como histórico consultable (y se pueden borrar a
  mano); no hay limpieza automática en v1.

## Componentes

| Unidad | Responsabilidad |
|---|---|
| `supabase/migrations/0090_doctor_availability.sql` | Tabla + checks + RLS + índice. |
| `lib/features.ts` | Clave `disponibilidad` (optIn) + entrada en `FEATURES` (`/disponibilidad`). |
| `lib/rbac.ts` | `disponibilidad` en `NAV_WHITELIST` de `admin` y `recepcionista`. |
| `lib/availability.ts` (nuevo) | Lógica pura testeable: `boliviaWeekdayOf(dayISO)`, `blocksForDay(dayISO, blocks)`, `blockRange(dayISO, block)`, `findAvailabilityConflict(start, end, dentistName, dayISO, blocks)`. |
| `app/(dashboard)/disponibilidad/page.tsx` (nuevo) | Server page: `requireNavAccess`, fetch doctores + bloques, render panel. |
| `app/(dashboard)/disponibilidad/actions.ts` (nuevo) | Server actions `createAvailabilityBlock` / `deleteAvailabilityBlock` (valida rol, clínica, campos). |
| `components/disponibilidad/AvailabilityPanel.tsx` (nuevo) | Client: formulario de alta (doctor, semanal/fecha, horario o "todo el día", motivo), grilla semanal doctores × días, lista con borrar, filtros por doctor/día, botón imprimir. |
| `app/(dashboard)/agenda/page.tsx` | Fetch de bloques del rango visible cuando el addon está ON; prop nueva a `AgendaShell`. |
| `components/agenda/AgendaShell.tsx` → `DayView`/`WeekView` | Pintar bloques grises (geometría con `blockGeometry` existente). |
| `components/agenda/ApptModal.tsx` + `QuickCreatePopover.tsx` | Advertencia ámbar si doctor+horario elegidos caen en un bloque. |
| `lib/agent/tools.ts` + `lib/agent/runAgent.ts` | Flag `availabilityEnabled`; `check_availability` resta bloques; `book_appointment`/reagendar devuelven `ERROR:` si el horario cae en bloque del doctor asignado. |

## Flujo de datos

Recepción registra "Dr. X, lunes 9:00–13:00" en `/disponibilidad` → fila en
`doctor_availability` → la agenda (server) trae los bloques del rango visible y
los pasa a las vistas → gris en la columna del Dr. X cada lunes → al abrir el
modal de cita en ese hueco aparece el aviso ámbar → el agente de IA, al
consultar disponibilidad del Dr. X un lunes, ya no ofrece 9:00–13:00.

## Manejo de errores

- Action sin rol permitido / addon apagado / doctor de otra clínica → `{ error }`
  + toast; RLS lo bloquea además en DB.
- Solapamiento de bloques del mismo doctor: permitido (no es error; el pintado
  los fusiona visualmente al superponerse).
- Bloques con `dentist_id` de un perfil desactivado: se siguen mostrando en la
  página del módulo (histórico) pero no afectan la agenda si el doctor no tiene
  columna.
- jsonb/filas corruptas no aplican (tabla tipada); fechas inválidas las rechaza
  el check de DB y la validación de la action.

## Testing

Vitest en `tests/disponibilidad.test.ts` sobre `lib/availability.ts`:
cálculo de weekday (0=lunes) para fechas conocidas, matching semanal vs rango de
fechas, expansión a rango horario del día, y detección de conflicto por
solapamiento de intervalos (incluye cita que empieza antes y termina dentro del
bloque). Integración (agenda, modal, agente) verificada manualmente en local.

## Fuera de alcance (v1)

- Horario positivo completo por doctor ("atiende lunes 8–12 y 15–19").
- Edición in-place de bloques (v1: borrar y volver a crear).
- Notificar al doctor cuando le registran una ausencia.
- Limpieza automática de bloques por fecha ya pasados.
- Vista Mes de la agenda (solo Día y Semana pintan gris).
