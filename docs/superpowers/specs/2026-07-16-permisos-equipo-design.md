# Permisos del equipo (addon `permisos_equipo`) — Diseño

**Fecha:** 2026-07-16
**Estado:** Aprobado por Paulo (addon opt-in)

## Problema

Hoy la visibilidad de módulos la deciden dos capas fijas: los módulos contratados
por la clínica (`clinics.features`, superadmin) y el whitelist por rol
(`NAV_WHITELIST` en `lib/rbac.ts`). El admin de la clínica no puede afinar qué ve
cada trabajador individual: todos los doctores ven lo mismo, todas las
recepcionistas ven lo mismo.

## Solución

Tercera capa de visibilidad, **por usuario**: el admin oculta módulos concretos a
miembros concretos de su equipo desde un panel nuevo en Ajustes.

**Regla de visibilidad efectiva** (las 3 deben cumplirse):

1. La clínica tiene el módulo encendido (`clinics.features`) — existente.
2. El rol del usuario lo permite (`NAV_WHITELIST`) — existente, es el techo.
3. El admin NO se lo ocultó a ese usuario (`profiles.hidden_modules`) — nuevo,
   solo activo si la clínica tiene el addon `permisos_equipo` encendido.

## Decisiones de diseño

- **Solo restar, nunca sumar.** El toggle por usuario solo oculta módulos que el
  rol ya permite. Dar módulos por encima del rol requeriría tocar RLS
  (el usuario vería el menú pero la DB le negaría los datos). Fuera de alcance.
- **Addon opt-in** `permisos_equipo` (como `calificaciones`, `fotos`): se
  enciende por clínica desde Superadmin. Con el addon apagado, `hidden_modules`
  se ignora por completo (comportamiento actual intacto).
- **El admin no es recortable.** No aparece en el panel y los helpers devuelven
  "nada ocultable" para rol `admin`. Evita que el admin se encierre fuera de
  Ajustes.
- **`agenda` no es ocultable para nadie.** Es el destino de redirect de todos
  los guards (`requireNavAccess` → `redirect("/agenda")`); ocultarla crearía un
  loop o un usuario sin pantalla de aterrizaje. `ajustes` tampoco (solo admin la
  ve y el admin está excluido).
- **`pacientes` y `tratamientos` migran de `requireFeature` a
  `requireNavAccess`** para que el ocultado aplique también entrando por URL
  directa, igual que el resto de módulos.
- **Recepcionistas sin cuenta** (`clinic_receptionists`) no aplican: no tienen
  login.
- **Superadmin en vista previa** no se recorta (su perfil temporal no tiene
  módulos ocultos, y de todas formas es admin).

## Datos

Migración `0089_hidden_modules.sql`:

```sql
alter table profiles
  add column if not exists hidden_modules jsonb not null default '[]'::jsonb;
```

Sin cambios de RLS: la policy existente `profiles_admin_write` ya permite al
admin de la clínica actualizar perfiles de su clínica, y `profiles_select` deja
a cada usuario leer el suyo.

Default `[]` = nada oculto → cero impacto al deployar sobre clínicas existentes.

## Componentes

| Unidad | Responsabilidad |
|---|---|
| `lib/features.ts` | Nueva clave `permisos_equipo` (optIn) en `FeatureKey`/`FEATURES`. |
| `lib/rbac.ts` | Helpers puros: `parseHiddenModules(raw)` (valida el jsonb), `hideableModules(role)` (whitelist del rol menos `agenda`/`ajustes`; `[]` para admin), `sanitizeHiddenModules(role, keys)` (recorta a lo ocultable). |
| `lib/auth.ts` | `getProfile()` incluye `hiddenModules: FeatureKey[]` (parseado). |
| `lib/guard.ts` | `requireNavAccess` redirige también si el addon está ON y el módulo está en `hiddenModules` del usuario. |
| `app/(dashboard)/layout.tsx` | El filtro del menú excluye módulos ocultos del usuario (solo con addon ON, nunca para admin/superadmin). |
| `app/(dashboard)/ajustes/permissions-actions.ts` | Server action `setHiddenModules(targetUserId, keys)`: valida admin + addon + target no-admin + sanitiza + update. |
| `components/ajustes/PermissionsPanel.tsx` | Panel client: lista de miembros (sin el admin), por miembro checkboxes de módulos visibles (solo los encendidos en la clínica ∩ ocultables por su rol), botón guardar por miembro, toast. |
| `app/(dashboard)/ajustes/page.tsx` | Sección nueva "Permisos del equipo" gateada por `isClinicAdmin && features.permisos_equipo`; el fetch del equipo agrega `hidden_modules`. |

## Flujo de datos

Admin abre Ajustes → server component lee el equipo con `hidden_modules` →
`PermissionsPanel` muestra checkboxes (checked = visible) → guardar llama
`setHiddenModules` → sanitiza contra el rol del target → `update profiles set
hidden_modules = ...` (RLS limita a su clínica) → `revalidatePath("/ajustes")`.
El usuario afectado ve el menú actualizado en su siguiente navegación (el layout
lee `hidden_modules` en cada request; no requiere re-login porque no vive en el
JWT).

## Manejo de errores

- Action sin permiso (`settings:write`), addon apagado, target admin o target
  fuera de la clínica → `{ error }` y toast; la DB además lo bloquea por RLS.
- Claves desconocidas o fuera del whitelist del rol en el payload → se descartan
  silenciosamente en `sanitizeHiddenModules` (defensa contra payloads a mano).
- jsonb corrupto en DB → `parseHiddenModules` devuelve `[]` (falla abierto hacia
  el comportamiento actual, nunca rompe el layout).

## Testing

Vitest sobre los helpers puros (`parseHiddenModules`, `hideableModules`,
`sanitizeHiddenModules`) en `tests/permisos.test.ts`. La integración
(guard/layout/action) se verifica manualmente en local con dos cuentas
(admin + doctor seed).

## Fuera de alcance

- Otorgar módulos por encima del rol (requiere RLS).
- Permisos de escritura granulares (solo visibilidad de módulos).
- Recorte de sub-secciones dentro de un módulo.
