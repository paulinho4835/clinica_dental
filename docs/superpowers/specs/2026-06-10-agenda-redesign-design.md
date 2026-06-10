# Agenda Redesign — Google Calendar Style v2

**Fecha:** 2026-06-10  
**Estado:** Diseño aprobado — pendiente plan de implementación  
**Reemplaza:** `2026-06-08-agenda-ux-interactiva-design.md` (drag & drop era out-of-scope allí, ahora es central)

---

## Objetivo

Rediseñar la agenda para que el Dr. diga "wow" al abrirla. Dos ejes de mejora aprobados por el usuario:

1. **Estética / pulido visual** — color por doctor (Google Calendar style), jerarquía tipográfica, sombras, micro-animaciones.
2. **Rapidez de uso** — drag para mover citas, clic-arrastre para crear, sin abrir modal para operaciones simples.

---

## Sección 1 · Sistema de color

### Color por doctor (no por estado)

El color primario de cada bloque identifica al **doctor**, no al estado de la cita. Igual que Google Calendar: el ojo reconoce de quién es la cita antes de leer el nombre.

**Paleta — 8 colores fijos, hash determinístico:**

| Índice | Color | Hex |
|--------|-------|-----|
| 0 | Teal (color clínica) | `#0ea5a4` |
| 1 | Indigo | `#6366f1` |
| 2 | Pink | `#ec4899` |
| 3 | Amber | `#f59e0b` |
| 4 | Emerald | `#10b981` |
| 5 | Violet | `#8b5cf6` |
| 6 | Red | `#ef4444` |
| 7 | Sky | `#0284c7` |

`getDoctorColor(doctorId: string)` hace un hash del id → `index % 8` → devuelve `{ bg, border, text }` con los colores Tailwind correspondientes. Función pura, determinística, sin estado.

Sin doctor asignado: color slate (`#94a3b8`).

### Estado como canal separado

El estado de la cita se comunica con forma/opacidad/borde, **no** con color de fondo:

| Estado | Tratamiento visual |
|--------|--------------------|
| `scheduled` (pendiente) | Bloque normal, color pleno, borde sólido 4px |
| `finished` (atendido) | Igual que pendiente + ✓ en esquina superior derecha |
| `no_show` | Opacidad 70%, borde 4px punteado slate, texto tachado |
| `in_chair` (en sillón) | Anillo brillante animado (`pulse-ring`), puntito en nombre |

### Leyenda

El dropdown de doctores en la barra de controles muestra el puntito de color junto a cada nombre. No se necesita tabla de leyenda separada.

---

## Sección 2 · Drag-and-drop

### Interacciones v1

- **Arrastrar para mover** — drag de un bloque existente a otro slot. Disponible en Vista Día y Vista Semana (solo dentro del mismo día en v1).
- **Clic-arrastre para crear** — drag desde un slot vacío en Vista Día abre el modal de nueva cita con fecha/hora pre-llenada.

### Implementación técnica

**Enfoque:** pointer events nativos (`onPointerDown/Move/Up`). Sin librerías externas. Reutiliza la matemática existente de `blockGeometry` y `STEP_MIN = 15`.

**Hook `useDrag()`** en `lib/agenda/dragDrop.ts`:

```ts
interface UseDragReturn {
  draggingId: string | null;
  ghostSlot: { date: string; time: string } | null;
  dragHandlers: (apptId: string) => {
    onPointerDown: React.PointerEventHandler;
    onPointerMove: React.PointerEventHandler;
    onPointerUp: React.PointerEventHandler;
  };
  isDragging: (apptId: string) => boolean;
}
```

**Flujo optimista:**

1. `onPointerDown` — captura `blockId` + `offsetY` dentro del bloque
2. `onPointerMove` — calcula `ghostSlot` (snap a 15min), muestra ghost semitransparente en slot destino
3. `onPointerUp` — aplica mutación optimista en estado local, dispara `PATCH /api/appointments/[id]` con `{ start, end }` nuevos
4. Error de servidor → revert del estado local + `shake` animation + toast de error

**Restricciones v1 (deliberadas):**

- No drag cross-day en Vista Semana (solo mismo día). Cross-day queda para v2.
- Clic-arrastre para crear solo en Vista Día (en Semana las columnas son demasiado estrechas).
- Snap fijo a 15 minutos.
- Keyboard navigation y screen reader completo: v2.

---

## Sección 3 · Vistas y layout

### Vista Semana (vista héroe)

- El Dr. llega aquí por defecto. El rol determina si ve todos los doctores o solo los suyos.
- 7 columnas (L–D) con header sticky. Día actual destacado en teal sólido.
- Línea roja "ahora" en el día activo, actualizada cada 60s (ya existe, se mantiene).
- Bloque muestra: nombre del paciente + inicial del doctor (puntito de color).
- Drag para mover dentro del mismo día.
- Clic simple en slot vacío → modal de nueva cita.

### Vista Día

- Bloques más altos, columnas más anchas por doctor.
- Bloques con altura > 48px muestran: nombre + motivo + CI del paciente.
- Clic-arrastre en slot vacío → modal de nueva cita con hora pre-llenada.
- Drag para mover dentro del día.

