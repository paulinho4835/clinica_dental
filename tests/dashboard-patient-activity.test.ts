import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mapPatientActivity } from "@/lib/dashboard/patientActivity";

const migration = resolve(process.cwd(), "supabase/migrations/0125_dash_patient_activity.sql");
const sql = existsSync(migration) ? readFileSync(migration, "utf8").toLowerCase() : "";

describe("dash_patient_activity (SQL)", () => {
  it("agrega en SQL, acotado a la clínica del usuario y en hora Bolivia", () => {
    expect(sql).toContain("function public.dash_patient_activity(p_today date)");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("public.auth_clinic_id()");
    expect(sql).toContain("operation_forbidden");
    expect(sql).toContain("america/la_paz");
    expect(sql).toContain("count(distinct");
  });

  it("solo se puede ejecutar como usuario autenticado", () => {
    expect(sql).toContain("revoke all on function public.dash_patient_activity(date)");
    expect(sql).toContain("grant execute on function public.dash_patient_activity(date)");
    expect(sql).toContain("to authenticated");
  });
});

describe("mapPatientActivity", () => {
  it("rellena los últimos 30 días terminando hoy, con ceros donde no hubo actividad", () => {
    const result = mapPatientActivity(
      { daily: [{ day: "2026-10-01", patients: 4 }, { day: "2026-09-15", patients: 2 }] },
      "2026-10-01",
    );
    expect(result.patDaily).toHaveLength(30);
    expect(result.patDaily[0]).toEqual({ label: "02/09", count: 0 });
    expect(result.patDaily[13]).toEqual({ label: "15/09", count: 2 });
    expect(result.patDaily[29]).toEqual({ label: "01/10", count: 4 });
  });

  it("arma los 12 meses del año y marca el mes pico", () => {
    const result = mapPatientActivity(
      { monthly: [{ month: 2, patients: 10 }, { month: 9, patients: 35 }] },
      "2026-10-01",
    );
    expect(result.patMonthly).toHaveLength(12);
    expect(result.patMonthly[1]).toEqual({ name: "Feb", count: 10 });
    expect(result.patMonthly[8]).toEqual({ name: "Sep", count: 35 });
    expect(result.patPeakMonth).toBe("Sep");
  });

  it("no marca mes pico si no hubo actividad en el año", () => {
    expect(mapPatientActivity({}, "2026-10-01").patPeakMonth).toBeNull();
  });

  it("convierte totales, doctores y comisiones aunque lleguen como texto", () => {
    const result = mapPatientActivity(
      {
        today: 3,
        week: 12,
        month: 40,
        doctors: [
          { name: "Dra. Paz", patients: 25, commission: "1500.50" },
          { name: "Dr. Rojas", patients: 15, commission: 900 },
        ],
        month_commissions: "2400.50",
        month_appointments: 80,
        month_no_shows: 6,
        new_patients: 9,
      },
      "2026-10-01",
    );
    expect(result.patientsToday).toBe(3);
    expect(result.patientsThisWeek).toBe(12);
    expect(result.patientsThisMonth).toBe(40);
    expect(result.topDoctors).toEqual([
      { name: "Dra. Paz", patientsCount: 25, commission: 1500.5 },
      { name: "Dr. Rojas", patientsCount: 15, commission: 900 },
    ]);
    expect(result.totalMonthCommissions).toBe(2400.5);
    expect(result.monthApptsTotal).toBe(80);
    expect(result.monthApptsNoShow).toBe(6);
    expect(result.newPatients).toBe(9);
  });

  it("traduce el origen de pacientes y agrupa los desconocidos en 'Sin especificar'", () => {
    const result = mapPatientActivity(
      {
        referrals: [
          { source: "facebook", patients: 5 },
          { source: "", patients: 7 },
          { source: "radio", patients: 2 },
          { source: "recomendacion", patients: 8 },
        ],
      },
      "2026-10-01",
    );
    expect(result.referralData).toEqual([
      { label: "Sin especificar", cnt: 9 },
      { label: "Recomendación de un amigo o familiar", cnt: 8 },
      { label: "Facebook", cnt: 5 },
    ]);
  });

  it("devuelve ceros si la RPC no trae datos", () => {
    const result = mapPatientActivity(null, "2026-10-01");
    expect(result.patientsToday).toBe(0);
    expect(result.topDoctors).toEqual([]);
    expect(result.referralData).toEqual([]);
    expect(result.patDaily.every((d) => d.count === 0)).toBe(true);
  });
});
