"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { normalizeFeatures } from "@/lib/features";
import { buildReminderRows, cancelPendingReminders } from "@/lib/reminders";
import { getClinicFeatures } from "@/lib/superadmin";
import { boliviaTodayISO, boliviaDateISO, BOLIVIA_TZ } from "@/lib/format";
import { mapAvailabilityRow, type AvailabilityBlock } from "@/lib/availability";
import { freeSlotsForDay, formatFreeSlotsMessage } from "@/lib/freeSlots";
import { syncAppointmentToGoogle } from "@/lib/google-calendar/sync";

export type ActionState = { error?: string; ok?: boolean };

const DEFAULT_DURATION_MIN = 30;

const ApptSchema = z
  .object({
    patient_id: z.string().uuid("Paciente inválido").optional().nullable(),
    patient_name: z.string().trim().min(1).optional().nullable(),
    dentist_name: z.string().trim().min(1, "Odontólogo requerido"),
    // Fuente de verdad del odontólogo (cuando se eligió del select de doctores).
    // Si llega vacío (doctor escrito a mano / Vapi), se opera solo por nombre.
    dentist_id: z.string().uuid().optional().nullable(),
    starts_at: z.string().min(1, "Fecha requerida"),
    ends_at: z.string().optional().nullable(),
    reason: z.string().optional().nullable(),
    overbooked: z.boolean().default(false),
    // Capa financiera (opcional). Saldo = consult_price - deposit (calculado).
    consult_price: z.coerce.number().min(0, "Precio inválido").default(0),
    deposit: z.coerce.number().min(0, "Adelanto inválido").default(0),
    deposit_method: z.enum(["cash", "qr", "card"]).optional().nullable(),
  })
  // Paciente registrado O nombre suelto (consulta rápida).
  .refine((d) => !!d.patient_id || !!d.patient_name, {
    message: "Indica un paciente: elige uno registrado o escribe el nombre.",
    path: ["patient_id"],
  });

// Resuelve el odontólogo de una cita. Si llega `dentistId`, se valida que el
// perfil exista y pertenezca a la clínica; en ese caso es la fuente de verdad y
// se devuelve su nombre actual (denormalizado en la cita para display/Vapi). Si
// el id es inválido, de otra clínica, o no llega, se opera solo por nombre.
async function resolveDentist(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clinicId: string,
  dentistId: string | null,
  dentistName: string,
): Promise<{ dentistId: string | null; dentistName: string }> {
  if (!dentistId) return { dentistId: null, dentistName };
  const { data: doc } = await supabase
    .from("profiles")
    .select("full_name, clinic_id")
    .eq("id", dentistId)
    .maybeSingle();
  if (!doc || doc.clinic_id !== clinicId) {
    return { dentistId: null, dentistName }; // id inválido o de otra clínica
  }
  return { dentistId, dentistName: doc.full_name ?? dentistName };
}

