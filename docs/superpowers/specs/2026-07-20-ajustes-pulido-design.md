# Ajustes: orden de menú, logo por archivo y moneda configurable — Diseño

**Contexto:** el usuario detectó tres fricciones en `/ajustes`: "Ajustes" no
está al final del menú lateral (lugar donde los usuarios esperan encontrar
configuración), el logo de la clínica solo se puede pegar como URL pública
(la mayoría de los doctores tiene el archivo, no una URL), y el sistema
asume Bolivianos (Bs) en todos los montos, lo que rompe para clínicas fuera
de Bolivia.

## 1. "Ajustes" al final del menú lateral

El orden del menú (`components/Sidebar.tsx`) sigue el orden del array
`FEATURES` en `lib/features.ts:50`. Cada rol solo ve las entradas de su
`NAV_WHITELIST` (`lib/rbac.ts`); las entradas de `FEATURES` con
`href: "/ajustes"` que no sean la propia clave `"ajustes"` (`perfil`,
`recordatorios`, `bloqueo_horario`, `agente_ia_info`, `logo`) son
subsecciones internas de esa página y no generan un ítem de menú aparte —
por eso mover la entrada `ajustes` no duplica ni reordena nada más.

**Cambio:** mover la entrada `{ key: "ajustes", label: "Ajustes", href:
"/ajustes", core: true }` de `lib/features.ts:61` al final del array
`FEATURES` (después de `odontograma_pediatrico`, línea 112). Ningún otro
archivo cambia — el orden se deriva automáticamente en
`app/(dashboard)/layout.tsx:111`.

## 2. Logo: subida de archivo en vez de URL pegada a mano

Hoy existen DOS mecanismos de logo, cada uno detrás de un addon distinto:

- **`ClinicProfilePanel.tsx`** (addon `perfil`, `lib/features.ts:68`): campo
  de texto `logo_url` — el usuario debe pegar una URL pública.
- **`LogoUploader.tsx`** (addon `logo`, `lib/features.ts:106`): subida de
  archivo real (comprime a WebP en el navegador, sube a R2 vía URL firmada,
  guarda `clinics.logo_storage_key`). Ya funciona, ya está probado.

`lib/clinicLogo.ts` (usado por todas las páginas de impresión) ya prioriza
`logo_storage_key` sobre `logo_url` — el mecanismo de subida es
estrictamente superior al de URL manual. Se retira el campo de URL y el
gate de addon pago sobre la subida:

**Cambios:**

- **`lib/features.ts`**: eliminar la clave `"logo"` del tipo `FeatureKey`
  (línea 35), de `FEATURES` (línea 106) y de `ADDON_GROUPS` → grupo
  "🦷 Ficha clínica y documentos" (línea 123, queda sin `"logo"` en la
  lista de keys). Ya no es un addon de pago independiente.
- **`lib/clinicLogo.ts`**: quitar el chequeo `features.logo` (línea 28) —
  la función pasa a comprobar solo `data.logo_storage_key` y
  `isR2Configured()`, sin consultar `features` ni `normalizeFeatures` (se
  eliminan esos imports). Cualquier clínica con un logo subido lo ve
  impreso, sin depender de un addon.
- **`components/ajustes/ClinicProfilePanel.tsx`**: eliminar el campo
  `logo_url` del formulario (líneas 91-105: label, input, `<span>` de ayuda)
  y el bloque de preview (líneas 107-117). El tipo `ClinicProfile` (línea
  7-13) pierde el campo `logo_url`.
- **`app/(dashboard)/ajustes/actions.ts`**: en `ClinicProfileSchema` (línea
  249-255) eliminar el campo `logo_url`; en `updateClinicProfile` (línea
  257-290) eliminar su lectura del `FormData` (línea 270) y su escritura en
  el `update()` (línea 283). La columna `clinics.logo_url` NO se borra de
  la base de datos (compatibilidad — ver más abajo) ni se agrega migración
  para ella.