### Vista Mes

- Reemplaza el badge contador (`3 citas`) por pastillas de nombre.
- Hasta 2 pastillas con nombre truncado + puntito de color del doctor.
- Si hay más: `+N más` en texto pequeño.
- Clic en día → navega a Vista Día de ese día.

### Barra de controles

- **Segmented control** D/S/M con efecto pastilla animada (CSS transition en el indicador).
- Dropdown de doctor con puntito de color junto a cada nombre.
- Chevrones ‹ › para navegar período, botón `Hoy` en teal.
- Botón WA empujado al extremo derecho.
- Todo en una sola línea sin desbordarse en pantallas ≥ 768px.

---

## Sección 4 · Sistema visual (pulido)

### Tipografía — 3 niveles por bloque

| Nivel | Contenido | Estilo |
|-------|-----------|--------|
| 1 | Nombre del paciente | 600 weight, 12–13px |
| 2 | Doctor · Motivo | 400, 10–11px, color 70% |
| 3 | Hora · Duración · Consultorio | 400, 9–10px, slate |

### Sistema de sombras — 4 niveles

| Nivel | Cuándo | CSS |
|-------|--------|-----|
| `xs` | Bloque en reposo | `0 1px 2px rgba(0,0,0,.06)` |
| `sm` | Hover | `0 2px 6px rgba(0,0,0,.08)` |
| `md` | Focus / click | `0 4px 12px rgba(0,0,0,.10)` |
| `drag` | Arrastando | `0 8px 24px rgba(0,0,0,.15)` + `scale(1.04)` |

### Micro-animaciones (CSS nativo, sin dependencias)

- `slideIn` (0.25s ease) — nueva cita aparece con slide+fade desde abajo.
- `pulse-ring` (1.5s loop) — estado "en sillón" pulsa el anillo de color del doctor.
- `ghost-pulse` (1.2s loop) — slot destino durante drag parpadea semitransparente.
- `shake` (0.3s) — revert de drag fallido sacude el bloque.

### Hover states

- Bloque: `background` un tono más oscuro, sombra `sm`, `translateY(-1px)`, ícono ✏️ visible.
- Transición: `all 0.15s ease`.
- Segmented control: la "pastilla" activa se desliza con `transition: transform 0.15s`.

---

## Sección 5 · Arquitectura

### Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `lib/agenda/doctorColor.ts` | **NUEVO** | Hash id → color. Pura y sin estado. |
| `lib/agenda/dragDrop.ts` | **NUEVO** | Hook `useDrag()`. Sin JSX. |
| `components/agenda/WeekView.tsx` | **MODIFICAR** | Color por doctor + drag (mismo día). |
| `components/agenda/DayView.tsx` | **MODIFICAR** | Color por doctor + drag + clic-arrastre crear. |
| `components/agenda/MonthView.tsx` | **MODIFICAR** | Pastillas de nombre en lugar de badge contador. |
| `components/agenda/apptHelpers.ts` | **MODIFICAR** | `apptBlockClass(status)` para el canal de estado. |
| `lib/agenda/index.ts` | **SIN CAMBIO** | `blockGeometry`, `assignLanes`, `dentistColumns` intactos. |

### Invariantes

- `getDoctorColor` es pura: mismo input → mismo output, siempre. No depende de contexto ni estado.
- `useDrag` no contiene lógica de negocio; solo coordina pointer events y delega la mutación al componente.
- La matemática de posicionamiento (`blockGeometry`, `STEP_MIN`) no se duplica — el hook la importa directamente.

---

## Sección 6 · Testing

### Unit tests — Vitest (lógica pura)

1. `getDoctorColor(id)` — mismo id → mismo color; 8 colores; nunca undefined.
2. `snapToStep(y, pxPerHour)` — snap a 15min; bordes; límite OPEN/CLOSE_HOUR.
3. Ghost slot calc — dado pointer Y → devuelve `{date, time}` correcto.
4. Optimistic update + revert — estado antes/después/error (mock fetch).

### Integration tests — Vitest + Testing Library

1. WeekView renderiza colores distintos para doctores distintos.
2. Estado `no_show` aplica clase tachado + gris en el bloque.
3. MonthView muestra pastillas de nombre (no badge contador). 3 citas → 2 pastillas + "+1 más".
4. Drag: `pointerDown→Move→Up` dispara `PATCH` con nueva hora correcta.

### Fuera de scope v1

- Tests E2E / Playwright (no hay setup en el proyecto).
- Tests de animaciones CSS.
- Tests de accesibilidad / keyboard nav (postergado a v2 con el resto de a11y).

### Reglas de calidad

- Los **93 tests existentes** deben seguir pasando en verde sin regresiones.
- TypeScript strict: 0 errores, sin `as any`.
- Cobertura objetivo ≥ 80% en los 2 archivos nuevos (`doctorColor.ts`, `dragDrop.ts`).

---

## Fuera de scope (v1)

- Drag cross-day en Vista Semana.
- Resize de citas arrastrando el borde inferior.
- Hover para cambiar estado rápido.
- Keyboard navigation completa.
- Tests E2E.
- Dark mode (usa el sistema existente del proyecto).
