# Ficha del Paciente en Pestañas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar `app/(dashboard)/pacientes/[id]/page.tsx` (13 secciones apiladas en una sola columna) en 4 pestañas agrupadas por intención, con una cabecera fija (nombre, saldo, alertas médicas, alergias) que queda por encima de las pestañas — sin cambiar ninguna lógica de datos, permisos o addons.

**Architecture:** Reutilizar el componente genérico `SettingsTabs`/`SettingsTab` ya existente en `components/ui/SettingsTabs.tsx` (construido para la reorganización de `/ajustes` en la sesión anterior — no necesita modificarse, ya acepta `{id, label, content: ReactNode}[]`). Extraer las 13 secciones actuales en 4 fragmentos JSX (`historiaClinica`, `tratamiento`, `cuenta`, `documentos`), conservando cada guardia condicional (`perioEnabled && ...`, `canBilling && ...`, etc.) exactamente como está hoy. Ningún dato, query, tipo o server action cambia — es una reorganización puramente presentacional, igual que la de `ajustes/page.tsx`.

**Tech Stack:** Next.js App Router (server component), React, Tailwind CSS, TypeScript.

## Global Constraints

- No modificar `components/ui/SettingsTabs.tsx` — ya es genérico y reutilizable tal cual.
- No cambiar ninguna query a Supabase, ningún cálculo (`totalQuoted`, `totalPaid`, `works`, `apptRows`, etc.), ningún flag de permisos (`canClinical`, `canBilling`, `canEditClinical`, `canSeeHistory`, `canSeeCuentas`, `canDelete`) ni ningún flag de addon (`perioEnabled`, `fotosEnabled`, `recetasEnabled`, `consentimientosEnabled`, `odontogramaPediatricoEnabled`, `odontogramVoiceEnabled`).
- Cada sección debe conservar exactamente el mismo `<h2>` y el mismo componente/props que tiene hoy — solo cambia en qué fragmento vive.
- La cabecera (nombre, botones Imprimir/Editar/Eliminar, Nac./Tel./Nos conoció por/Saldo, alertas médicas, alergias) queda **fuera** de las pestañas, renderizada antes de `<SettingsTabs>` — igual patrón que `ajustes/page.tsx` con su `<h1>`.
- Pestaña por defecto: la primera del arreglo (`historia`), igual para todos los roles — `SettingsTabs` ya usa `useState(tabs[0]?.id)` sin lógica de rol, y no se le agrega ninguna.
- Agrupación exacta de las 4 pestañas:
  - **"Historia clínica"**: Antecedentes médicos, Preguntas adicionales de registro, Odontograma, Periodontograma (si `perioEnabled`).
  - **"Tratamiento"**: Plan de tratamiento, Seguimiento del tratamiento, Evolución del paciente, Visitas.
  - **"Cuenta"**: Cuenta del paciente (si `canBilling`).
  - **"Documentos"**: Fotos (si `fotosEnabled`), Recetas emitidas (si `recetasEnabled`), Consentimientos (si `consentimientosEnabled`).

---

### Task 1: Reorganizar `page.tsx` en 4 pestañas

**Files:**
- Modify: `app/(dashboard)/pacientes/[id]/page.tsx:414-685` (todo el bloque `return (...)` — nada antes de la línea 414 cambia)

**Interfaces:**
- Consumes: `SettingsTabs`, `type SettingsTab` desde `@/components/ui/SettingsTabs` (ya existen, sin cambios — `SettingsTab = { id: string; label: string; content: ReactNode }`, `SettingsTabs({ tabs }: { tabs: SettingsTab[] })`).
- Produces: nada nuevo — este es el único task del plan.

- [ ] **Step 1: Confirmar el baseline actual compila**

Antes de tocar nada, correr type-check para tener una línea base limpia:

```bash
npx tsc --noEmit -p .
```

Expected: sin errores (o solo los errores preexistentes no relacionados a este archivo, si los hay — anotarlos para no confundirlos después).

- [ ] **Step 2: Agregar el import de `SettingsTabs`**

En `app/(dashboard)/pacientes/[id]/page.tsx`, junto a los demás imports de componentes (después de la línea `import { CustomIntakeAnswers } from "@/components/patients/CustomIntakeAnswers";`), agregar:

```tsx
import { SettingsTabs, type SettingsTab } from "@/components/ui/SettingsTabs";
```

