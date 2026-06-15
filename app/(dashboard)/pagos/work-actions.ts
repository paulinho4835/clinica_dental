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
  cost: number;
  amount_paid: number;
};

export async function fetchDoctorUnpaidWorks(doctorId: string): Promise<UnpaidWork[]> {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("doctor_works")
    .select("id, description, patient_name, commission_amount, lab_commission_amount, performed_at, cost, amount_paid")
    .eq("clinic_id", profile.clinicId)
    .eq("doctor_id", doctorId)
    .eq("commission_paid", false)
    .order("performed_at", { ascending: false });

  return (data ?? []).map((w) => ({
    id: w.id as string,
    description: w.description as string,
    patient_name: w.patient_name as string | null,
    commission_amount: Number(w.commission_amount),
    lab_commission_amount: Number(w.lab_commission_amount),
    performed_at: w.performed_at as string,
    cost: Number(w.cost),
    amount_paid: Number(w.amount_paid),
  }));
}
