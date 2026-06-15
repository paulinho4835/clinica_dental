"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";

export type UnpaidWork = {
  id: string;
  description: string;
  patient_name: string | null;
  commission_amount: number;
  lab_commission_amount: number;
  performed_at: string;
  // Progreso del pago del plan de tratamiento (fuente: tabla payments)
  planItemPrice: number;
  planItemPaid: number;
};

export async function fetchDoctorUnpaidWorks(doctorId: string): Promise<UnpaidWork[]> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return [];

  const admin = createAdminClient();

  // 1. Traer trabajos pendientes de comisión incluyendo treatment_item_id
  const { data } = await admin
    .from("doctor_works")
    .select(
      "id, description, patient_name, commission_amount, lab_commission_amount, performed_at, cost, amount_paid, treatment_item_id, patient_id",
    )
    .eq("clinic_id", profile.clinicId)
    .eq("doctor_id", doctorId)
    .eq("commission_paid", false)
    .order("performed_at", { ascending: false });

  const works = data ?? [];

  // 2. Obtener treatment_item_ids únicos para hacer join con payments y treatment_items
  const itemIds = [
    ...new Set(
      works
        .map((w) => w.treatment_item_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  // 3. Si hay plan items, buscar precio del ítem y total pagado
  let priceByItem = new Map<string, number>();
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
        .select("id, price")
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
    }
    for (const row of paymentRows ?? []) {
      const key = row.treatment_item_id as string;
      paidByItem.set(key, (paidByItem.get(key) ?? 0) + Number(row.amount));
    }
  }

  return works.map((w) => {
    const itemId = w.treatment_item_id as string | null;
    // Si el trabajo está vinculado a un plan, usar datos del plan
    // Si no, usar los datos propios del doctor_work como fallback
    const planItemPrice = itemId ? (priceByItem.get(itemId) ?? Number(w.cost)) : Number(w.cost);
    const planItemPaid = itemId ? (paidByItem.get(itemId) ?? Number(w.amount_paid)) : Number(w.amount_paid);

    return {
      id: w.id as string,
      description: w.description as string,
      patient_name: w.patient_name as string | null,
      commission_amount: Number(w.commission_amount),
      lab_commission_amount: Number(w.lab_commission_amount),
      performed_at: w.performed_at as string,
      planItemPrice,
      planItemPaid,
    };
  });
}