- **`app/(dashboard)/ajustes/page.tsx`**: el bloque de "Logo de la clínica"
  (líneas 205-221) deja de depender de `features.logo` — pasa a mostrarse
  bajo la misma condición que el perfil, `isClinicAdmin && features.perfil`
  (igual que el bloque `clinicProfile` de la línea 194). Se elimina
  también la obtención de `logoCurrentUrl` condicionada a `features.logo`
  (líneas 46-58) y se reemplaza por la misma condición `features.perfil`.
  Visualmente, la sección "Logo de la clínica" queda inmediatamente
  después de "Perfil de la clínica" (sin fusionar los componentes: menos
  cambio de código, mismo resultado para el usuario — dos tarjetas
  consecutivas bajo el mismo permiso).

**Compatibilidad:** clínicas que ya tenían una `logo_url` pegada a mano
siguen viéndola en documentos impresos (la prioridad de
`getClinicLogoUrl` ya cae a `logo_url` si no hay `logo_storage_key`) — solo
dejan de poder EDITARLA desde la UI; si quieren cambiarla, suben un
archivo nuevo, que la reemplaza (prioridad de `logo_storage_key` es mayor).

## 3. Moneda configurable por clínica

Hoy `lib/format.ts` tiene `bs(n)`, que formatea con el símbolo fijo `"Bs "`.
Se usa en 28 archivos (páginas del dashboard, componentes cliente,
páginas de impresión, y la ruta de API que genera el PDF de presupuesto).

### Modelo de datos

Nueva columna en `clinics`:

```sql
alter table clinics add column if not exists currency text not null default 'Bs';
```

Migración: `supabase/migrations/0092_clinic_currency.sql` (nota de
numeración: en este momento hay una rama sin mergear
`worktree-feature+consultorio-compartido-colegas` con
`0091_shared_practice.sql`; si esa rama mergea antes que esta, renumerar
este archivo a `0093` para no colisionar). El archivo debe terminar con
`notify pgrst, 'reload schema';` (mismo patrón que `0091_max_patients.sql`).

### Formateador

`lib/format.ts`: renombrar `bs(n)` a `money(n, currency)`:

```ts
// Formato de moneda: símbolo (ASCII) + monto con 2 decimales. El símbolo es
// configurable por clínica (clinics.currency); "Bs" es el default histórico.
export function money(n: number | null | undefined, currency: string): string {
  return `${currency} ${Number(n ?? 0).toFixed(2)}`;
}
```

Sin conversión de tipo de cambio ni formato numérico por locale (separador
de miles, decimal `,` vs `.`) — fuera de alcance. Solo cambia el símbolo
que se antepone al monto, con el mismo `.toFixed(2)` de siempre.

### Cómo cada consumidor obtiene el símbolo

**Server components y páginas** (la mayoría de los 28 usos: páginas bajo
`app/(dashboard)/...` y `app/(print)/...`): usan un helper cacheado por
request, nuevo en `lib/superadmin.ts` (mismo archivo y mismo patrón que
`getClinicFeatures`, línea 24):

```ts
// Moneda de la clínica del usuario actual. Cacheado por request.
export const getClinicCurrency = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Bs";
  const { data: profile } = await supabase
    .from("profiles")
    .select("clinic_id")
    .eq("id", user.id)
    .single();
  if (!profile) return "Bs";
  const { data: clinic } = await supabase
    .from("clinics")
    .select("currency")
    .eq("id", profile.clinic_id)
    .single();
  return (clinic?.currency as string | null) ?? "Bs";
});
```

Cada página server component que hoy llama `bs(n)` pasa a llamar
`await getClinicCurrency()` una vez arriba del componente y usar
`money(n, currency)`.

**Páginas de impresión** (`app/(print)/pacientes/[id]/imprimir/page.tsx`,
`imprimir-anamnesis/page.tsx`, `expediente/page.tsx`,
`app/(print)/agenda/[date]/page.tsx`,
`app/(print)/pacientes/[id]/consentimiento/[consentId]/page.tsx`,
`app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx`,
`app/(print)/pacientes/[id]/fotos/page.tsx`): estas páginas ya resuelven
`clinic_id` directamente al consultar el paciente/cita (sin pasar por
`getProfile()` de sesión, porque a veces se imprimen desde un enlace).
Cada una agrega `currency` al `select()` de `clinics` que ya hace (mismo
patrón que `PrintBrand.tsx`/`getClinicLogoUrl` reciben `clinicId`) y pasa
el valor a `money()`.

