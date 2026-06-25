# Diseño — Historial clínico del paciente

**Fecha:** 2026-06-25
**Estado:** Aprobado para Fase 1
**Entrega:** Fase 1 sola primero (anamnesis), luego Fase 2 y 3 en iteraciones separadas.

## Contexto

La ficha del paciente (`app/(dashboard)/pacientes/[id]/page.tsx`) ya contiene gran
parte de un historial clínico, pero disperso: odontograma + historial, plan de
tratamiento, seguimiento, **evolución del paciente** (notas firmadas con auditoría
de ediciones), visitas, cuenta/pagos, recetas y consentimientos. La tabla
`patients` tiene los campos `allergies`, `medical_alerts`, `anamnesis` (texto libre)
y `evolution` (texto libre legado).

Existe una tabla `patient_history` (migración 0009) con items por visita, pero está
**muerta**: la aplicación nunca la consulta. No se reutiliza ni se renombra (causaría
más confusión que valor); se deja como está.

El objetivo total son 3 piezas, secuenciadas porque dependen entre sí:

1. **Anamnesis estructurada** (esta entrega)
2. **Notas clínicas SOAP** — evolucionando el sistema de "Evolución" existente
3. **Expediente consolidado e imprimible**

Este documento especifica **Fase 1** en detalle y deja registradas las fases 2 y 3
como visión para no perder el norte.

---

## Fase 1 — Anamnesis estructurada (alcance de esta entrega)

### Objetivo

Reemplazar el campo de texto libre `anamnesis` por un cuestionario médico
estructurado, mostrado de forma prominente en la ficha, editable solo por roles
clínicos. El texto libre actual se conserva como "anamnesis histórica" de solo
lectura (mismo patrón ya usado con `evolution` → `patient_evolution_notes`).

### Datos

Nueva columna en `patients`:

```sql
alter table patients add column anamnesis_data jsonb;
```

- Se usa **JSONB** (no columnas fijas) porque el cuestionario médico cambia con el
  tiempo y no queremos una migración por cada pregunta nueva.
- El campo `anamnesis` (text) **se conserva** como lectura histórica; no se borra ni
  se migra automáticamente.
- `allergies` (text[]) y `medical_alerts` (text[]) **siguen siendo las columnas
  fuente de verdad** para alergias/alertas (la cabecera roja de la ficha ya las usa).
  El formulario de anamnesis las edita pero se persisten en sus columnas existentes,
  no dentro del JSONB, para no duplicar la fuente de verdad.

### Forma del JSONB (`anamnesis_data`)

```jsonc
{
  "antecedentes": {
    "diabetes": false,
    "hipertension": false,
    "cardiopatia": false,
    "coagulacion": false,
    "hepatitis": false,
    "vih": false,
    "asma": false,
    "epilepsia": false,
    "otros": ""            // texto libre
  },
  "medicacion_habitual": "",        // texto libre
  "antecedentes_familiares": "",    // texto libre
  "habitos": {
    "tabaco": false,
    "alcohol": false,
    "bruxismo": false
  },
  "embarazo": "no_aplica",          // "no_aplica" | "embarazada" | "lactancia"
  "ultima_visita_odontologica": "", // texto libre
  "motivo_consulta": "",            // texto libre
  "actualizado_por": "<nombre>",    // se setea en el server action
  "actualizado_en": "<ISO>"         // se setea en el server action
}
```

- El esquema vive en `lib/schemas/anamnesis.ts` (Zod) con un objeto `EMPTY_ANAMNESIS`
  por defecto. El componente normaliza `anamnesis_data ?? EMPTY_ANAMNESIS` para ser
  tolerante a fichas viejas (columna null) y a campos agregados en el futuro.
- Los checkboxes de antecedentes son una lista declarada en un solo lugar
  (`ANTECEDENTES_FIELDS`) para que UI, schema y futuras adiciones no se desincronicen.

### Permisos

- **Editar:** mismo criterio que el registro clínico actual (`canEditClinical` en la
  ficha): `admin`, `odontologo_general`, `especialista`, `colega`. La recepcionista
  **no** edita anamnesis (igual que no edita evolución/odontograma).
- **Ver:** cualquier miembro de la clínica que ya puede ver la ficha. RLS de
  `patients` (tenant isolation) ya cubre la lectura; la columna nueva no necesita
  política propia. La restricción de edición se aplica en el server action vía
  `can()` / rol, consistente con `updatePatient`.
- Respetar el addon `bloqueo_horario` igual que `updatePatient` (helper
  `clinicalLocked`): si está activo y fuera de horario, los no-admin no pueden guardar.

