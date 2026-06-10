# Handoff — sesión pausada 2026-06-10

## Bug pendiente
En **Pacientes → [id]**:
1. El **plan de tratamiento no muestra los registros guardados** (works vacíos).
2. El **dropdown de doctor** en el form de pago aparece vacío (aunque ya jala usuarios de `profiles`).

Fixes **diagnosticados pero NO aplicados** (fui interrumpido antes de editar).

## Causa 1 — dropdown vacío
`app/(dashboard)/pacientes/[id]/page.tsx` (~líneas 67-72): la query de `profiles` usa
`.eq("clinic_id", patient.clinic_id)`. Si `patient.clinic_id` viene `null/undefined`,
PostgREST genera `WHERE clinic_id IS NULL` → 0 filas.

- El RLS ya filtra por clínica (`profiles_select` en `0002_rls.sql`: `clinic_id = auth_clinic_id()`),
  así que el `.eq` es redundante y peligroso.
- La query equivalente en `caja/page.tsx:47` **no** tiene ese `.eq` y funciona.

**FIX:** quitar `.eq("clinic_id", patient.clinic_id)` de esa query (dejar solo `.in("role", [...])` + `.order`).

## Causa 2 — works/plan vacíos
La query de `treatment_plans` en `pacientes/[id]/page.tsx` (~líneas 49-55) usa el join anidado
`doctor:profiles(full_name)` dentro de `treatment_items`. Tras la migración **0026**
(repunta `treatment_items.doctor_id` FK `doctors`→`profiles`), PostgREST puede no haber
recargado el schema cache → el join falla en silencio y la query entera devuelve `null`.

**Verificar:** correr la query SIN el join `doctor:profiles` primero. Si vuelven los works → es schema cache.
**Solución:** recargar PostgREST local: `select pg_notify('pgrst','reload schema');`
o reiniciar Supabase local (`supabase stop` / `supabase start`).
**Confirmar también** que las migraciones **0025** y **0026** sí se aplicaron a la DB local.

## Causa 3 (bonus)
`lib/features.ts:33` aún tiene label `"Registro de Doctores"` para la key `ajustes`
→ el sidebar muestra ese texto viejo. Cambiar a `"Ajustes"` (confirmar con el usuario).
Ya quitamos `DoctorsPanel` de ajustes, pero el label del nav quedó.

## Regla crítica
**"siempre primero todo en local"** — NO push a GitHub/Vercel sin probar local primero.

## Archivos clave
- `app/(dashboard)/pacientes/[id]/page.tsx`
- `components/history/PatientHistoryPanel.tsx`
- `components/treatments/TreatmentPlanPanel.tsx`
- `app/(dashboard)/pacientes/treatment-actions.ts`
- `lib/features.ts`
- Migraciones `0025` (payments.doctor_id→profiles + commission_pct), `0026` (treatment_items.doctor_id→profiles)
