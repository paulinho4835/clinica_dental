import { describe, it, expect } from "vitest";
import {
  buildRestorePayload,
  type BackupFile,
  type BackupSchema,
} from "@/lib/clinicBackup";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Esquema mínimo: dos tablas con un token único global cada una.
const schema: BackupSchema = {
  tables: {
    appointments: {
      columns: [
        { name: "id", generated: false, not_null: true },
        { name: "clinic_id", generated: false, not_null: true },
        { name: "confirm_token", generated: false, not_null: true },
        { name: "reason", generated: false, not_null: false },
      ],
      fks: [{ column: "clinic_id", parent: "clinics" }],
    },
    work_feedback: {
      columns: [
        { name: "id", generated: false, not_null: true },
        { name: "clinic_id", generated: false, not_null: true },
        { name: "token", generated: false, not_null: true },
      ],
      fks: [{ column: "clinic_id", parent: "clinics" }],
    },
  },
};

const backup: BackupFile = {
  version: 1,
  generated_at: "2026-06-28T00:00:00.000Z",
  source_clinic_id: "old-clinic",
  clinic: { id: "old-clinic", name: "Sonrisa" },
  tables: {
    appointments: [
      { id: "a1", clinic_id: "old-clinic", confirm_token: "tok-A", reason: "control" },
      { id: "a2", clinic_id: "old-clinic", confirm_token: "tok-B", reason: "limpieza" },
    ],
    work_feedback: [{ id: "w1", clinic_id: "old-clinic", token: "feed-A" }],
  },
};

describe("buildRestorePayload — regeneración de tokens únicos", () => {
  it("regenera los tokens para no chocar con la clínica origen", () => {
    const result = buildRestorePayload(backup, schema, new Set());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const appts = result.payload.ordered.find((e) => e.table === "appointments")!;
    const feedback = result.payload.ordered.find((e) => e.table === "work_feedback")!;

    // Ningún confirm_token conserva el valor original; todos son UUID nuevos.
    for (const row of appts.rows) {
      expect(row.confirm_token).not.toBe("tok-A");
      expect(row.confirm_token).not.toBe("tok-B");
      expect(String(row.confirm_token)).toMatch(UUID_RE);
    }
    expect(feedback.rows[0].token).not.toBe("feed-A");
    expect(String(feedback.rows[0].token)).toMatch(UUID_RE);
  });

  it("los tokens regenerados son únicos entre filas", () => {
    const result = buildRestorePayload(backup, schema, new Set());
    if (!result.ok) throw new Error("esperaba ok");
    const appts = result.payload.ordered.find((e) => e.table === "appointments")!;
    const tokens = appts.rows.map((r) => r.confirm_token);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it("remapea id y clinic_id, y conserva las columnas normales", () => {
    const result = buildRestorePayload(backup, schema, new Set());
    if (!result.ok) throw new Error("esperaba ok");
    const appts = result.payload.ordered.find((e) => e.table === "appointments")!;
    const newClinicId = result.payload.newClinic.id;

    for (const row of appts.rows) {
      expect(row.id).not.toBe("a1");
      expect(row.id).not.toBe("a2");
      expect(row.clinic_id).toBe(newClinicId); // FK reapuntada al clon
    }
    // La columna no-token se preserva.
    expect(appts.rows.map((r) => r.reason).sort()).toEqual(["control", "limpieza"]);
  });
});
