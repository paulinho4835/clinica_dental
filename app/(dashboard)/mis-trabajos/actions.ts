"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { canSeeNav, isReceptionistLike } from "@/lib/rbac";
import { getClinicCurrency, getClinicFeatures } from "@/lib/superadmin";

export type ActionState = { error?: string; ok?: boolean; receiptId?: string };

const WorkSchema = z.object({
  patient_id: z.string().uuid({ message: "Selecciona un paciente registrado en el sistema." }),
  description: z.string().trim().min(1, "Describe el trabajo realizado."),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo."),
  commission_pct: z.coerce
    .number()
    .min(0, "El % no puede ser negativo.")
    .max(100, "El % no puede pasar de 100."),
  amount_paid: z.coerce.number().min(0, "El cobro no puede ser negativo."),
  payment_method: z.enum(["cash", "qr", "card"]).optional().nullable(),
  // Informativo: si al paciente se le entregó factura (no afecta montos).
  invoiced: z.enum(["true", "false"]).default("false"),
  issue_receipt: z.enum(["true", "false"]).default("false"),
  performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  notes: z.string().trim().max(300).optional().nullable(),
  lab_work: z.string().trim().max(200).optional().nullable(),
  lab_cost: z.coerce.number().min(0, "El costo de laboratorio no puede ser negativo.").default(0),
  treatment_lab_cost: z.coerce.number().min(0).default(0),
  doctor_id: z.string().uuid().optional().nullable(),
  collected_by_id: z.string().uuid().optional().nullable(),
  treatment_item_id: z.string().uuid().optional().nullable(),
});

