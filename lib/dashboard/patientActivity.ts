import { REFERRAL_SOURCE_LABEL } from "@/lib/schemas/patient-intake";

// Convierte el jsonb de dash_patient_activity (0125) en las formas que usan
// los gráficos y KPIs del Dashboard. La agregación vive en SQL; aquí solo se
// rellenan huecos (días/meses sin actividad), se traducen etiquetas y se
// normalizan números (PostgREST devuelve numeric como texto).

export const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const UNSPECIFIED_SOURCE = "Sin especificar";

export type PatientActivity = {
  patDaily: { label: string; count: number }[];
  patMonthly: { name: string; count: number }[];
  patPeakMonth: string | null;
  patientsToday: number;
  patientsThisWeek: number;
  patientsThisMonth: number;
  topDoctors: { name: string; patientsCount: number; commission: number }[];
  totalMonthCommissions: number;
  monthApptsTotal: number;
  monthApptsNoShow: number;
  newPatients: number;
  referralData: { label: string; cnt: number }[];
};

type Raw = {
  daily?: { day: string; patients: number | string }[];
  monthly?: { month: number | string; patients: number | string }[];
  today?: number | string;
  week?: number | string;
  month?: number | string;
  doctors?: { name: string; patients: number | string; commission: number | string }[];
  month_commissions?: number | string;
  month_appointments?: number | string;
  month_no_shows?: number | string;
  new_patients?: number | string;
  referrals?: { source: string | null; patients: number | string }[];
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function mapPatientActivity(raw: unknown, todayISO: string): PatientActivity {
  const data = (raw && typeof raw === "object" ? raw : {}) as Raw;

  const byDay = new Map((data.daily ?? []).map((d) => [d.day, num(d.patients)]));
  const [y, m, d] = todayISO.split("-").map(Number);
  const patDaily: PatientActivity["patDaily"] = [];
  for (let i = 29; i >= 0; i--) {
    // Aritmética de fechas en UTC para no depender de la zona del server.
    const day = new Date(Date.UTC(y, m - 1, d - i));
    const key = day.toISOString().slice(0, 10);
    patDaily.push({
      label: `${pad(day.getUTCDate())}/${pad(day.getUTCMonth() + 1)}`,
      count: byDay.get(key) ?? 0,
    });
  }

  const byMonth = new Map((data.monthly ?? []).map((r) => [num(r.month), num(r.patients)]));
  const patMonthly = MONTHS.map((name, idx) => ({ name, count: byMonth.get(idx + 1) ?? 0 }));
  const peak = patMonthly.reduce<PatientActivity["patMonthly"][number] | null>(
    (best, cur) => (cur.count > (best?.count ?? 0) ? cur : best),
    null,
  );

  const referralCounts = new Map<string, number>();
  for (const r of data.referrals ?? []) {
    const source = (r.source ?? "").trim();
    const label = REFERRAL_SOURCE_LABEL[source] ?? UNSPECIFIED_SOURCE;
    referralCounts.set(label, (referralCounts.get(label) ?? 0) + num(r.patients));
  }

  return {
    patDaily,
    patMonthly,
    patPeakMonth: peak && peak.count > 0 ? peak.name : null,
    patientsToday: num(data.today),
    patientsThisWeek: num(data.week),
    patientsThisMonth: num(data.month),
    topDoctors: (data.doctors ?? []).map((doc) => ({
      name: doc.name,
      patientsCount: num(doc.patients),
      commission: num(doc.commission),
    })),
    totalMonthCommissions: num(data.month_commissions),
    monthApptsTotal: num(data.month_appointments),
    monthApptsNoShow: num(data.month_no_shows),
    newPatients: num(data.new_patients),
    referralData: Array.from(referralCounts.entries())
      .map(([label, cnt]) => ({ label, cnt }))
      .sort((a, b) => b.cnt - a.cnt),
  };
}
