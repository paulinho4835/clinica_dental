import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = resolve(process.cwd(), "supabase/migrations/0113_clinic_direct_operations.sql");
const sql = existsSync(migration) ? readFileSync(migration, "utf8") : "";

describe("RPCs directas de la clinica", () => {
  it("protege las funciones por usuario, tenant y rol", () => {
    expect(sql).toContain("create_patient_atomic");
    expect(sql).toContain("create_patient_payment_atomic");
    expect(sql).toContain("get_patient_financial_summary");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("auth_clinic_id()");
    expect(sql).toContain("operation_forbidden");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.create_patient_atomic");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.create_patient_payment_atomic");
  });

  it("hace idempotentes y atomicas las escrituras", () => {
    expect(sql).toContain("clinic_operation_idempotency");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("INSERT INTO public.patients");
    expect(sql).toContain("public.create_payment_with_work");
    expect(sql).toContain("request_hash");
  });
});