export async function createDoctorWork(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canSeeNav(profile.role, "mis_trabajos"))
    return { error: "Sin permiso para registrar trabajos." };

  const isRecepcionista = isReceptionistLike(profile.role);
  // Admin y recepcionista registran trabajos en nombre de un doctor:
  // deben indicar a quién se le atribuye (la comisión es de ese doctor).
  const canPickDoctor = profile.role === "admin" || isRecepcionista;

  const parsed = WorkSchema.safeParse({
    patient_id: formData.get("patient_id") || null,
    description: formData.get("description"),
    cost: formData.get("cost") || 0,
    commission_pct: formData.get("commission_pct") || 0,
    amount_paid: formData.get("amount_paid") || 0,
    payment_method: formData.get("payment_method") || null,
    invoiced: formData.get("invoiced") || "false",
    issue_receipt: formData.get("issue_receipt") === "on" ? "true" : "false",
    performed_at: formData.get("performed_at"),
    notes: formData.get("notes") || null,
    lab_work: formData.get("lab_work") || null,
    lab_cost: formData.get("lab_cost") || 0,
    treatment_lab_cost: formData.get("treatment_lab_cost") || 0,
    doctor_id: formData.get("doctor_id") || null,
    collected_by_id: formData.get("collected_by_id") || null,
    treatment_item_id: formData.get("treatment_item_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  if (!d.treatment_item_id) {
    return { error: "Selecciona un tratamiento del plan antes de registrar el trabajo." };
  }
  if (d.issue_receipt === "true") {
    const features = await getClinicFeatures();
    if (!features.recibos_pago) return { error: "Los recibos de pago no están habilitados para esta clínica." };
    if (d.amount_paid <= 0) return { error: "Solo puedes emitir un recibo para un pago mayor a cero." };
  }

  // "Cobrado por" referencia clinic_receptionists (no profiles). Si no se
  // indicó recepcionista, queda null: NO se puede usar profile.userId (es un id
  // de profiles) porque violaría el FK doctor_works/payments_collected_by_id_fkey.
  const resolvedCollectedById = d.collected_by_id ?? null;

  const supabase = await createClient();
  const { data: patientRow } = await supabase
    .from("patients")
    .select("id, full_name, national_id")
    .eq("id", d.patient_id)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!patientRow)
    return { error: "Paciente no encontrado. Debe estar registrado en el módulo Pacientes antes de registrar un trabajo." };

  const { data: selectedItem, error: itemError } = await supabase
    .from("treatment_items")
    .select("id, clinic_id, treatment_phases!inner(treatment_plans!inner(patient_id, clinic_id))")
    .eq("id", d.treatment_item_id)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (itemError) return { error: itemError.message };

  const phaseRelation = selectedItem?.treatment_phases as
    | { treatment_plans?: { patient_id?: string; clinic_id?: string } | null }
    | null
    | undefined;
  const selectedPlan = phaseRelation?.treatment_plans;
  if (
    !selectedItem ||
    !selectedPlan ||
    selectedPlan.patient_id !== d.patient_id ||
    selectedPlan.clinic_id !== profile.clinicId
  ) {
    return { error: "El tratamiento seleccionado no pertenece a este paciente." };
  }

  const paymentMethod = d.amount_paid > 0 ? (d.payment_method ?? "cash") : null;
  let payment: { id: string } | null = null;
  let receiptId: string | undefined;
  let payError: { message: string } | null = null;

  const insertData = {
    patient_id: d.patient_id,
    description: d.description,
    cost: d.cost,
    commission_pct: d.commission_pct,
    amount_paid: d.amount_paid,
    payment_method: paymentMethod,
    invoiced: d.invoiced === "true",
    performed_at: d.performed_at,
    notes: d.notes ?? null,
    lab_work: d.lab_work ?? null,
    lab_cost: d.lab_cost ?? 0,
    treatment_lab_cost: d.treatment_lab_cost ?? 0,
    treatment_item_id: d.treatment_item_id ?? null,
    collected_by_id: resolvedCollectedById,
  };

  let actualDoctorId: string;
  let workId: string;

  if (canPickDoctor) {
    if (!d.doctor_id) return { error: "Selecciona el doctor que realizó el trabajo." };
    // Cliente normal con RLS (ya no service-role): la migración 0055 permite a la
    // recepcionista insertar trabajos de su clínica. La RLS de profiles ya escopa
    // por clínica, así que esta verificación solo encuentra doctores propios.
    const { data: doctorProfile } = await supabase
      .from("profiles")
      .select("clinic_id")
      .eq("id", d.doctor_id)
      .maybeSingle();
    if (!doctorProfile || doctorProfile.clinic_id !== profile.clinicId)
      return { error: "Doctor no encontrado en tu clínica." };
    actualDoctorId = d.doctor_id;
    const { data: work, error } = await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: d.doctor_id,
      ...insertData,
    }).select("id").single();
    if (error) return { error: error.message };
    workId = work.id as string;
  } else {
    actualDoctorId = profile.userId;
    const { data: work, error } = await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: profile.userId,
      ...insertData,
    }).select("id").single();
    if (error) return { error: error.message };
    workId = work.id as string;
  }

  // Si se cobró algo a un paciente registrado, reflejar también en payments
  // para que aparezca en el historial de pagos del paciente.
  // IMPORTANTE: verificar el error. Un insert fallido silencioso dejaría el
  // trabajo registrado pero el pago invisible en la ficha/cuentas del paciente.
  if (d.amount_paid > 0 && d.patient_id && paymentMethod) {
    ({ data: payment, error: payError } = await supabase.from("payments").insert({
      clinic_id: profile.clinicId,
      patient_id: d.patient_id,
      amount: d.amount_paid,
      method: paymentMethod,
      kind: "payment",
      doctor_id: actualDoctorId,
      commission_pct: d.commission_pct,
      note: d.description,
      collected_by_id: resolvedCollectedById,
      treatment_item_id: d.treatment_item_id ?? null,
    }).select("id").single());
    if (payError) {
      // No dejar un trabajo sin el cobro que el usuario acaba de registrar.
      await supabase.from("doctor_works").delete().eq("id", workId);
      return {
        error: `No se pudo registrar el cobro en la cuenta del paciente: ${payError.message}`,
      };
    }

    if (d.issue_receipt === "true") {
      const paymentId = payment?.id;
      if (!paymentId) return { error: "No se pudo obtener el pago para emitir el recibo." };
      const currency = await getClinicCurrency();
      const { data: receipt, error: receiptError } = await supabase
        .from("payment_receipts")
        .insert({
          clinic_id: profile.clinicId,
          payment_id: paymentId,
          patient_id: d.patient_id,
          patient_name: patientRow.full_name,
          patient_national_id: patientRow.national_id ?? null,
          description: d.description,
          amount: d.amount_paid,
          currency,
          payment_method: paymentMethod,
          created_by: profile.userId,
        })
        .select("id")
        .single();
      if (receiptError || !receipt) {
        await supabase.from("account_movements").delete()
          .eq("clinic_id", profile.clinicId).eq("ref_type", "payment").eq("ref_id", paymentId);
        await supabase.from("payments").delete().eq("id", paymentId);
        await supabase.from("doctor_works").delete().eq("id", workId);
        return { error: `No se pudo emitir el recibo: ${receiptError?.message ?? "error desconocido"}` };
      }
      receiptId = receipt.id as string;
    }
  }

  // Persistir el % de comisión en el catálogo si aún no tenía uno definido.
  // Así la próxima vez que se seleccione ese procedimiento se precarga solo.
  if (d.amount_paid > 0 && d.patient_id && paymentMethod) {
    const { error: linkError } = await supabase
      .from("doctor_works")
      .update({ payment_id: payment!.id })
      .eq("id", workId)
      .eq("clinic_id", profile.clinicId);
    if (linkError) {
      await supabase.from("account_movements").delete()
        .eq("clinic_id", profile.clinicId).eq("ref_type", "payment").eq("ref_id", payment!.id);
      await supabase.from("payments").delete().eq("id", payment!.id);
      return { error: "No se pudo vincular el cobro al trabajo. Intenta nuevamente." };
    }
  }

  if (d.treatment_item_id && d.commission_pct > 0) {
    try {
      const admin = createAdminClient();
      // Obtener el procedure_id del ítem del plan. El treatment_item_id viene del
      // formulario (cliente): acotar por clinic_id es OBLIGATORIO, si no un usuario
      // podría pasar el id de otra clínica y, abajo, escribirle el % de comisión a
      // un procedimiento ajeno (escritura cross-tenant con el cliente service-role).
      const { data: itemRow } = await admin
        .from("treatment_items")
        .select("procedure_id")
        .eq("id", d.treatment_item_id)
        .eq("clinic_id", profile.clinicId)
        .maybeSingle();
      if (itemRow?.procedure_id) {
        // Solo actualizar si el catálogo aún tiene 0 (primera vez que se usa).
        // Doble barrera: el update también se acota a la clínica propia.
        await admin
          .from("procedure_catalog")
          .update({ default_commission_pct: d.commission_pct })
          .eq("id", itemRow.procedure_id)
          .eq("clinic_id", profile.clinicId)
          .eq("default_commission_pct", 0);
      }
    } catch {
      // No bloquear el registro si esto falla.
    }
  }

  revalidatePath("/mis-trabajos");
  if (d.patient_id) revalidatePath(`/pacientes/${d.patient_id}`);
  return { ok: true, receiptId };
}

