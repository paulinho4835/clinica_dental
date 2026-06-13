# Spec: Addon Consentimientos Informados

**Fecha:** 2026-06-13
**Estado:** Aprobado por usuario

---

## Resumen

Addon opt-in `consentimientos` que permite emitir, firmar y archivar consentimientos informados por paciente. Incluye plantillas de sistema predefinidas (8) que la clínica puede usar como base o complementar con plantillas propias. La firma puede ser digital (canvas HTML5) o física (impresión PDF con línea en blanco).

---

## Feature flag

- **FeatureKey:** `consentimientos`
- **Tipo:** `optIn: true` (apagado por defecto, activado desde superadmin)
- **Ícono en AddonToggle:** 📝
- **Label:** `"Consentimientos"`

Agregar en `lib/features.ts` y en `ICONS` de `components/superadmin/AddonToggle.tsx`.

---

## Base de datos

### Migración `0037_consents.sql`

#### Tabla `consent_templates`

```sql
create table consent_templates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid references clinics(id) on delete cascade,
  -- NULL = plantilla del sistema (compartida, sin clínica dueña)
  title       text not null,
  body        text not null,
  -- Placeholders soportados: {{nombre_paciente}}, {{fecha}}, {{doctor}}, {{clinica}}
  is_system   boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
```

RLS:
- SELECT: `clinic_id = auth.jwt() ->> 'clinic_id' OR clinic_id IS NULL`
- INSERT/UPDATE/DELETE: `clinic_id = auth.jwt() ->> 'clinic_id'` (solo las propias)

#### Tabla `consents`

```sql
create table consents (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references clinics(id) on delete cascade,
  patient_id      uuid not null references patients(id) on delete cascade,
  appointment_id  uuid references appointments(id) on delete set null,
  template_id     uuid references consent_templates(id) on delete set null,
  title           text not null,   -- snapshot del título al emitir
  body            text not null,   -- snapshot con placeholders reemplazados
  created_by      uuid references profiles(id) on delete set null,
  signature_data  text,            -- PNG base64 del canvas (nullable)
  signed_at       timestamptz,
  status          text not null default 'pendiente'
                  check (status in ('pendiente', 'firmado')),
  created_at      timestamptz not null default now()
);
```

RLS:
- SELECT/INSERT/UPDATE/DELETE: `clinic_id = auth.jwt() ->> 'clinic_id'`

#### Seed de plantillas de sistema

8 filas con `clinic_id = NULL, is_system = true`:
1. Extracción dental simple
2. Extracción de terceros molares (cordales)
3. Anestesia local
4. Endodoncia (tratamiento de conducto)
5. Implante dental
6. Blanqueamiento dental
7. Cirugía oral menor
8. Ortodoncia

Cada una con body completo en español neutro con los placeholders correspondientes.

---

## Arquitectura de archivos

```
supabase/migrations/
  0037_consents.sql

lib/features.ts                          — agregar 'consentimientos'

components/superadmin/AddonToggle.tsx    — agregar icono 📝

app/(dashboard)/pacientes/
  consent-actions.ts                     — server actions CRUD de consents

app/(dashboard)/ajustes/
  consent-template-actions.ts            — server actions CRUD de plantillas

components/consents/
  ConsentsPanel.tsx                      — lista de consentimientos del paciente
  ConsentModal.tsx                       — modal de creación con canvas
  SignaturePad.tsx                       — canvas HTML5 nativo (sin librerías)

components/ajustes/
  ConsentTemplatesPanel.tsx              — gestión de plantillas en ajustes

app/(dashboard)/pacientes/[id]/page.tsx  — agregar sección Consentimientos
app/(dashboard)/ajustes/page.tsx         — agregar ConsentTemplatesPanel

app/(print)/pacientes/[id]/consentimiento/[consentId]/
  page.tsx                               — página de impresión/PDF
```

---

## Flujo de usuario

### Emitir desde ficha del paciente

1. Abrir ficha del paciente → sección "Consentimientos" (visible solo si `features.consentimientos`)
2. Clic "Nuevo consentimiento" → abre `ConsentModal`
3. Seleccionar plantilla (dropdown con plantillas de sistema y propias, separadas visualmente)
4. Vista previa del texto con placeholders reemplazados (nombre, fecha, doctor, clínica)
5. Selector opcional de cita del paciente
6. Sección "Firma digital": botón "Firmar ahora" despliega `SignaturePad`; "Limpiar" borra el trazo
7. Botones de guardado:
   - **"Guardar sin firma"** → `status = 'pendiente'`
   - **"Guardar firmado"** (activo solo si hay trazo en canvas) → `status = 'firmado'`, guarda base64

