"use server";

// Datos de las pestañas "Tratamiento", "Cuenta" y "Documentos" de la ficha del
// paciente. Antes vivían en page.tsx y se consultaban TODAS por adelantado
// aunque el usuario solo mirara una pestaña (costo de CPU pagado por nada).
// Ahora cada una se pide bajo demanda, la primera vez que el usuario abre esa
// pestaña, vía los componentes Lazy*Tab (components/patients/lazy-tabs).

import { createClient } from "@/lib/supabase/server";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { getProfile } from "@/lib/auth";
import { can, canEditPlanItemName } from "@/lib/rbac";
import { getClinicCurrency } from "@/lib/superadmin";
import { normalizeFeatures, fotosEnabled as fotosFeatureEnabled, photoQuota } from "@/lib/features";
import { isR2Configured, presignDownload } from "@/lib/r2";
import { fetchPatientPlanItems } from "@/lib/treatments/planItems";
import { calculateTreatmentTotal, summarizePatientAccount } from "@/lib/patientAccount";
import type { Work, Dentist } from "@/components/treatments/TreatmentPlanPanel";
import type { ApptRow, WorkDebtRow } from "@/components/history/PatientHistoryPanel";
import type { PrescriptionRow, Medication } from "@/app/(dashboard)/pacientes/prescription-actions";
import type { ConsentRow } from "@/components/consents/ConsentsPanel";
import type { ConsentTemplate, ConsentAppointment } from "@/components/consents/ConsentModal";
import type { PhotoItem } from "@/components/patients/PhotosPanel";
import type { DoctorAccountRow } from "@/components/patients/DoctorAccountPanel";

async function loadPatientBase(patientId: string) {
  const supabase = await createClient();
  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name")
    .eq("id", patientId)
    .single();
  const profile = await getProfile();
  return { supabase, patient, profile };
}

