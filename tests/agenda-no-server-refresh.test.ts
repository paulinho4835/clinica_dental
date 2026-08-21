import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("Agenda directa", () => {
  it("no fuerza recargas completas de Next.js desde componentes de Agenda", () => {
    const agendaDir = join(root, "components", "agenda");
    const sources = readdirSync(agendaDir)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => readFileSync(join(agendaDir, file), "utf8"))
      .join("\n");

    expect(sources).not.toContain("router.refresh()");
  });

  it("la página servidor deja las consultas frecuentes al cliente", () => {
    const page = readFileSync(join(root, "app", "(dashboard)", "agenda", "page.tsx"), "utf8");

    expect(page).toContain("<AgendaClient");
    expect(page).not.toContain('.from("appointments")');
    expect(page).not.toContain('.from("patients")');
    expect(page).not.toContain("doctor_availability");
    expect(page).not.toContain("<RealtimeAppointments");
  });

  it("la carga cliente usa el RPC acotado y no expone una lectura libre de citas", () => {
    const client = readFileSync(
      join(root, "components", "agenda", "AgendaClient.tsx"),
      "utf8",
    );

    expect(client).toContain('rpc("get_agenda_appointments"');
    expect(client).not.toContain('.from("appointments")');
  });
});