- [ ] **Step 3: Reemplazar el bloque `return (...)` completo**

Reemplazar exactamente el bloque que va desde `return (` (línea 414) hasta el `}` de cierre de la función (línea 685) por lo siguiente. Es el mismo JSX de las 13 secciones actuales, sin ningún cambio de lógica/props/condiciones — solo agrupado en 4 fragmentos y envuelto en `SettingsTabs`:

```tsx
  const historiaClinica = (
    <>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Antecedentes médicos</h2>
        <AnamnesisPanel
          patientId={patient.id}
          patientName={patient.full_name}
          patientPhone={patient.phone ?? null}
          clinicName={clinicName}
          invitation={invitation}
          anamnesis={parseAnamnesis((patient as { anamnesis_data?: unknown }).anamnesis_data)}
          allergies={patient.allergies ?? []}
          medicalAlerts={patient.medical_alerts ?? []}
          legacyAnamnesis={(() => { const v = (patient as { anamnesis?: unknown }).anamnesis; return typeof v === "string" ? v : v != null ? JSON.stringify(v) : null; })()}
          canEdit={canEditAnamnesis(profile?.role)}
        />
      </section>

      <CustomIntakeAnswers
        answers={((patient as { custom_intake_answers?: unknown }).custom_intake_answers as IntakeAnswerSnapshot[] | null) ?? []}
      />

      <section className="space-y-3">
        <h2 className="mb-3 text-lg font-semibold">Odontograma</h2>
        {odontogramaPediatricoEnabled ? (
          // Addon activo: un solo bloque con selector Adulto / Pediátrico para
          // no recargar la ficha con dos odontogramas apilados.
          <OdontogramTabs
            adult={
              <>
                <OdontogramEditor
                  patientId={patient.id}
                  initialTeeth={teeth}
                  canWrite={canEditClinical}
                  voiceEnabled={odontogramVoiceEnabled}
                />
                <OdontogramHistory events={odoEvents} canSeeHistory={canSeeHistory} />
              </>
            }
            pediatric={
              <>
                <OdontogramEditor
                  patientId={patient.id}
                  initialTeeth={teethPediatric}
                  canWrite={canEditClinical}
                  quadrants={PEDIATRIC_QUADRANTS}
                  quadrantNumbers={PEDIATRIC_QUADRANT_NUMBERS}
                  saveAction={savePediatricOdontogram}
                />
                <OdontogramHistory events={odoPedEvents} canSeeHistory={canSeeHistory} />
              </>
            }
          />
        ) : (
          <>
            <OdontogramEditor
              patientId={patient.id}
              initialTeeth={teeth}
              canWrite={canEditClinical}
              voiceEnabled={odontogramVoiceEnabled}
            />
            <OdontogramHistory events={odoEvents} canSeeHistory={canSeeHistory} />
          </>
        )}
      </section>

      {perioEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Periodontograma</h2>
          <PerioPanel
            patientId={patient.id}
            exams={perioExams}
            canWrite={canEditClinical}
            canDelete={profile?.role === "admin"}
          />
        </section>
      )}
    </>
  );

  const tratamiento = (
    <>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel patientId={patient.id} canWrite={canClinical} canDelete={profile?.role === "admin"} works={works} dentists={dentists ?? []} catalog={catalog} recetasEnabled={recetasEnabled} currency={currency} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seguimiento del tratamiento</h2>
        <WorkStatusPanel patientId={patient.id} canWrite={canClinical} works={works} currency={currency} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Evolución del paciente</h2>
        <EvolutionPanel
          patientId={patient.id}
          notes={(evolutionNotes ?? []).map((n) => ({
            id: n.id as string,
            author_id: (n.author_id as string | null) ?? null,
            author_name: platformAdminIdSet.has(n.author_id ?? "")
              ? "Sistema"
              : n.author_name as string,
            body: n.body as string,
            note_type: ((n.note_type as string) === "soap" ? "soap" : "free") as "free" | "soap",
            appointment_id: (n.appointment_id as string | null) ?? null,
            subjective: (n.subjective as string) ?? "",
            objective: (n.objective as string) ?? "",
            assessment: (n.assessment as string) ?? "",
            plan: (n.plan as string) ?? "",
            created_at: n.created_at as string,
            updated_at: n.updated_at as string,
          }))}
          history={(evolutionHistory ?? []).map((h) => ({
            id: h.id as string,
            note_id: h.note_id as string,
            author_name: platformAdminIdSet.has((h as { author_id?: string }).author_id ?? "")
              ? "Sistema"
              : h.author_name as string,
            body: h.body as string,
            note_type: (h.note_type as "free" | "soap" | null) ?? null,
            subjective: (h.subjective as string | null) ?? null,
            objective: (h.objective as string | null) ?? null,
            assessment: (h.assessment as string | null) ?? null,
            plan: (h.plan as string | null) ?? null,
            action: h.action as "edited" | "deleted",
            changed_at: h.changed_at as string,
          }))}
          legacyEvolution={(patient as { evolution?: string | null }).evolution ?? null}
          canWrite={canEditClinical}
          canSeeHistory={canSeeHistory}
          currentUserId={profile?.userId ?? ""}
          appointments={apptRows}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Visitas</h2>
        <VisitasPanel appointments={apptRows} />
      </section>
    </>
  );

  const cuenta = (
    <>
      {canBilling && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Cuenta del paciente</h2>
          <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex gap-8 text-sm">
              <div>
                <div className="text-xs text-slate-500">Total tratamiento</div>
                <div className="mt-0.5 font-semibold tabular-nums">{money(totalQuoted, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total pagado</div>
                <div className="mt-0.5 font-semibold tabular-nums text-emerald-600">{money(totalPaid, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Saldo pendiente</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${totalQuoted - totalPaid > 0 ? "text-red-600" : "text-slate-800"}`}>
                  {money(totalQuoted - totalPaid, currency)}
                </div>
              </div>
            </div>
            {canSeeCuentas && (
              <Link
                href={`/cuentas?p=${patient.id}`}
                className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg transition-colors"
              >
                Gestionar cuenta →
              </Link>
            )}
          </div>
        </section>
      )}
    </>
  );

  const documentos = (
    <>
      {fotosEnabled && (
        <section>
          <PhotosPanel
            patientId={patient.id}
            photos={photos}
            canManage={canEditClinical}
            configured={r2Ready}
            atLimit={clinicPhotoCount >= fotosQuota}
            clinicQuota={fotosQuota}
            // El número de fotos solo se revela a la clínica si tiene el addon
            // "Ver contador de fotos". El superadmin lo ve siempre desde su panel.
            clinicUsed={features.fotos_contador ? clinicPhotoCount : undefined}
            showCounter={features.fotos_contador}
          />
        </section>
      )}

      {recetasEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recetas emitidas</h2>
          <PrescriptionsPanel
            patientId={patient.id}
            prescriptions={prescriptionRows}
            canWrite={canClinical}
          />
        </section>
      )}

      {consentimientosEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Consentimientos</h2>
          <ConsentsPanel
            patientId={patient.id}
            patientName={patient.full_name}
            doctorName={profile?.fullName ?? ""}
            clinicName={clinicName}
            consents={consentRows}
            templates={consentTemplateList}
            appointments={consentAppts}
            canWrite={canClinical}
          />
        </section>
      )}
    </>
  );

  const tabs: SettingsTab[] = [
    { id: "historia", label: "Historia clínica", content: historiaClinica },
    { id: "tratamiento", label: "Tratamiento", content: tratamiento },
    { id: "cuenta", label: "Cuenta", content: cuenta },
    { id: "documentos", label: "Documentos", content: documentos },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold">{patient.full_name}</h1>
          <div className="flex items-start gap-2">
            {canEditClinical && (
              <Link
                href={`/pacientes/${patient.id}/expediente`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Imprimir expediente
              </Link>
            )}
            {/* Solo admin y doctores editan pacientes; recepcionista/asistente no ven el botón.
                Para doctores se omiten teléfono/email/dirección incluso del payload. */}
            {canEditClinical && (
              <EditPatientForm
                patient={
                  isDoctor
                    ? { ...patient, phone: null, email: null, address: null }
                    : patient
                }
                restricted={isDoctor}
              />
            )}
            {canDelete && (
              <DeletePatientButton
                patientId={patient.id}
                patientName={patient.full_name}
              />
            )}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {patient.dob && <span>Nac.: {patient.dob}</span>}
          {patient.phone && !hidePhone && <span>Tel.: {patient.phone}</span>}
          {patient.referral_source && (
            <span>
              Nos conoció por:{" "}
              {REFERRAL_SOURCE_LABEL[patient.referral_source] ?? patient.referral_source}
              {patient.referral_source === "otro" &&
                patient.referral_source_other &&
                ` (${patient.referral_source_other})`}
            </span>
          )}
          {canBilling && <span>Saldo: {money(totalQuoted - totalPaid, currency)}</span>}
        </div>
        {patient.medical_alerts?.length > 0 && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠ Alertas médicas: {patient.medical_alerts.join(", ")}
          </div>
        )}
        {patient.allergies?.length > 0 && (
          <div className="mt-2 text-sm text-amber-700">Alergias: {patient.allergies.join(", ")}</div>
        )}
      </header>

      <SettingsTabs tabs={tabs} />
    </div>
  );
}
```

- [ ] **Step 4: Correr el type-check**

```bash
npx tsc --noEmit -p .
```

Expected: mismo resultado que el Step 1 (sin errores nuevos introducidos por este cambio). Si aparece un error de tipo en `patient.referral_source` (indexado contra `REFERRAL_SOURCE_LABEL`) o similar, ya existía antes del cambio — no es de este task; si es nuevo, revisar que no se haya alterado ninguna variable usada en el JSX movido.

- [ ] **Step 5: Verificación manual en el navegador (dev server)**

Levantar el dev server y abrir la ficha de un paciente real (uno que tenga plan de tratamiento, fotos, y al menos un addon activo, para verificar las 4 pestañas con contenido):

```bash
npx next dev
```

Verificar en `http://localhost:3000/pacientes/<id>`:
1. La cabecera (nombre, saldo, alertas médicas, alergias, botones) se ve **antes** de las pestañas, no dentro de ninguna.
2. Las 4 pestañas aparecen: "Historia clínica", "Tratamiento", "Cuenta", "Documentos".
3. Por defecto se abre "Historia clínica".
4. Cada pestaña muestra las secciones esperadas según la tabla de Global Constraints, y las secciones con addon apagado (ej. periodontograma) simplemente no aparecen en su pestaña, sin romper el layout.
5. Si el usuario logueado no tiene `canBilling`, la pestaña "Cuenta" se ve vacía pero no rompe (esto es igual al comportamiento actual: la sección ya se ocultaba con `{canBilling && (...)}`, ahora solo cambia dónde vive).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/pacientes/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
refactor(pacientes): organizar la ficha del paciente en pestañas

