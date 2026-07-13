"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";

export type UnpaidWork = {
  id: string;
  description: string;
  patient_name: string | null;
  commission_amount: number;
  lab_commission_amount: number;
  // Abonos de comisión ya recibidos por este trabajo (adelantos parciales).
  // Restante = commission_amount + lab_commission_amount − commission_paid_amount.
  commission_paid_amount: number;
  performed_at: string;
  // Ítem del plan al que pertenece (para agrupar varias cuotas en una sola barra)
  planItemId: string | null;
  planItemName: string;
  // Progreso del pago del plan de tratamiento (fuente: tabla payments)
  planItemPrice: number;
  planItemPaid: number;
};

export async function fetchDoctorUnpaidWorks(doctorId: string): Promise<UnpaidWork[]> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return [];

  const admin = createAdminClient();

  // 1. Traer trabajos del doctor incluyendo treatment_item_id. NO filtramos por
  // commission_paid=false aquí: la comisión es proporcional a amount_paid, así
  // que puede saldarse por completo en un solo abono mientras el PACIENTE
  // recién empezó a pagar el tratamiento. Si filtráramos por comisión pendiente,
  // ese trabajo (y la barra de progreso del paciente) desaparecería del panel
  // aunque el paciente esté lejos de terminar de pagar. El filtro real
  // (comisión pendiente O paciente sin terminar de pagar) se aplica más abajo,
  // después de calcular planItemPrice/planItemPaid.
  const { data } = await admin
    .from("doctor_works")
    .select(
      "id, description, patient_name, commission_amount, lab_commission_amount, commission_paid_amount, commission_paid, performed_at, cost, amount_paid, treatment_item_id, patient_id, patients(full_name)",
    )
    .eq("clinic_id", profile.clinicId)
    .eq("doctor_id", doctorId)
    .order("performed_at", { ascending: false })
    .limit(500);

  const works = data ?? [];

  // 2. Obtener treatment_item_ids únicos para hacer join con payments y treatment_items
  const itemIds = [
    ...new Set(
      works
        .map((w) => w.treatment_item_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  // 3. Si hay plan items, buscar precio/nombre del ítem y total pagado
  let priceByItem = new Map<string, number>();
  let nameByItem = new Map<string, string>();
  let paidByItem = new Map<string, number>();

  if (itemIds.length > 0) {
    // Obtener patient_ids únicos para filtrar payments
    const patientIds = [
      ...new Set(
        works
          .map((w) => w.patient_id as string | null)
          .filter((id): id is string => !!id),
      ),
    ];

    const [{ data: itemRows }, { data: paymentRows }] = await Promise.all([
      admin
        .from("treatment_items")
        .select("id, price, custom_name, procedure:procedure_catalog(name)")
        .in("id", itemIds),
      patientIds.length > 0
        ? admin
            .from("payments")
            .select("treatment_item_id, amount")
            .in("treatment_item_id", itemIds)
            .in("patient_id", patientIds)
        : Promise.resolve({ data: [] }),
    ]);

    for (const row of itemRows ?? []) {
      priceByItem.set(row.id as string, Number(row.price));
      const procName = (row.procedure as { name?: string } | null)?.name;
      nameByItem.set(row.id as string, (procName ?? (row.custom_name as string)) || "");
    }
    for (const row of paymentRows ?? []) {
      const key = row.treatment_item_id as string;
      paidByItem.set(key, (paidByItem.get(key) ?? 0) + Number(row.amount));
    }
  }

  return works
    .filter((w) => {
      if (!w.commission_paid) return true; // comisión pendiente: siempre visible
      // Comisión ya saldada: mantener visible solo si el paciente no terminó
      // de pagar (así la barra de progreso no desaparece antes de tiempo).
      const itemId = w.treatment_item_id as string | null;
      const price = itemId ? (priceByItem.get(itemId) ?? Number(w.cost)) : Number(w.cost);
      const paid = itemId ? (paidByItem.get(itemId) ?? Number(w.amount_paid)) : Number(w.amount_paid);
      return paid < price - 0.005;
    })
    .map((w) => {
    const itemId = w.treatment_item_id as string | null;
    // Si el trabajo está vinculado a un plan, usar datos del plan
    // Si no, usar los datos propios del doctor_work como fallback
    const planItemPrice = itemId ? (priceByItem.get(itemId) ?? Number(w.cost)) : Number(w.cost);
    const planItemPaid = itemId ? (paidByItem.get(itemId) ?? Number(w.amount_paid)) : Number(w.amount_paid);

    return {
      id: w.id as string,
      description: w.description as string,
      patient_name:
        ((w.patients as { full_name?: string } | null)?.full_name ??
          (w.patient_name as string | null)) || null,
      commission_amount: Number(w.commission_amount),
      lab_commission_amount: Number(w.lab_commission_amount),
      commission_paid_amount: Number(w.commission_paid_amount ?? 0),
      performed_at: w.performed_at as string,
      planItemId: itemId,
      planItemName: itemId ? (nameByItem.get(itemId) || (w.description as string)) : (w.description as string),
      planItemPrice,
      planItemPaid,
    };
  });
}
