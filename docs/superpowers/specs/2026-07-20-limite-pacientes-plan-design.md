# Límite de pacientes por clínica (upsell) — Diseño

**Contexto:** varias plataformas de la competencia (ver capturas de pricing de
terceros aportadas por el usuario) listan un tope de pacientes por plan como
gancho de upsell. Dentia hoy no tiene ningún tope de pacientes por clínica —
solo existe `clinics.max_users` (cupo de usuarios) y `photo_quota` (cupo de
fotos), ambos editables a mano por el superadmin desde el panel. Este diseño
extiende el mismo patrón a pacientes.

**Objetivo:** dar al superadmin (Paulo) una palanca de upsell: fijar un tope
de pacientes por clínica y que la clínica vea un aviso (no un bloqueo) cuando
se acerca o lo supera, empujando a subir de plan.

**Fuera de alcance:** no existe página de pricing/marketing en este repo (las
capturas mostradas son de sitios de terceros) — este diseño no la crea. No hay
bloqueo duro de creación de pacientes en ningún caso.

## Modelo de datos

Nueva migración `supabase/migrations/0091_max_patients.sql` (idempotente,
sigue la convención de `docs/DEPLOY-MIGRACIONES.md`). **Nota:** en `main` el
último número es `0090` — la migración `0091_shared_practice.sql` del feature
"consultorio compartido" vive solo en su worktree/rama, todavía sin mergear.
Si esa rama se mergea primero, esta migración debe renumerarse a `0092`.

```sql
alter table clinics
  add column if not exists max_patients integer;

notify pgrst, 'reload schema';
```

`max_patients` es `null` por defecto → **ilimitado**. Ninguna clínica
existente cambia de comportamiento al desplegar esta migración. El superadmin
activa el tope clínica por clínica poniéndole un número, igual que ya hace
con fotos.

No hace falta columna en el lado de RLS ni policy nueva: es un dato de solo
lectura para la clínica (nunca lo edita ella), y de lectura/escritura para
`service_role` (superadmin) — mismo régimen que `max_users`.

## Panel de superadmin

**Componente:** `components/superadmin/MaxPatientsInput.tsx`, calcado de
`PhotoQuotaInput.tsx` (mismo patrón de edición inline con
`useActionState` + botón lápiz):

- Si `max_patients` es `null`: badge de solo información, "127 pacientes",
  sin fracción — no bloquea, invita a poner un tope con el mismo click de
  edición.
- Si `max_patients` tiene valor: badge "127 / 500 pacientes", con el mismo
  criterio de color que ya usa toda la plataforma vía
  `usageLevel()` de `lib/storageLimits.ts` (ámbar ≥80%, rojo ≥90%,
  `USAGE_WARN`/`USAGE_DANGER` ya definidos — se reutilizan tal cual, sin
  nuevos umbrales).
- Editar pone el campo en `null` si se borra el valor (vacío = quitar tope),
  o el número si se escribe uno.

**Server action:** `setMaxPatients(prevState, formData)` en
`app/(dashboard)/superadmin/actions.ts`, mismo patrón que `setMaxUsers`:
valida `clinicId` + `maxPatients` (entero ≥0 o vacío/null), hace
`assertSuperadmin()`/equivalente ya existente en el archivo, actualiza con
`createAdminClient()`, `revalidatePath("/superadmin")`.

**Ubicación en la lista:** en `components/superadmin/ClinicList.tsx`, junto a
`MaxUsersInput` (misma fila de metadatos de la tarjeta de clínica). Requiere
el conteo real de pacientes por clínica — agregar un `count` de `patients`
por `clinic_id` a la query paralela que ya arma `superadmin/page.tsx` (mismo
estilo que el conteo de usuarios activos), pasado como prop `currentCount`.

## Banner de upsell en `/pacientes`

**Dónde:** parte alta de `app/(dashboard)/pacientes/page.tsx`, antes de la
lista.

**Cuándo se muestra:** solo si `clinics.max_patients` no es `null` **y**
`usageLevel(count, max_patients)` es `"warn"` o `"danger"` (mismo criterio
80%/90% que el resto de la plataforma). Por debajo de 80%, no se muestra
nada — no hay ruido para la mayoría de las clínicas que nunca tendrán tope.

**A quién se le muestra:** solo a `admin`, o a `colega` cuando
`profile.sharedPractice` es verdadero (mismo criterio que ya usa
`canSeeNav`/`can()` de `lib/rbac.ts` para gestión). Recepción y asistentes no
lo ven — no son quienes deciden sobre el plan.

**Contenido:** banner no descartable, tono ámbar (`warn`) o rojo (`danger`),
reutilizando la misma paleta que ya usan los banners de alerta del panel de
superadmin (`bg-amber-50 ring-amber-200` / `bg-red-50 ring-red-200`, con
variantes `dark:`):

> Estás usando **{count} de {max_patients}** pacientes de tu plan.
> Contáctanos para subir de plan.

**Comportamiento:** puramente informativo. Nunca impide crear, editar ni
importar pacientes, sin importar cuánto se supere el tope — decisión ya
tomada con el usuario (upsell por aviso, no bloqueo duro).

## Testing

- `lib/storageLimits.ts` (`usageLevel`) ya tiene cobertura de tests — no hace
  falta nueva lógica pura, se reutiliza tal cual.
- Test para `setMaxPatients` en el archivo de tests de superadmin actions
  existente (si lo hay) o uno nuevo, cubriendo: valor válido, vacío → null,
  negativo → error, no-superadmin → error (mismo esquema que los tests
  existentes de `setMaxUsers`/`setPhotoQuota`, si existen).
- No hace falta test de RLS: no hay policy nueva.

## Rollout

Ilimitado por defecto para todas las clínicas → sin riesgo al desplegar. El
superadmin activa el tope manualmente, clínica por clínica, cuando quiera
usarlo como palanca comercial.
