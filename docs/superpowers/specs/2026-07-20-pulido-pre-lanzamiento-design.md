# Pulido pre-lanzamiento — Diseño

**Contexto:** dos auditorías de UI/UX previas al lanzamiento (una sobre la app
de cara a la clínica, otra sobre superadmin + sistema de diseño) detectaron un
conjunto de arreglos mecánicos, de bajo riesgo y alto impacto visual. Este spec
agrupa los cuatro más accionables para atacarlos antes de lanzar. Las mejoras
estructurales más grandes (rediseño con pestañas de la ficha de paciente y de
Ajustes, unificar `/cuentas` dentro de la ficha, fusionar Inicio/Caja,
refactor del panel de superadmin a los componentes de `components/ui/`) quedan
**fuera de alcance** — son un segundo proyecto posterior.

La agrupación de la sección ADD-ONS por categoría
(`docs/superpowers/specs/2026-07-20-superadmin-addons-agrupados-design.md`, ya
aprobada) NO se re-especifica aquí, pero se implementará en el **mismo plan**
que este spec para lanzar todo el pulido junto.

## Objetivo

Cuatro arreglos independientes entre sí:

### 1. Eliminar diálogos nativos del navegador

La app tiene un sistema de confirmación propio (`confirm()` de `lib/confirm.ts`
→ `<ConfirmHost/>`, ya montado en el layout) y un `Modal` reutilizable
(`components/ui/Modal.tsx`). Cuatro lugares todavía usan los diálogos nativos
del navegador, que no respetan el tema, se ven "sin terminar" y rompen el flujo
—especialmente grave en la ficha de paciente, la pantalla más usada:

- `components/patients/EvolutionPanel.tsx:71` — `confirm("¿Borrar esta nota…")`
  → reemplazar por `await confirm({...})` de `lib/confirm.ts` (hacer async el
  handler `handleDelete`).
- `components/treatments/TreatmentPlanPanel.tsx:120` — `confirm("¿Eliminar
  este trabajo?")` **y** `alert(res.error)` (línea siguiente) → `await
  confirm({...})` para la confirmación y `toast(res.error, "error")` para el
  error. `toast` se importa de `@/lib/toast` con firma
  `toast(message: string, type?: "success" | "error" | ...)` — mismo import y
  uso que ya tiene `components/patients/EvolutionPanel.tsx:15,74`.
- `components/treatments/TreatmentCatalog.tsx:138` — `confirm("¿Desactivar…")`
  → `await confirm({...})`.
- `components/superadmin/AddonToggle.tsx` — el `window.prompt`/`window.alert`
  del cupo de fotos (agregado hoy) → reemplazar por el `Modal` de
  `components/ui/Modal.tsx` con un input numérico. El add-on de fotos solo se
  activa al confirmar el modal con un número válido (> 0 entero); cancelar el
  modal deja el add-on apagado (mismo comportamiento que hoy con el prompt).
  El resto de add-ons sigue usando `confirm()` como quedó implementado hoy.

Mensajes de `confirm()`: conservar el texto ya presente en cada lugar (título
corto + el mismo mensaje actual), `confirmText`/`cancelText` en español neutro,
`tone: "danger"` para los borrados/desactivaciones.

### 2. Íconos faltantes en el menú lateral

`components/Sidebar.tsx` mapea `href → ícono Lucide` en `ICONS` (línea ~31).
Faltan entradas para varias rutas de `FEATURES` (`lib/features.ts`), que caen
al fallback `<span>•</span>` (un bullet plano que desentona). Agregar íconos
para **todas** las rutas de nav hoy ausentes del mapa — al menos
`/tratamientos`, `/campanas`, `/disponibilidad`. Íconos sugeridos (de
`lucide-react`, todos existen): `/tratamientos` → `Layers`, `/campanas` →
`Megaphone`, `/disponibilidad` → `CalendarClock`. Escanear `FEATURES` contra
`ICONS` para no dejar ninguna ruta con bullet.