### Server action

Nuevo action en `app/(dashboard)/pacientes/actions.ts` (o un
`anamnesis-actions.ts` dedicado si conviene mantener `actions.ts` acotado):

```
updateAnamnesis(patientId, formData) -> { ok?: true; error?: string }
```

- Verifica sesión, rol clínico (admin/odontologo/especialista/colega) y
  `clinicalLocked`.
- Valida el payload con el schema Zod de `lib/schemas/anamnesis.ts`.
- Setea `actualizado_por` (nombre del profile) y `actualizado_en` (ISO) en el server,
  no desde el cliente.
- Persiste `anamnesis_data` (jsonb) y, si el formulario incluye alergias/alertas,
  también `allergies` / `medical_alerts` en sus columnas.
- `revalidatePath(\`/pacientes/${patientId}\`)`.

### UI

- Nuevo componente `components/patients/AnamnesisPanel.tsx` (client) + sección
  "Antecedentes médicos" cerca de la cabecera de la ficha, antes del odontograma.
- Modo lectura por defecto (resumen compacto: chips de condiciones marcadas, hábitos,
  embarazo, medicación). Botón "Editar antecedentes" solo si el rol puede editar
  → abre formulario (inline tipo `EditPatientForm`, usando primitivos de
  `components/ui/` y `useActionState`).
- Muestra "Actualizado por X · fecha" si existe.
- Si hay `anamnesis` (texto histórico) no vacío, mostrarlo como bloque colapsable de
  solo lectura "Anamnesis histórica (sin estructurar)", igual que la nota histórica
  de evolución.
- La ficha (`page.tsx`) carga `anamnesis_data` en su `select` y pasa props al panel.

### Testing

- Test unitario del schema/normalización en `lib/schemas/anamnesis.ts`
  (Vitest, en `tests/`): `EMPTY_ANAMNESIS` válido, parseo tolerante de objeto
  parcial, rechazo de tipos inválidos.
- Test del server action para el chequeo de permisos (recepcionista rechazada,
  rol clínico aceptado), siguiendo el patrón de `tests/rbac.test.ts`.

### No incluido en Fase 1 (YAGNI)

- Historial de versiones de la anamnesis (auditoría de cambios). La anamnesis es
  un estado actual, no un log; si se requiere auditoría se evalúa después.
- Migración automática del texto `anamnesis` a la estructura.
- Plantillas de anamnesis por especialidad.

---

## Fase 2 — Notas clínicas SOAP (visión, no en esta entrega)

Evolucionar `patient_evolution_notes` en vez de crear un sistema paralelo:

- Agregar `appointment_id uuid null` (vínculo opcional a la cita).
- Agregar estructura SOAP como 4 columnas de texto (`subjective`, `objective`,
  `assessment`, `plan`); mantener `body` para notas libres existentes
  (compatibilidad). Una nota nueva es SOAP **o** libre.
- Extender el trigger de `patient_evolution_note_history` para capturar los nuevos
  campos en la auditoría ya existente.
- Actualizar RLS de 0048 para incluir el rol `colega` (hoy solo admin/odontologo/
  especialista), coherente con `canEditClinical`.
- `EvolutionPanel` gana un toggle "Nota libre / SOAP" y un selector de cita.

## Fase 3 — Expediente consolidado e imprimible (visión, no en esta entrega)

- Ruta `app/(dashboard)/pacientes/[id]/historial/page.tsx` (server) que agrega:
  datos personales, anamnesis, alertas/alergias, snapshot del odontograma, plan de
  tratamiento, notas SOAP/evolución, recetas y consentimientos.
- Botón "Imprimir / PDF" con `window.print()` apoyado en el `@media print` ya
  configurado (fuerza tema claro).
- Acceso: roles clínicos + admin; el bloque financiero solo si `canBilling`.

---

## Resumen de archivos afectados (Fase 1)

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0058_patient_anamnesis_data.sql` | nueva columna `patients.anamnesis_data jsonb` |
| `lib/schemas/anamnesis.ts` | nuevo — schema Zod, `EMPTY_ANAMNESIS`, `ANTECEDENTES_FIELDS` |
| `app/(dashboard)/pacientes/actions.ts` (o `anamnesis-actions.ts`) | nuevo action `updateAnamnesis` |
| `components/patients/AnamnesisPanel.tsx` | nuevo — vista + formulario |
| `app/(dashboard)/pacientes/[id]/page.tsx` | cargar `anamnesis_data`, renderizar `AnamnesisPanel` |
| `tests/anamnesis.test.ts` | nuevo — schema + permisos |
