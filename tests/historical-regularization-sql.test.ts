import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "supabase/migrations/0111_paid_historical_work_safety.sql");

describe("regularización histórica pagada", () => {
  it("exige comisión completamente pagada y bloquea destinos ocupados dentro de la transacción", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("Solo pueden vincularse trabajos con la comision completamente abonada.");
    expect(sql).toContain("commission_paid_amount");
    expect(sql).toContain("commission_amount");
    expect(sql).toContain("lab_commission_amount");
    expect(sql).toContain("El tratamiento ya tiene otro trabajo clinico asociado.");
    expect(sql).toMatch(/where treatment_item_id = v_item_id[\s\S]+for update/);
  });

  it("serializa los abonos y rechaza montos superiores a la comisión restante", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("guard_staff_payment_work_amount");
    expect(sql).toContain("El abono excede la comision restante del trabajo.");
    expect(sql).toMatch(/from doctor_works[\s\S]+for update/);
  });
});
