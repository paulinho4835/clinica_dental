# Agenda más interactiva — Vistas Día / Semana / Mes

**Fecha:** 2026-06-08
**Estado:** Diseño aprobado, pendiente de plan de implementación

## Objetivo

Mejorar la UI/UX de la agenda para que sea más interactiva. Tres mejoras
pedidas por el usuario:

1. **Horario visual del día** — bloques de cita proporcionales a su duración,
   en lugar de la lista de segmentos actual.
2. **Vista semanal** — ver la carga de toda la semana de un vistazo.
3. **Agendar más rápido** — clic directo en un hueco para crear una cita.

Fuera de alcance (decidido con el usuario): drag & drop para mover/redimensionar
citas.

## Contexto actual

- [app/(dashboard)/agenda/page.tsx](../../../app/(dashboard)/agenda/page.tsx):
  server component. Trae las citas del **mes** visible, la lista de pacientes y
  los odontólogos activos. Pasa todo a `AgendaCalendar`.
- [components/agenda/AgendaCalendar.tsx](../../../components/agenda/AgendaCalendar.tsx):
  ~1.080 líneas. Contiene buscador, calendario mensual, timeline vertical del
  día, modal de crear/editar (`ApptModal`) y modal de vincular paciente
  (`LinkPatientModal`). Demasiada responsabilidad en un archivo.
- [lib/agenda.ts](../../../lib/agenda.ts): lógica pura testeable. `OPEN_HOUR=8`,
  `CLOSE_HOUR=20`, `STEP_MIN=30`. `buildTimeline()` fusiona citas solapadas y
  fragmenta huecos libres. `mins()` calcula duración.
- [components/agenda/RealtimeAppointments.tsx](../../../components/agenda/RealtimeAppointments.tsx):
  refresca la vista ante cualquier cambio en `appointments`.
- Estados de cita: `scheduled`, `finished`, `no_show`, `cancelled`. Helpers
  existentes: `apptName`, `apptCI`, `isQuickConsult`. Color de marca: `clinic`.

## Decisiones tomadas

| Tema | Decisión |
|------|----------|
| Enfoque | Opción A: 3 vistas conmutables Día / Semana / Mes, conservando el mes. |
| Odontólogos | Varían por día. La vista Día soporta columnas por odontólogo; con uno solo, una columna ancha. |
| Crear cita | Clic simple en hueco vacío = modal con hora/columna precargados (30 min por defecto). Sin arrastre. |
| Controles de asistencia | Híbrido adaptativo: dentro del bloque si es alto (≥45 min); en popover (hover/tap) si es chico. |
| Vista por defecto | **Día**. |
| Estado de vista | En la URL: `/agenda?date=YYYY-MM-DD&view=day|week|month`. |
| Datos | Sin cambios en Supabase/BD. Día y Semana derivan en cliente de las citas ya cargadas. |

## Arquitectura

Separar el archivo monolítico en piezas de una sola responsabilidad, en
`components/agenda/`:

- `AgendaShell.tsx` — contenedor. Maneja el toggle Día/Semana/Mes, navegación
  (← Hoy →) y el buscador. Único que conoce el "estado de vista".
- `MonthView.tsx` — calendario mensual actual, extraído casi tal cual.
- `WeekView.tsx` — nueva grilla semanal (7 columnas lun–dom).
- `DayView.tsx` — nuevo horario visual del día (eje de horas + columnas por
  odontólogo).
- `ApptModal.tsx` — modal crear/editar, movido sin cambios de lógica.
- `LinkPatientModal.tsx` — movido sin cambios de lógica.

Se mantienen:
- `lib/agenda.ts` — más 1–2 helpers puros nuevos (posición/altura de bloque
  según hora; reparto de columnas por odontólogo; reparto lado-a-lado de citas
  solapadas).
- `page.tsx` — **único cambio**: ampliar el rango de citas que trae para cubrir
  la grilla visible completa (6 semanas / 42 celdas), no solo el mes. Así la
  vista Semana en el borde de mes (ej. 30-jun a 6-jul) no aparece vacía. No
  toca la base de datos.

## Vista Día

