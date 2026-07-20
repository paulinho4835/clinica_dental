# Defaults de clínicas nuevas + confirmación al activar add-ons — Diseño

**Contexto:** se evaluó convertir el campo `clinics.plan` (Starter/Pro/Premium,
hoy solo una etiqueta sin efecto — ver `components/superadmin/PlanSelect.tsx`
y `setPlan` en `app/(dashboard)/superadmin/actions.ts`) en un sistema de
presets que precargara topes de usuarios/pacientes/fotos. Se descartó: el
modelo real del negocio es un solo plan base, con add-ons que se activan
clínica por clínica según necesidad — no tiers con distintos límites. El
campo `plan` queda como está (etiqueta editable, sin efecto funcional), fuera
de alcance de este diseño.

**Objetivo real (lo que sí se construye):**
1. Las clínicas nuevas arrancan con un tope de 500 pacientes por defecto
   (no ilimitado como hoy), sin tocar clínicas existentes.
2. Activar un add-on desde `/superadmin` pide confirmación explícita, para
   evitar activaciones accidentales que "se escapen de las manos" (costo,
   complejidad) al superadmin.

## 1. Tope de 500 pacientes en clínicas nuevas

**Dónde:** `createClinic` en `app/(dashboard)/superadmin/actions.ts` (el
insert a `clinics`, hoy en la línea ~41-44).

**Cambio:** agregar `max_patients: 500` al objeto insertado, junto a `name`,
`plan`, `features`. Ningún otro campo cambia. Las clínicas ya existentes NO
se tocan (no hay backfill ni migración de datos) — este valor solo aplica
hacia adelante, al momento de creación.

El superadmin puede editarlo después con el badge `MaxPatientsInput` ya
existente en `ClinicList.tsx`, exactamente igual que hoy.

## 2. Confirmación al activar un add-on

**Mecanismo:** el diálogo imperativo ya existente en el proyecto —
`confirm({ title, message, confirmText, cancelText, tone })` de
`lib/confirm.ts`, resuelto por `<ConfirmHost/>` (ya montado en
`app/(dashboard)/layout.tsx`). **No** se usa `window.confirm` — ese patrón ya
fue señalado como desviación de la convención del proyecto en una revisión de
código anterior de esta misma sesión.

**Dónde:** `components/superadmin/AddonToggle.tsx`, función `flip()`.

**Alcance:** únicamente la sección ADD-ONS (los toggles renderizados vía
`AddonToggle`, es decir los `FeatureKey` con `optIn: true` en
`lib/features.ts`). La sección MÓDULOS (`FeatureToggle`, features core o
no-opt-in) no cambia — sigue activándose sin confirmación, como hoy.

**Cuándo:** solo al **activar** (`next === true`). Desactivar sigue siendo
instantáneo, sin diálogo — es reversible y de bajo riesgo.

**Caso especial `fotos`:** ya tiene, desde el cambio de hoy mismo, un
`window.prompt()` que pide la cantidad de fotos al activar (y aborta la
activación si se cancela o el número es inválido). Ese prompt ya cumple el
rol de "¿estás seguro?" — no se le agrega un segundo diálogo de confirmación
encima. El flujo para `fotos` queda: `next === true` → `window.prompt`
cantidad → (si válido) activar directo, sin pasar por `confirm()`. **Todos
los demás `FeatureKey` con `optIn: true`** en `lib/features.ts` (la lista
completa de la sección ADD-ONS, actualmente 22 keys — `inicio`, `pagos`,
`bloqueo_horario`, `whatsapp_manual`, `recetas`, `perfil`,
`consentimientos`, `recordatorios`, `calificaciones`, `fotos_contador`,
`wa_masivo`, `campanas`, `aviso_doctores`, `disponibilidad`, `agente_ia`,
`agente_ia_t2`, `agente_ia_t3`, `agente_ia_info`, `logo`, `periodontograma`,
`odontograma_pediatrico` — más `fotos`, que tiene su propio flujo) sí pasan
por `confirm()` al activarse. La condición en código es simplemente
`featureKey !== "fotos"` — no hace falta enumerar keys en el componente, la
lista de arriba es solo para que quede claro qué cubre hoy.

**Mensaje:**
```
title: "Activar add-on"
message: `¿Activar "${label}" para esta clínica?`
confirmText: "Activar"
cancelText: "Cancelar"
tone: "default"
```
(`label` es el texto ya mostrado en el botón, ej. "WhatsApp Manual".)

**Flujo resultante en `flip()`:**
1. Si `next === false` (desactivando): sin cambios, sigue directo.
2. Si `next === true` y `featureKey === "fotos"`: prompt de cantidad (como
   quedó implementado hoy), sin `confirm()`.
3. Si `next === true` y `featureKey !== "fotos"`: `await confirm({...})`; si
   `false`, no se activa (return temprano, sin tocar `startTransition`).

## Testing

- Sin lógica pura nueva que testear unitariamente (todo es UI/interacción +
  un valor constante en un insert). Se verifica con `npx tsc --noEmit` y
  prueba manual: activar un add-on no-fotos y confirmar que aparece el
  diálogo y que cancelar no lo activa; crear una clínica nueva y confirmar
  `max_patients = 500` en la fila insertada.

## Fuera de alcance

- El campo `clinics.plan` / `PlanSelect` no cambia.
- La sección MÓDULOS no pide confirmación.
- No hay backfill de `max_patients` para clínicas existentes.
- El reordenamiento visual del panel de superadmin es un sub-proyecto aparte
  (spec propia, pendiente).
