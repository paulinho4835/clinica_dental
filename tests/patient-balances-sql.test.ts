import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/0127_patient_balances.sql");
const sql = existsSync(migration) ? readFileSync(migration, "utf8").toLowerCase() : "";

describe("patient_balances / dash_debt_summary (SQL)", () => {
  it("lista pacientes con saldo usando la misma fórmula que la ficha", () => {
    expect(sql).toContain("function public.patient_balances()");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("public.auth_clinic_id()");
    // Total = ítems del plan no cancelados (igual que fetchPatientPlanItems);
    // pagado = todos los pagos del paciente.
    expect(sql).toContain("ti.status <> 'cancelled'");
    expect(sql).toContain("order by");
  });

  it("el KPI de cuentas por cobrar suma exactamente esa misma lista", () => {
    expect(sql).toContain("function public.dash_debt_summary()");
    expect(sql).toContain("from public.patient_balances()");
  });

  it("solo se puede ejecutar como usuario autenticado", () => {
    expect(sql).toContain("revoke all on function public.patient_balances()");
    expect(sql).toContain("grant execute on function public.patient_balances()");
  });

  it("no cambia los permisos existentes de dash_debt_summary al redefinirla", () => {
    expect(sql).not.toContain("on function public.dash_debt_summary()");
  });
});