### Lista de consentimientos

```
┌─ Consentimientos ─────────────────────────────── [+ Nuevo consentimiento] ─┐
│ 15/06/2026  Extracción dental     ● Firmado     [Ver PDF]  [✕]             │
│ 10/06/2026  Anestesia local       ● Pendiente   [Ver PDF]  [✕]             │
└────────────────────────────────────────────────────────────────────────────┘
```

- Badge verde = Firmado, badge amarillo = Pendiente
- "Ver PDF" abre `/pacientes/[id]/consentimiento/[consentId]` en nueva pestaña
- "✕" elimina (solo `canClinical`)
- Solo usuarios con `canClinical` ven el botón "Nuevo consentimiento"

### Gestión de plantillas (Ajustes)

Nueva sección "Plantillas de consentimiento" en `/ajustes`:

- **Plantillas del sistema**: listadas en solo lectura. Botón "Usar como base" duplica la plantilla con `clinic_id` de la clínica actual (permite editarla).
- **Plantillas de la clínica**: editables y eliminables.
- **"Nueva plantilla"**: campo título + textarea con ayuda de placeholders disponibles (`{{nombre_paciente}}`, `{{fecha}}`, `{{doctor}}`, `{{clinica}}`).

Solo admin puede gestionar plantillas.

---

## Página de impresión

Ruta: `/pacientes/[id]/consentimiento/[consentId]`

Estructura del documento:
1. **Encabezado**: nombre de clínica (+ logo, NIT, dirección, teléfono si `perfil` addon activo)
2. **Datos del paciente**: nombre completo, CI, teléfono
3. **Título** del consentimiento (grande, centrado)
4. **Cuerpo** del consentimiento (texto completo)
5. **Fecha de emisión**
6. **Firma**:
   - Si `status = 'firmado'`: imagen del canvas (`<img src={signature_data}`) + fecha de firma
   - Si `status = 'pendiente'`: línea en blanco + "Firma del paciente"
7. **Línea de firma del doctor** al pie

Mismo patrón que `/pacientes/[id]/imprimir`: auto-print script + botones no imprimibles.

---

## Server actions

### `consent-actions.ts`

```typescript
createConsent(fd: FormData): Promise<{ error?: string }>
// campos: patient_id, template_id?, title, body, appointment_id?, signature_data?, status

deleteConsent(id: string, patientId: string): Promise<{ error?: string }>
```

### `consent-template-actions.ts`

```typescript
createTemplate(fd: FormData): Promise<{ error?: string }>
updateTemplate(fd: FormData): Promise<{ error?: string }>
deleteTemplate(id: string): Promise<{ error?: string }>
forkTemplate(templateId: string): Promise<{ error?: string }>
// forkTemplate: duplica una plantilla de sistema con clinic_id de la clínica actual.
// El título de la copia recibe prefijo "(Copia) " para distinguirse de la original.
```

---

## SignaturePad (canvas HTML5 nativo)

Componente cliente `SignaturePad.tsx`:
- Canvas 400×160px con borde, fondo blanco
- Eventos `pointerdown / pointermove / pointerup` para capturar trazo (funciona en mouse y touch/tablet)
- `ref` expuesto con método `toDataURL(): string` (PNG base64) y `isEmpty(): boolean`
- `onClear` prop para resetear
- Sin dependencias externas

---

## Permisos

| Acción | Rol requerido |
|--------|--------------|
| Ver consentimientos del paciente | cualquier rol de la clínica |
| Crear / eliminar consentimiento | `canClinical` (`clinical:write`) |
| Gestionar plantillas | `admin` |
| Ver PDF | cualquier rol de la clínica |

---

## Restricciones y decisiones

- El body se guarda como **snapshot** al emitir: si la plantilla cambia después, el consentimiento histórico no se altera.
- `signature_data` es texto plano (base64 PNG). Una firma típica pesa ~20–40 KB. Con 5,000 consentimientos = ~200 MB máximo, dentro de los límites de Supabase.
- No se implementa edición de consentimientos ya emitidos. Para corregir: eliminar y volver a emitir.
- La sección de Consentimientos en la ficha del paciente solo aparece si `features.consentimientos === true`.
- La gestión de plantillas en Ajustes solo aparece si `features.consentimientos === true`.
