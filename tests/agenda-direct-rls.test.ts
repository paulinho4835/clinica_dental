import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0114_agenda_direct_read_scope.sql"),
  "utf8",
).toLowerCase();

describe("RPC segura de lectura directa de Agenda", () => {
  it("limita doctores sin alterar las consultas de citas de otros módulos", () => {
    expect(sql).toContain("function public.get_agenda_appointments");
    expect(sql).toContain("security definer");
    expect(sql).toContain("a.clinic_id = (select public.auth_clinic_id())");
    expect(sql).toContain("auth_role()");
    expect(sql).toContain("'admin'");
    expect(sql).toContain("'recepcionista'");
    expect(sql).toContain("dentist_id = (select auth.uid())");
    expect(sql).toContain("dentist_name");
    expect(sql).toContain("where p.id = (select auth.uid())");
    expect(sql).toContain("grant execute on function public.get_agenda_appointments");
    expect(sql).toContain("revoke execute on function public.get_agenda_appointments");
    expect(sql).not.toContain("create policy");
  });
});
