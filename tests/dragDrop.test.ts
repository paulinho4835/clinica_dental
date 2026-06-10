import { describe, it, expect } from "vitest";
import { snapToSlot, applyOptimisticMove, revertMove } from "@/lib/agenda/dragDrop";
import { OPEN_HOUR, CLOSE_HOUR } from "@/lib/agenda";

const PX_PER_HOUR = 56;
const AXIS_H = (CLOSE_HOUR - OPEN_HOUR) * PX_PER_HOUR;

describe("snapToSlot", () => {
  it("y=0 mapea a OPEN_HOUR:00", () => {
    const result = snapToSlot(0, AXIS_H, "2026-06-10");
    expect(result.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("snappea a incrementos de 15 minutos", () => {
    // 1h desde apertura = 56px exactos => 09:00
    const r1 = snapToSlot(PX_PER_HOUR, AXIS_H, "2026-06-10");
    expect(r1.time).toBe(`${String(OPEN_HOUR + 1).padStart(2,"0")}:00`);

    // 7px dentro del primer slot (15min = 14px) → redondea a 08:00
    const r2 = snapToSlot(7, AXIS_H, "2026-06-10");
    expect(r2.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("no puede ir por debajo de OPEN_HOUR", () => {
    const r = snapToSlot(-100, AXIS_H, "2026-06-10");
    expect(r.time).toBe(`${String(OPEN_HOUR).padStart(2,"0")}:00`);
  });

  it("no puede superar CLOSE_HOUR - 15min", () => {
    const r = snapToSlot(AXIS_H + 999, AXIS_H, "2026-06-10");
    expect(r.time).toBe("19:45");
  });

  it("devuelve la fecha correcta", () => {
    const r = snapToSlot(0, AXIS_H, "2026-06-10");
    expect(r.date).toBe("2026-06-10");
  });
});

describe("applyOptimisticMove + revertMove", () => {
  const makeAppt = (id: string, starts: string, ends: string) => ({
    id,
    starts_at: starts,
    ends_at: ends,
    status: "scheduled",
    dentist_name: null,
    patient_id: null,
    patient_name: "Test",
    reason: null,
    consult_price: null,
    deposit: null,
    deposit_method: null,
    patients: null,
  });

  it("applyOptimisticMove mueve la cita correcta y preserva la duración", () => {
    const appts = [
      makeAppt("a1", "2026-06-10T09:00:00", "2026-06-10T10:00:00"),
      makeAppt("a2", "2026-06-10T11:00:00", "2026-06-10T12:00:00"),
    ];
    const result = applyOptimisticMove(appts, "a1", "2026-06-10", "10:00");
    const moved = result.find((a) => a.id === "a1")!;
    expect(moved.starts_at).toContain("T10:00");
    expect(moved.ends_at).toContain("T11:00"); // 1h de duración preservada
    // a2 no cambia
    expect(result.find((a) => a.id === "a2")!.starts_at).toBe(
      "2026-06-10T11:00:00"
    );
  });

  it("revertMove restaura el estado original exacto", () => {
    const original = [
      makeAppt("a1", "2026-06-10T09:00:00", "2026-06-10T10:00:00"),
    ];
    const moved = applyOptimisticMove(original, "a1", "2026-06-10", "11:00");
    const reverted = revertMove(moved, original);
    expect(reverted.find((a) => a.id === "a1")!.starts_at).toBe(
      "2026-06-10T09:00:00"
    );
  });
});