### 3. Dark mode: pasteles sin override en superadmin

El proyecto documenta en `CLAUDE.md` que los colores pastel (`bg-red-50`,
`bg-amber-100`, etc.) NO invierten con el truco de variables CSS y necesitan
`dark:` explícito. Se aplicó a medias en el panel de superadmin. Corregir los
casos donde un tono pastel carece de su `dark:` mientras sus vecinos sí lo
tienen:

- `app/(dashboard)/superadmin/page.tsx` — el stat "Usuarios" (`text-slate-600
  bg-slate-100`) sin `dark:` mientras "Activas"/"Suspendidas"/"Fotos" sí.
- `components/superadmin/ClinicList.tsx` — el badge "Suspendida"
  (`bg-amber-100 text-amber-700`) y el `ring-amber-300` de la tarjeta
  suspendida, sin `dark:`, a diferencia del mismo ámbar que sí lo tiene en
  `page.tsx`.

Regla: cada clase pastel `-50/-100/-500` de esos archivos debe tener su
`dark:` (`dark:bg-…-500/10`, `dark:text-…-300`, etc.), siguiendo el patrón ya
usado en los vecinos correctos del mismo archivo. Revisar ambos archivos
completos por si hay más casos.

### 4. Clínicas nuevas nacen con preset "Consultorio"

Hoy `NewClinicForm.tsx` solo pide nombre, plan, admin y un checkbox de
WhatsApp; `createClinic` (`app/(dashboard)/superadmin/actions.ts:41`) inserta
`features: { whatsapp: whatsappAddon }`, y como `normalizeFeatures`
(`lib/features.ts`) trata las claves no-optIn ausentes como "encendidas", toda
clínica nueva nace con TODOS los módulos (preset "Clínica completa"), aunque
sea un consultorio de un doctor.

Cambio: agregar al formulario un selector de preset (Consultorio / Clínica
completa), **con "Consultorio" preseleccionado por defecto**. `createClinic`
recibe el preset elegido y persiste el `features` correspondiente en el insert,
reutilizando la lógica ya existente (`ModulePreset`, los presets
`"consultorio"`/`"clinica"` de `lib/features.ts`, y/o `applyModulePreset`).

Detalle de implementación a resolver en el plan: construir el objeto `features`
inicial según el preset elegido (consultorio = módulos core-only + los no-optIn
de clínica apagados; clínica = como hoy), preservando el `whatsapp: whatsappAddon`
ya existente. La fuente de verdad de qué módulos apaga "consultorio" es la misma
que usa `applyModulePreset` hoy (Inventario, Dashboard, Cuentas, Auditoría) —
no duplicar esa lista, derivarla de `lib/features.ts`.

## Testing

- Los cuatro cambios son UI/interacción + un ajuste de datos en un insert. No
  hay lógica pura nueva que amerite un test unitario nuevo, salvo que el armado
  del `features` inicial por preset (punto 4) resulte una función pura
  extraíble — en ese caso, un test chico de esa función (consultorio vs clínica
  → objeto `features` esperado) es apropiado.
- Verificación general: `npx tsc --noEmit` + `npm test` (sin regresiones) +
  prueba manual de cada punto (borrar nota/trabajo/catálogo muestra el modal
  propio; activar fotos muestra el modal con input; menú sin bullets; dark mode
  consistente en superadmin; clínica nueva nace en "Consultorio").

## Fuera de alcance (segundo proyecto, post-lanzamiento)

- Pestañas en la ficha de paciente y en Ajustes.
- Unificar `/cuentas` como pestaña de la ficha.
- Fusionar/renombrar Inicio vs Caja.
- Migrar el panel de superadmin a los componentes de `components/ui/`
  (`Card`, `Badge`, `Button`, `PageHeader`) y unificar el color de
  `FeatureToggle` vs `AddonToggle`.
- Agrupar el sidebar por secciones; estado vacío de `/caja`; redirección de
  login según "Inicio"; pestañas en la tarjeta de clínica del superadmin.