export async function getTratamientoTabData(patientId: string) {
  const { supabase, patient, profile } = await loadPatientBase(patientId);
  if (!patient) return null;

  const platformAdminIds = await getPlatformAdminIds();
  const platformAdminIdSet = new Set(platformAdminIds);
  const canClinical = can(profile?.role, "clinical:write");
  const canEditClinical =
    profile?.role === "admin" ||
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista" ||
    profile?.role === "colega";
  const canSeeHistory = profile?.role === "admin";

  let dentistsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin", "colega"])
    .eq("clinic_id", patient.clinic_id)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    dentistsQuery = dentistsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  const [
    { data: rawPlans },
    { data: dentists },
    { data: clinicRow },
    { data: evolutionNotes },
    { data: evolutionHistory },
    { data: rawCatalog },
    { data: rawWorks },
    { data: appointments },
    currency,
  ] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "id, treatment_phases(treatment_items(id, price, status, custom_name, created_at, doctor_id, doctor:profiles!treatment_items_doctor_id_fkey(full_name), procedure:procedure_catalog(name)))",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    dentistsQuery,
    supabase.from("clinics").select("features").eq("id", patient.clinic_id).single(),
    supabase
      .from("patient_evolution_notes")
      .select(
        "id, author_id, author_name, body, note_type, appointment_id, subjective, objective, assessment, plan, created_at, updated_at",
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false }),
    supabase
      .from("patient_evolution_note_history")
      .select(
        "id, note_id, author_id, author_name, body, note_type, subjective, objective, assessment, plan, action, changed_at",
      )
      .eq("patient_id", patientId)
      .order("changed_at", { ascending: false }),
    supabase.from("procedure_catalog").select("id, name, base_price").eq("active", true).order("name"),
    supabase
      .from("doctor_works")
      .select(
        "id, description, cost, performed_at, treatment_item_id, doctor_id, doctor:profiles!doctor_works_doctor_id_fkey(full_name)",
      )
      .eq("patient_id", patientId)
      .order("performed_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, starts_at, dentist_name, reason, status")
      .eq("patient_id", patientId)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false }),
    getClinicCurrency(),
  ]);

  const catalog = (rawCatalog ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    base_price: Number(c.base_price),
  }));

  const works: Work[] = (rawPlans ?? [])
    .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
    .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
    .map((it) => ({
      id: it.id as string,
      name: ((it.procedure as { name?: string } | null)?.name ?? (it.custom_name as string)) || "—",
      price: Number(it.price),
      done: it.status === "done",
      createdAt: it.created_at as string,
      dentistId: (it.doctor_id as string | null) ?? null,
      dentistName: (it.doctor as { full_name?: string } | null)?.full_name ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const adHocWorkRows: WorkDebtRow[] = (rawWorks ?? [])
    .filter((w) => !w.treatment_item_id)
    .map((w) => ({
      id: w.id as string,
      description: w.description as string,
      cost: Number(w.cost),
      performedAt: w.performed_at as string,
      doctorName: (w.doctor as { full_name?: string } | null)?.full_name ?? null,
    }));

  const apptRows: ApptRow[] = (appointments ?? []).map((a) => ({
    id: a.id as string,
    startsAt: a.starts_at as string,
    dentistName: a.dentist_name as string | null,
    reason: a.reason as string | null,
    status: a.status as string,
  }));

  const features = normalizeFeatures((clinicRow as { features?: unknown } | null)?.features);

  return {
    works,
    dentists: (dentists ?? []) as Dentist[],
    catalog,
    recetasEnabled: features.recetas,
    currency,
    adHocWorkRows,
    apptRows,
    evolutionNotes: (evolutionNotes ?? []).map((n) => ({
      id: n.id as string,
      author_id: (n.author_id as string | null) ?? null,
      author_name: platformAdminIdSet.has(n.author_id ?? "") ? "Sistema" : (n.author_name as string),
      body: n.body as string,
      note_type: ((n.note_type as string) === "soap" ? "soap" : "free") as "free" | "soap",
      appointment_id: (n.appointment_id as string | null) ?? null,
      subjective: (n.subjective as string) ?? "",
      objective: (n.objective as string) ?? "",
      assessment: (n.assessment as string) ?? "",
      plan: (n.plan as string) ?? "",
      created_at: n.created_at as string,
      updated_at: n.updated_at as string,
    })),
    evolutionHistory: (evolutionHistory ?? []).map((h) => ({
      id: h.id as string,
      note_id: h.note_id as string,
      author_name: platformAdminIdSet.has((h as { author_id?: string }).author_id ?? "")
        ? "Sistema"
        : (h.author_name as string),
      body: h.body as string,
      note_type: (h.note_type as "free" | "soap" | null) ?? null,
      subjective: (h.subjective as string | null) ?? null,
      objective: (h.objective as string | null) ?? null,
      assessment: (h.assessment as string | null) ?? null,
      plan: (h.plan as string | null) ?? null,
      action: h.action as "edited" | "deleted",
      changed_at: h.changed_at as string,
    })),
    permissions: {
      canClinical,
      canEditClinical,
      canSeeHistory,
      canDelete: profile?.role === "admin",
      canEditPlanItemName: canEditPlanItemName(profile?.role),
      canEditPrice: profile?.role === "admin",
      currentUserId: profile?.userId ?? "",
    },
  };
}

export async function getCuentaTabData(patientId: string) {
  const { supabase, patient, profile } = await loadPatientBase(patientId);
  if (!patient) return null;

  const canBilling = can(profile?.role, "billing:write");
  const isDoctor =
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista" ||
    profile?.role === "colega";
  const currency = await getClinicCurrency();

  if (canBilling) {
    const [{ data: payments }, planItems, { data: historicalWorks }] = await Promise.all([
      supabase.from("payments").select("amount").eq("patient_id", patientId),
      fetchPatientPlanItems(supabase, patientId),
      supabase.from("doctor_works").select("cost").eq("patient_id", patientId).is("treatment_item_id", null),
    ]);
    const totalQuoted = calculateTreatmentTotal(planItems);
    const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const summary = summarizePatientAccount({
      planTotal: totalQuoted,
      paidTotal: totalPaid,
      historicalWorks: (historicalWorks ?? []).map((w) => ({ cost: Number(w.cost) })),
    });

    return {
      view: "billing" as const,
      currency,
      totalQuoted,
      totalPaid,
      historicalCount: summary.historicalCount,
      historicalReferenceTotal: summary.historicalReferenceTotal,
      isProvisional: summary.isProvisional,
      canRegularize: profile?.role === "admin",
    };
  }

  if (!isDoctor) return { view: "none" as const, currency };

  const [{ data: rawPlans }, { data: payments }, { data: rawWorks }] = await Promise.all([
    supabase
      .from("treatment_plans")
      .select(
        "treatment_phases(treatment_items(id, price, status, custom_name, doctor_id, procedure:procedure_catalog(name)))",
      )
      .eq("patient_id", patientId),
    supabase.from("payments").select("amount, received_at, treatment_item_id").eq("patient_id", patientId),
    supabase
      .from("doctor_works")
      .select("id, description, cost, amount_paid, performed_at, treatment_item_id, doctor_id")
      .eq("patient_id", patientId),
  ]);

  const paidByItem = new Map<string, { amount: number; count: number; last: string | null }>();
  for (const p of payments ?? []) {
    const itemId = (p as { treatment_item_id?: string | null }).treatment_item_id;
    if (!itemId) continue;
    const cur = paidByItem.get(itemId) ?? { amount: 0, count: 0, last: null };
    cur.amount += Number(p.amount);
    cur.count += 1;
    const at = (p as { received_at?: string }).received_at ?? null;
    if (at && (!cur.last || at > cur.last)) cur.last = at;
    paidByItem.set(itemId, cur);
  }

  const myWorkedItemIds = new Set(
    (rawWorks ?? [])
      .filter((w) => w.doctor_id === profile?.userId && w.treatment_item_id)
      .map((w) => w.treatment_item_id as string),
  );

  const doctorAccountRows: DoctorAccountRow[] = [
    ...(rawPlans ?? [])
      .flatMap((p) => (p.treatment_phases as Record<string, unknown>[]) ?? [])
      .flatMap((ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [])
      .filter((it) => (it.status as string) !== "cancelled")
      .filter(
        (it) =>
          (it.doctor_id as string | null) === profile?.userId || myWorkedItemIds.has(it.id as string),
      )
      .map((it) => {
        const p = paidByItem.get(it.id as string);
        return {
          id: it.id as string,
          name: ((it.procedure as { name?: string } | null)?.name ?? (it.custom_name as string)) || "—",
          price: Number(it.price),
          paid: p?.amount ?? 0,
          paymentsCount: p?.count ?? 0,
          lastPaymentAt: p?.last ?? null,
          done: (it.status as string) === "done",
          adHoc: false,
        };
      }),
    ...(rawWorks ?? [])
      .filter((w) => !w.treatment_item_id && w.doctor_id === profile?.userId)
      .map((w) => ({
        id: w.id as string,
        name: w.description as string,
        price: Number(w.cost),
        paid: Number((w as { amount_paid?: number }).amount_paid ?? 0),
        paymentsCount: null,
        lastPaymentAt: w.performed_at as string,
        done: true,
        adHoc: true,
      })),
  ];

  return { view: "doctor" as const, currency, doctorAccountRows };
}

export async function getDocumentosTabData(patientId: string) {
  const { supabase, patient, profile } = await loadPatientBase(patientId);
  if (!patient) return null;

  const canClinical = can(profile?.role, "clinical:write");
  const canEditClinical =
    profile?.role === "admin" ||
    profile?.role === "odontologo_general" ||
    profile?.role === "especialista" ||
    profile?.role === "colega";

  const [{ data: clinicRow }, { data: rawPrescriptions }, { data: rawConsents }, { data: consentTemplates }, { data: appointments }] =
    await Promise.all([
      supabase.from("clinics").select("features, name").eq("id", patient.clinic_id).single(),
      supabase
        .from("prescriptions")
        .select("id, medications, notes, issued_at, doctor:profiles(full_name)")
        .eq("patient_id", patientId)
        .order("issued_at", { ascending: false }),
      supabase
        .from("consents")
        .select("id, title, status, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false }),
      supabase.from("consent_templates").select("id, title, body").order("sort_order"),
      supabase
        .from("appointments")
        .select("id, starts_at, reason, status")
        .eq("patient_id", patientId)
        .neq("status", "cancelled")
        .order("starts_at", { ascending: false }),
    ]);

  const features = normalizeFeatures((clinicRow as { features?: unknown } | null)?.features);
  const fotosEnabled = fotosFeatureEnabled(features);
  const fotosQuota = photoQuota((clinicRow as { features?: unknown } | null)?.features);
  const r2Ready = isR2Configured();

  let photos: PhotoItem[] = [];
  let clinicPhotoCount = 0;
  if (fotosEnabled && r2Ready) {
    const { count: clinicCount } = await supabase
      .from("patient_photos")
      .select("id", { count: "exact", head: true })
      .eq("clinic_id", patient.clinic_id);
    clinicPhotoCount = clinicCount ?? 0;

    const { data: photoRows } = await supabase
      .from("patient_photos")
      .select("id, storage_key, kind, caption, created_at, uploader:uploaded_by(full_name)")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    photos = await Promise.all(
      (photoRows ?? []).map(async (p) => ({
        id: p.id as string,
        url: await presignDownload(p.storage_key as string),
        kind: (p.kind as string | null) ?? null,
        caption: (p.caption as string | null) ?? null,
        createdAt: p.created_at as string,
        uploaderName: (p.uploader as { full_name?: string } | null)?.full_name ?? null,
      })),
    );
  }

  const prescriptionRows: PrescriptionRow[] = (rawPrescriptions ?? []).map((rx) => ({
    id: rx.id as string,
    doctorName: (rx.doctor as { full_name?: string } | null)?.full_name ?? null,
    medications: rx.medications as Medication[],
    notes: rx.notes as string | null,
    issuedAt: rx.issued_at as string,
  }));

  const consentRows: ConsentRow[] = (rawConsents ?? []).map((c) => ({
    id: c.id as string,
    title: c.title as string,
    status: c.status as "pendiente" | "firmado",
    createdAt: c.created_at as string,
  }));

  const consentTemplateList: ConsentTemplate[] = (consentTemplates ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    body: t.body as string,
  }));

  const consentAppts: ConsentAppointment[] = (appointments ?? []).map((a) => ({
    id: a.id as string,
    startsAt: a.starts_at as string,
    reason: a.reason as string | null,
  }));

  return {
    fotosEnabled,
    r2Ready,
    fotosQuota,
    clinicPhotoCount,
    photos,
    showCounter: features.fotos_contador,
    canEditClinical,
    recetasEnabled: features.recetas,
    prescriptionRows,
    canClinical,
    consentimientosEnabled: features.consentimientos,
    consentRows,
    consentTemplateList,
    consentAppts,
    patientName: patient.full_name as string,
    clinicName: (clinicRow as { name?: string } | null)?.name ?? "",
    doctorName: profile?.fullName ?? "",
  };
}