La ficha había crecido a 13 secciones apiladas sin jerarquía. Se agrupan
en 4 pestañas (Historia clínica, Tratamiento, Cuenta, Documentos) vía el
SettingsTabs genérico ya construido para /ajustes, con la cabecera
(nombre, saldo, alertas médicas, alergias) siempre visible por encima.
Sin cambios de lógica, permisos ni addons — puramente presentacional.
EOF
)"
```

---

## Self-Review

**1. Spec coverage:** las 13 secciones originales están todas presentes en algún fragmento (`historiaClinica`: 4, `tratamiento`: 4, `cuenta`: 1, `documentos`: 3) más la cabecera fuera de pestañas — 13 secciones + cabecera, cubre el 100% del archivo original. ✅

**2. Placeholder scan:** no hay TBD/TODO, todo el JSX está completo y es literal del archivo actual, no hay "similar a Task N" (es un solo task). ✅

**3. Type consistency:** se reutilizan exactamente los mismos nombres de variables/props ya definidos antes del `return` original (`odontogramaPediatricoEnabled`, `perioEnabled`, `fotosEnabled`, `recetasEnabled`, `consentimientosEnabled`, `canBilling`, `canSeeCuentas`, `canEditClinical`, `canClinical`, `canSeeHistory`, `canDelete`, `isDoctor`, `hidePhone`, `profile`, `currency`, `works`, `apptRows`, `photos`, `clinicPhotoCount`, `fotosQuota`, `features`, `perioExams`, `teeth`, `teethPediatric`, `odoEvents`, `odoPedEvents`, `evolutionNotes`, `evolutionHistory`, `prescriptionRows`, `consentRows`, `consentTemplateList`, `consentAppts`, `clinicName`, `totalQuoted`, `totalPaid`, `catalog`, `dentists`, `invitation`) — ninguno se renombra, todos existen ya en el bloque de la línea 52-412 que no se toca. ✅ `SettingsTab`/`SettingsTabs` coinciden exactamente con la firma existente en `components/ui/SettingsTabs.tsx`. ✅