- **Eje vertical de horas** 8:00–20:00 a la izquierda (usa `OPEN_HOUR`/`CLOSE_HOUR`).
- **Columnas:** se derivan de los odontólogos que tienen cita ese día. 0–1
  doctor distinto → una columna ancha. 2+ → una columna por odontólogo, con su
  nombre en el encabezado.
- **Citas como bloques proporcionales:** posición por hora de inicio, altura por
  duración (1h se ve el doble que 30 min). Contenido: hora, nombre del paciente
  (o "sin registrar"), motivo si entra. Color por estado (igual que hoy):
  pendiente=clinic, atendido=verde, no vino=gris tachado.
- **Línea de "ahora":** marca sutil de la hora actual cuando el día es hoy.
- **Agendar:** clic en franja vacía → `ApptModal` con hora de inicio y columna
  (odontólogo) precargados. Duración por defecto 30 min, ajustable en el modal.
- **Editar:** clic en un bloque → `ApptModal` en modo edición.
- **Controles de asistencia (Atendido / No vino / deshacer / Vincular):**
  híbrido — en el bloque si ≥45 min, en popover si es chico.
- **Solapamientos en una misma columna** (sobre-cupo del mismo doctor): se
  reparten lado a lado para que ninguna quede tapada.

## Vista Semana

- Mismo eje de horas 8–20h, **7 columnas lun–dom**. Encabezado por día (ej.
  "Lun 9"), resaltando hoy.
- Bloques proporcionales más angostos; contenido reducido a hora + nombre.
- **Compromiso:** la columna es el día, no caben columnas por odontólogo. Si un
  día tiene varios odontólogos, sus citas conviven en la columna del día (lado a
  lado si se solapan), cada bloque con marca chica del odontólogo (inicial/color).
  El detalle por doctor se ve entrando a la vista Día.
- **Navegación:** clic en encabezado de día → vista Día de esa fecha. Clic en
  hueco vacío → `ApptModal` con esa fecha y hora.
- **Densidad:** scroll vertical si hace falta; en móvil, scroll horizontal antes
  que aplastar las 7 columnas.

## Navegación, estado y buscador

- **Toggle Día/Semana/Mes:** tres botones; la vista vive en la URL (`view=`).
  Recargar o compartir conserva la vista. Realtime/refresh siguen igual.
- **Controles ← Hoy → adaptativos:** Mes salta de mes, Semana de semana, Día de
  día. "Hoy" vuelve a la fecha actual en la vista activa.
- **Recargas:** solo cambiar de mes (o salir del rango cargado) pide al server,
  trayendo el rango de la grilla visible. Moverse dentro del rango ya cargado es
  instantáneo.
- **Buscador:** se mantiene arriba; al encontrar una cita abre la vista **Día**
  de esa fecha con la cita resaltada (resaltado/scroll existentes). Funciona
  desde cualquier vista.
- **Vista por defecto** al entrar sin parámetro: **Día**.

## Pruebas y calidad

- **Lógica pura primero:** los cálculos nuevos (posición/altura de bloque,
  reparto de columnas por odontólogo, reparto lado-a-lado de solapadas) van como
  funciones puras en `lib/agenda.ts` y se testean aisladas: 30 vs 60 min, dos
  doctores el mismo día, dos citas solapadas, citas fuera de 8–20h.
- **Componentes de vista** (Día/Semana/Mes) son presentacionales; verificación
  manual: clic en hueco abre modal con hora/doctor correctos, clic en cita
  edita, estados pintan bien, el toggle conserva la vista en la URL.
- **Sin regresiones:** modal y server actions no cambian su lógica (solo de
  archivo). Crear/editar/cancelar/vincular/asistencia/realtime siguen igual. La
  suite E2E de Playwright existente actúa de red de seguridad.

## Etapas de implementación

1. Separación de archivos (extraer modales, MonthView desde `AgendaCalendar`) +
   `AgendaShell` con toggle + vista **Día** funcional + ampliar rango de fetch.
2. Vista **Semana**.
3. Pulido: popovers de asistencia, línea de "ahora", responsive/móvil.