const EditSchema = z.object({
  description: z.string().trim().min(1, "Describe el trabajo realizado."),
  cost: z.coerce.number().min(0),
  commission_pct: z.coerce.number().min(0).max(100),
  amount_paid: z.coerce.number().min(0),
  payment_method: z.enum(["cash", "qr", "card"]).optional().nullable(),
  invoiced: z.enum(["true", "false"]).default("false"),
  performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  notes: z.string().trim().max(300).optional().nullable(),
  lab_work: z.string().trim().max(200).optional().nullable(),
  lab_cost: z.coerce.number().min(0).default(0),
  treatment_lab_cost: z.coerce.number().min(0).default(0),
});

export async function updateDoctorWork(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede editar trabajos." };

  const parsed = EditSchema.safeParse({
    description: formData.get("description"),
    cost: formData.get("cost") || 0,
    commission_pct: formData.get("commission_pct") || 0,
    amount_paid: formData.get("amount_paid") || 0,
    payment_method: formData.get("payment_method") || null,
    invoiced: formData.get("invoiced") || "false",
    performed_at: formData.get("performed_at"),
    notes: formData.get("notes") || null,
    lab_work: formData.get("lab_work") || null,
    lab_cost: formData.get("lab_cost") || 0,
    treatment_lab_cost: formData.get("treatment_lab_cost") || 0,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  const paymentMethod = d.amount_paid > 0 ? (d.payment_method ?? "cash") : null;

  const supabase = await createClient();
  const { data: work, error: readError } = await supabase
    .from("doctor_works")
    .select("payment_id, patient_id")
    .eq("id", id)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!work) return { error: "Trabajo no encontrado." };

  const workUpdate = {
    description: d.description,
    cost: d.cost,
    commission_pct: d.commission_pct,
    amount_paid: d.amount_paid,
    payment_method: paymentMethod,
    invoiced: d.invoiced === "true",
    performed_at: d.performed_at,
    notes: d.notes ?? null,
    lab_work: d.lab_work ?? null,
    lab_cost: d.lab_cost,
    treatment_lab_cost: d.treatment_lab_cost,
  };

  const { error } = await supabase
    .from("doctor_works")
    .update(workUpdate)
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);

  if (error) return { error: error.message };

  // Un trabajo ligado representa exactamente el mismo cobro. Mantener monto,
  // método y concepto alineados con la ficha del paciente y el estado de cuenta.
  if (work.payment_id) {
    const { error: paymentError } = await supabase
      .from("payments")
      .update({
        amount: d.amount_paid,
        method: paymentMethod ?? "cash",
        note: d.description,
        commission_pct: d.commission_pct,
      })
      .eq("id", work.payment_id)
      .eq("clinic_id", profile.clinicId);
    if (paymentError) return { error: paymentError.message };

    const { error: ledgerError } = await supabase
      .from("account_movements")
      .update({ amount: d.amount_paid })
      .eq("clinic_id", profile.clinicId)
      .eq("ref_type", "payment")
      .eq("ref_id", work.payment_id);
    if (ledgerError) console.error("account_movements update failed:", ledgerError.message);
  }

  revalidatePath("/mis-trabajos");
  if (work.patient_id) {
    revalidatePath(`/pacientes/${work.patient_id}`);
    revalidatePath("/cuentas");
  }
  return { ok: true };
}

export async function deleteDoctorWork(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo el administrador puede eliminar trabajos." };

  const supabase = await createClient();
  const { data: work, error: readError } = await supabase
    .from("doctor_works")
    .select("payment_id, patient_id")
    .eq("id", id)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!work) return { error: "Trabajo no encontrado." };

  if (work.payment_id) {
    await supabase.from("account_movements").delete()
      .eq("clinic_id", profile.clinicId)
      .eq("ref_type", "payment")
      .eq("ref_id", work.payment_id);
    // La FK ON DELETE CASCADE elimina el trabajo vinculado junto con el pago.
    const { error } = await supabase.from("payments").delete()
      .eq("id", work.payment_id)
      .eq("clinic_id", profile.clinicId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("doctor_works").delete().eq("id", id);
    if (error) return { error: error.message };
  }

  revalidatePath("/mis-trabajos");
  if (work.patient_id) {
    revalidatePath(`/pacientes/${work.patient_id}`);
    revalidatePath("/cuentas");
  }
  return { ok: true };
}