**Ruta de API `app/api/budgets/[planId]/route.ts`**: ya hace
`select(..., clinic:clinics(name), ...)` (línea 26) — se agrega `currency`
a esa misma selección y se usa en `money(price, currency)` en vez de
`bs(price)`.

**Client components que llaman `bs()`** (reciben datos por props desde su
página padre, igual que reciben cualquier otro dato de la clínica):
`ApptModal.tsx`, `StaffPaymentForm.tsx`, `PrintPagosButton.tsx`,
`WorkForm.tsx`, `EditWorkButton.tsx`, `PatientHistoryPanel.tsx`,
`TreatmentCatalog.tsx`, `TreatmentPlanPanel.tsx`, `PrintSelectModal.tsx`,
`TreatmentProgressBar.tsx`, `PrintPdfButton.tsx`, `CashSessionPanel.tsx`,
`TopDoctorsChart.tsx`, `TopTreatmentsChart.tsx`, `RevenueChart.tsx`. Cada
uno agrega una prop `currency: string`, y su página padre (que ya llama
`getClinicCurrency()` para su propio uso de `money()`, o lo agrega si aún
no llamaba `bs()` directamente) se la pasa.

### UI para elegir la moneda

Se agrega un campo a `components/ajustes/ClinicProfilePanel.tsx` (mismo
formulario y mismo botón "Guardar cambios" que nombre/dirección/NIT — no
es una sección nueva), justo después del campo NIT/RUC:

```tsx
{/* Moneda */}
<label className="text-xs">
  <span className="mb-1 block font-medium text-slate-600">Moneda</span>
  <select
    name="currency"
    defaultValue={profile.currency}
    disabled={!canWrite}
    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:bg-slate-50 disabled:text-slate-400"
  >
    <option value="Bs">Bs — Boliviano</option>
    <option value="S/">S/ — Sol peruano</option>
    <option value="$">$ — Peso / genérico</option>
    <option value="US$">US$ — Dólar</option>
    <option value="€">€ — Euro</option>
  </select>
</label>
```

El tipo `ClinicProfile` gana `currency: string`. `ClinicProfileSchema` (en
`actions.ts`) gana:

```ts
currency: z.string().trim().min(1).max(5, "Máximo 5 caracteres"),
```

y `updateClinicProfile` la persiste en el `update()`. Con 5 opciones fijas
no hace falta un campo "Otro" de texto libre — si en el futuro se necesita
un símbolo no listado, se agrega a la lista (una línea).

## Testing

- `initialFeaturesForPreset` y `normalizeFeatures` no cambian (ninguna
  toca `"logo"` directamente) — sus tests existentes deben seguir en
  verde tal cual.
- `tests/format.test.ts` (existe, cubre `bs()`): migrar sus casos a
  `money(n, currency)`, agregando un caso con `currency` distinto de
  `"Bs"` (ej. `money(10, "S/")` → `"S/ 10.00"`).
- `tests/mis-trabajos-export.test.ts` usa `bs()` — actualizar su import y
  llamada a `money(n, "Bs")` (el test no depende de la moneda, solo del
  formato numérico).
- Verificación general: `npx tsc --noEmit` (clave para esta spec — el
  compilador señala cada sitio que aún llama `bs(n)` con un solo
  argumento tras el rename, así se detectan los 28 sitios sin
  perseguirlos a mano) + `npm test` + prueba manual: menú con Ajustes al
  final, subir un logo sin tener el addon "logo" (ya no existe),
  cambiar moneda a "S/" y verificar que un monto en Pagos y en un PDF de
  presupuesto muestre "S/".

## Fuera de alcance

- Conversión de tipo de cambio entre monedas.
- Formato numérico por locale (separador de miles/decimales).
- Campo de moneda de texto libre ("Otro") — se agrega una opción a la
  lista fija si hace falta.
- Migrar `clinics.logo_url` a `null` para limpiar datos viejos — se deja
  como está, sin uso desde la UI pero funcional como fallback.