export async function createAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write"))
    return { error: "Sin permiso para agendar." };

  const parsed = ApptSchema.safeParse({
    patient_id: formData.get("patient_id") || null,
    patient_name: formData.get("patient_name") || null,
    dentist_name: formData.get("dentist_name"),
    dentist_id: formData.get("dentist_id") || null,
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at") || null,
    reason: formData.get("reason") || null,
    overbooked: formData.get("overbooked") === "on",
    consult_price: formData.get("consult_price") || 0,
    deposit: formData.get("deposit") || 0,
    deposit_method: formData.get("deposit_method") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const starts = new Date(parsed.data.starts_at);
  // Fin personalizado; si no llega, se usa la duración por defecto.
  const ends = parsed.data.ends_at
    ? new Date(parsed.data.ends_at)
    : new Date(starts.getTime() + DEFAULT_DURATION_MIN * 60_000);
  if (ends <= starts) return { error: "La hora de fin debe ser posterior al inicio." };

  const supabase = await createClient();

  // Resuelve el odontólogo: si llega dentist_id, es la fuente de verdad (se
  // verifica que pertenezca a la clínica y se toma su nombre actual). Si no, se
  // opera solo por nombre (doctor escrito a mano / creación vía Vapi).
  const { dentistId, dentistName } = await resolveDentist(
    supabase, profile.clinicId, parsed.data.dentist_id ?? null, parsed.data.dentist_name,
  );

  // Choque con otra cita del mismo día (salvo sobre-cupo explícito).
  if (!parsed.data.overbooked) {
    const dayStart = new Date(starts);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    let clashQuery = supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .neq("status", "cancelled");
    // Mismo odontólogo: por id si lo hay (robusto a homónimos), si no por nombre.
    clashQuery = dentistId
      ? clashQuery.eq("dentist_id", dentistId)
      : clashQuery.eq("dentist_name", dentistName);
    const { data: clash } = await clashQuery;
    const overlaps = (clash ?? []).some((c) => {
      const cs = new Date(c.starts_at).getTime();
      const ce = c.ends_at ? new Date(c.ends_at).getTime() : cs + DEFAULT_DURATION_MIN * 60_000;
      return starts.getTime() < ce && ends.getTime() > cs;
    });
    if (overlaps)
      return { error: "Ese doctor ya tiene una cita en ese horario. Marca sobre-cupo si es a propósito." };
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .insert({
      clinic_id: profile.clinicId,
      patient_id: parsed.data.patient_id ?? null,
      patient_name: parsed.data.patient_id ? null : parsed.data.patient_name,
      dentist_name: dentistName,
      dentist_id: dentistId,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      reason: parsed.data.reason,
      overbooked: parsed.data.overbooked,
      consult_price: parsed.data.consult_price,
      deposit: parsed.data.deposit,
      deposit_method: parsed.data.deposit > 0 ? parsed.data.deposit_method ?? "cash" : null,
    })
    .select("id")
    .single();
  if (error || !appt) return { error: error?.message ?? "No se pudo agendar." };

  // Recordatorios automáticos: solo si el addon está activo y hay paciente registrado.
  if (parsed.data.patient_id) {
    const { data: clinicRow } = await supabase
      .from("clinics")
      .select("features, settings")
      .eq("id", profile.clinicId)
      .single();

    if (normalizeFeatures(clinicRow?.features).recordatorios) {
      const settings = (clinicRow?.settings ?? {}) as Record<string, unknown>;
      const rows = buildReminderRows(profile.clinicId, appt.id, starts, settings);
      if (rows.length > 0) {
        await supabase.from("appointment_reminders").insert(rows);
      }
    }
  }

  await syncAppointmentToGoogle(appt.id, "create");

  revalidatePath("/agenda");
  return { ok: true };
}

// Edita una cita existente. Reusa el mismo esquema/validación que la creación.
// Conserva el estado actual (no lo toca) y vuelve a chequear choques de horario,
// excluyendo la propia cita.
export async function updateAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write"))
    return { error: "Sin permiso para editar." };

  const appointmentId = String(formData.get("appointment_id") ?? "");
  if (!appointmentId) return { error: "Cita inválida." };

  const parsed = ApptSchema.safeParse({
    patient_id: formData.get("patient_id") || null,
    patient_name: formData.get("patient_name") || null,
    dentist_name: formData.get("dentist_name"),
    dentist_id: formData.get("dentist_id") || null,
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at") || null,
    reason: formData.get("reason") || null,
    overbooked: formData.get("overbooked") === "on",
    consult_price: formData.get("consult_price") || 0,
    deposit: formData.get("deposit") || 0,
    deposit_method: formData.get("deposit_method") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const starts = new Date(parsed.data.starts_at);
  const ends = parsed.data.ends_at
    ? new Date(parsed.data.ends_at)
    : new Date(starts.getTime() + DEFAULT_DURATION_MIN * 60_000);
  if (ends <= starts) return { error: "La hora de fin debe ser posterior al inicio." };

  const supabase = await createClient();

  const { dentistId, dentistName } = await resolveDentist(
    supabase, profile.clinicId, parsed.data.dentist_id ?? null, parsed.data.dentist_name,
  );

  // Choque con otra cita del mismo día (excluye la propia y los cancelados).
  if (!parsed.data.overbooked) {
    const dayStart = new Date(starts);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    let clashQuery = supabase
      .from("appointments")
      .select("id, starts_at, ends_at")
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .neq("status", "cancelled")
      .neq("id", appointmentId);
    clashQuery = dentistId
      ? clashQuery.eq("dentist_id", dentistId)
      : clashQuery.eq("dentist_name", dentistName);
    const { data: clash } = await clashQuery;
    const overlaps = (clash ?? []).some((c) => {
      const cs = new Date(c.starts_at).getTime();
      const ce = c.ends_at ? new Date(c.ends_at).getTime() : cs + DEFAULT_DURATION_MIN * 60_000;
      return starts.getTime() < ce && ends.getTime() > cs;
    });
    if (overlaps)
      return { error: "Ese doctor ya tiene una cita en ese horario. Marca sobre-cupo si es a propósito." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      patient_id: parsed.data.patient_id ?? null,
      patient_name: parsed.data.patient_id ? null : parsed.data.patient_name,
      dentist_name: dentistName,
      dentist_id: dentistId,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      reason: parsed.data.reason,
      overbooked: parsed.data.overbooked,
      consult_price: parsed.data.consult_price,
      deposit: parsed.data.deposit,
      deposit_method: parsed.data.deposit > 0 ? parsed.data.deposit_method ?? "cash" : null,
    })
    .eq("id", appointmentId); // RLS limita a la clínica del usuario
  if (error) return { error: error.message };

  // Si el paciente está registrado y el addon activo, reinsertar reminders con la nueva hora.
  if (parsed.data.patient_id) {
    const { data: clinicRow } = await supabase
      .from("clinics")
      .select("features, settings")
      .eq("id", profile.clinicId)
      .single();

    if (normalizeFeatures(clinicRow?.features).recordatorios) {
      await cancelPendingReminders(supabase, appointmentId);
      const settings = (clinicRow?.settings ?? {}) as Record<string, unknown>;
      const rows = buildReminderRows(profile.clinicId, appointmentId, starts, settings);
      if (rows.length > 0) {
        await supabase.from("appointment_reminders").insert(rows);
      }
    }
  }

  await syncAppointmentToGoogle(appointmentId, "update");

  revalidatePath("/agenda");
  return { ok: true };
}

// Cancela una cita (status -> 'cancelled'). Conserva el registro para historial;
// la agenda ya filtra los cancelados, así que desaparece de la vista.
export async function cancelAppointment(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) return { error: error.message };

  await cancelPendingReminders(supabase, id);
  await syncAppointmentToGoogle(id, "cancel");

  revalidatePath("/agenda");
  return { ok: true };
}

const STATUSES = [
  "scheduled", "confirmed", "waiting", "in_chair", "finished", "cancelled", "no_show",
] as const;

export async function setAppointmentStatus(id: string, status: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write"))
    return { error: "Sin permiso." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { error: "Estado inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id); // RLS limita a la clínica del usuario
  if (error) return { error: error.message };

  // Al marcar la cita como atendida, los datos financieros migran al historial.
  if (status === "finished") {
    await migrateAppointmentFinance(id, profile);
  }
  if (status === "cancelled") {
    await syncAppointmentToGoogle(id, "cancel");
  }

  revalidatePath("/agenda");
  return { ok: true };
}

// Reprograma una cita (drag & drop en la agenda). Solo mueve fecha/hora; no
// toca paciente, estado ni datos financieros. La hora llega como reloj de pared
// boliviano (sin zona); Bolivia es UTC-4 fijo, así que le anclamos ese offset
// antes de guardar en UTC.
function boliviaNaiveToUTC(s: string): string {
  const naive = s.replace(/(\.\d+)?Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
  return new Date(`${naive}-04:00`).toISOString();
}

export async function rescheduleAppointment(
  id: string,
  startsAt: string,
  endsAt: string | null,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write")) return { error: "Sin permiso." };
  if (!id || !startsAt) return { error: "Cita inválida." };

  const startsUTC = boliviaNaiveToUTC(startsAt);
  const endsUTC = endsAt
    ? boliviaNaiveToUTC(endsAt)
    : new Date(new Date(startsUTC).getTime() + DEFAULT_DURATION_MIN * 60_000).toISOString();

  const supabase = await createClient();
  const { error } = await supabase
    .from("appointments")
    .update({ starts_at: startsUTC, ends_at: endsUTC })
    .eq("id", id); // RLS limita a la clínica del usuario
  if (error) return { error: error.message };

  // Reinsertar reminders con la nueva hora si el addon está activo.
  const { data: apptRow } = await supabase
    .from("appointments")
    .select("patient_id, clinics(features, settings)")
    .eq("id", id)
    .single();

  const patientId = apptRow?.patient_id;
  const clinicData = apptRow?.clinics as { features?: unknown; settings?: unknown } | null;

  if (patientId && normalizeFeatures(clinicData?.features).recordatorios) {
    await cancelPendingReminders(supabase, id);
    const settings = (clinicData?.settings ?? {}) as Record<string, unknown>;
    const rows = buildReminderRows(profile.clinicId, id, new Date(startsUTC), settings);
    if (rows.length > 0) {
      await supabase.from("appointment_reminders").insert(rows);
    }
  }

  await syncAppointmentToGoogle(id, "update");

  revalidatePath("/agenda");
  return { ok: true };
}

// Elimina una cita. Los recordatorios asociados caen por FK on delete cascade.
export async function deleteAppointment(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  await syncAppointmentToGoogle(id, "delete"); // antes del delete: la lee por id

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/agenda");
  return { ok: true };
}

// Vincula una cita de consulta rápida a un paciente ya registrado.
// El dinero (cotización + adelanto) deja de estar suelto y, si la cita ya fue
// atendida, migra al expediente clínico de inmediato.
export async function linkAppointmentPatient(
  appointmentId: string,
  patientId: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "appointments:write")) return { error: "Sin permiso." };

  const supabase = await createClient();
  const { data: appt, error } = await supabase
    .from("appointments")
    .update({ patient_id: patientId, patient_name: null })
    .eq("id", appointmentId)
    .select("status")
    .single();
  if (error || !appt) return { error: error?.message ?? "No se pudo vincular." };

  if (appt.status === "finished") {
    await migrateAppointmentFinance(appointmentId, profile);
  }

  revalidatePath("/agenda");
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

type Profile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

// Migra la cotización y el adelanto de una cita al historial del paciente:
//   • cotización  -> treatment_item (trabajo del plan)  -> suma a "Total tratamiento"
//   • adelanto    -> payments (kind 'payment')           -> suma a "Total pagado"
// El trigger payment_to_ledger recalcula el saldo de cuenta. Idempotente vía
// la bandera finance_migrated.
async function migrateAppointmentFinance(appointmentId: string, profile: Profile): Promise<void> {
  const supabase = await createClient();

  const { data: appt } = await supabase
    .from("appointments")
    .select("patient_id, reason, consult_price, deposit, deposit_method, finance_migrated")
    .eq("id", appointmentId)
    .single();

  if (!appt || !appt.patient_id || appt.finance_migrated) return;
  const price = Number(appt.consult_price ?? 0);
  const deposit = Number(appt.deposit ?? 0);
  if (price <= 0 && deposit <= 0) return;
  let treatmentItemId: string | undefined;

  // 1) Cotización -> trabajo en el plan (crea plan + fase si no existen).
  if (price > 0 || deposit > 0) {
    let planId: string | undefined;
    const { data: plan } = await supabase
      .from("treatment_plans")
      .select("id")
      .eq("patient_id", appt.patient_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    planId = plan?.id;
    if (!planId) {
      const { data: newPlan } = await supabase
        .from("treatment_plans")
        .insert({
          clinic_id: profile.clinicId,
          patient_id: appt.patient_id,
          status: "active",
          created_by: profile.userId,
        })
        .select("id")
        .single();
      planId = newPlan?.id;
    }

    let phaseId: string | undefined;
    if (planId) {
      const { data: phase } = await supabase
        .from("treatment_phases")
        .select("id")
        .eq("plan_id", planId)
        .order("phase_no", { ascending: true })
        .limit(1)
        .maybeSingle();
      phaseId = phase?.id;
      if (!phaseId) {
        const { data: newPhase } = await supabase
          .from("treatment_phases")
          .insert({ clinic_id: profile.clinicId, plan_id: planId, phase_no: 1, title: "General" })
          .select("id")
          .single();
        phaseId = newPhase?.id;
      }
    }

    if (phaseId) {
      const { data: treatmentItem } = await supabase.from("treatment_items").insert({
        clinic_id: profile.clinicId,
        phase_id: phaseId,
        custom_name: appt.reason?.trim() || "Consulta / cotización inicial",
        price: price > 0 ? price : deposit,
        status: price > 0 ? "done" : "active",
        done_at: price > 0 ? new Date().toISOString() : null,
      }).select("id").single();
      treatmentItemId = treatmentItem?.id as string | undefined;
    }
  }

  // 2) Adelanto -> pago real del paciente.
  if (deposit > 0) {
    if (!treatmentItemId) return;
    const { error: paymentError } = await supabase.from("payments").insert({
      clinic_id: profile.clinicId,
      patient_id: appt.patient_id,
      amount: deposit,
      method: appt.deposit_method ?? "cash",
      kind: "payment",
      treatment_item_id: treatmentItemId,
    });
    if (paymentError) return;
  }

  // 3) Marca como migrado para no duplicar.
  await supabase.from("appointments").update({ finance_migrated: true }).eq("id", appointmentId);

  revalidatePath(`/pacientes/${appt.patient_id}`);

}

const FREE_SLOTS_ROLES = new Set(["admin", "recepcionista"]);

// Próximos N días (fecha ISO + etiqueta "Lunes 13" en español), anclados a
// las 12:00 hora Bolivia para no cruzar de día por redondeo/DST (mismo
// patrón que upcomingDays() en lib/agent/runAgent.ts). El día del mes se
// toma del propio dateISO (no de Date.getDate(), que usaría el huso del
// servidor) para que la etiqueta nunca se corra un día.
function upcomingDaysWithLabel(count: number): { dateISO: string; label: string }[] {
  const todayISO = boliviaTodayISO();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(`${todayISO}T12:00:00-04:00`);
    d.setDate(d.getDate() + i);
    const dateISO = d.toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
    const weekday = d.toLocaleDateString("es-BO", { timeZone: BOLIVIA_TZ, weekday: "long" });
    const dayNum = Number(dateISO.split("-")[2]);
    const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${dayNum}`;
    return { dateISO, label };
  });
}

// Texto de horarios libres de un doctor en los próximos N días, listo para
// copiar y pegar en WhatsApp (feature "Horarios libres", addon
// "disponibilidad"). Mismo cálculo que check_availability del agente de IA
// (lib/agent/tools.ts), expuesto para admin/recepción vía un botón en la
// Agenda en vez de tener que copiar horarios a mano de la grilla.
export async function getFreeSlotsText(
  dentistId: string,
  days: 3 | 5 | 7,
): Promise<{ text: string } | { error: string }> {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile || !FREE_SLOTS_ROLES.has(profile.role)) return { error: "Sin permisos." };
  if (!features.disponibilidad)
    return { error: "El módulo de disponibilidad no está habilitado." };

  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", dentistId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!doc) return { error: "Doctor no encontrado." };
  const dentistName = doc.full_name;

  const daySpec = upcomingDaysWithLabel(days);
  const startISO = daySpec[0].dateISO;
  const endISO = daySpec[daySpec.length - 1].dateISO;

  const [{ data: appts }, { data: availRows }] = await Promise.all([
    supabase
      .from("appointments")
      .select("starts_at, ends_at")
      .eq("clinic_id", profile.clinicId)
      .eq("dentist_name", dentistName)
      .gte("starts_at", `${startISO}T00:00:00-04:00`)
      .lte("starts_at", `${endISO}T23:59:59-04:00`)
      .not("status", "in", "(cancelled,no_show)"),
    supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles!doctor_availability_dentist_id_fkey(full_name)",
      )
      .eq("clinic_id", profile.clinicId)
      .or(`weekday.not.is.null,and(date_from.lte.${endISO},date_to.gte.${startISO})`),
  ]);

  const bookedByDay = new Map<string, { start: number; end: number }[]>();
  for (const a of appts ?? []) {
    const dayISO = boliviaDateISO(new Date(a.starts_at));
    const start = new Date(a.starts_at).getTime();
    const end = a.ends_at ? new Date(a.ends_at).getTime() : start + 60 * 60 * 1000;
    const list = bookedByDay.get(dayISO) ?? [];
    list.push({ start, end });
    bookedByDay.set(dayISO, list);
  }

  const availability: AvailabilityBlock[] = (availRows ?? []).map(mapAvailabilityRow);

  const dayResults = daySpec.map(({ dateISO, label }) => ({
    dateISO,
    label,
    slots: freeSlotsForDay(dateISO, bookedByDay.get(dateISO) ?? [], availability, dentistName),
  }));

  return { text: formatFreeSlotsMessage(dayResults) };
}
