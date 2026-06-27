import { describe, it, expect } from "vitest";
import {
  usageLevel,
  formatBytes,
  SUPABASE_FREE_DB_BYTES,
  SUPABASE_FREE_STORAGE_BYTES,
  R2_FREE_PHOTO_BYTES,
} from "@/lib/storageLimits";

const MB = 1024 ** 2;
const GB = 1024 ** 3;

describe("usageLevel — niveles de alerta de almacenamiento", () => {
  it("ok por debajo del 80%", () => {
    expect(usageLevel(0, 100)).toBe("ok");
    expect(usageLevel(50, 100)).toBe("ok");
    expect(usageLevel(79, 100)).toBe("ok");
  });

  it("warn entre 80% y 90%", () => {
    expect(usageLevel(80, 100)).toBe("warn");
    expect(usageLevel(85, 100)).toBe("warn");
    expect(usageLevel(89.9, 100)).toBe("warn");
  });

  it("danger desde 90% en adelante", () => {
    expect(usageLevel(90, 100)).toBe("danger");
    expect(usageLevel(100, 100)).toBe("danger");
    expect(usageLevel(120, 100)).toBe("danger"); // sobrepasado
  });

  it("ok si el límite es 0 o negativo (sin división por cero)", () => {
    expect(usageLevel(500, 0)).toBe("ok");
    expect(usageLevel(500, -10)).toBe("ok");
  });

  it("aplica a los límites reales del free tier", () => {
    // DB al 81% → warn; Storage al 95% → danger.
    expect(usageLevel(SUPABASE_FREE_DB_BYTES * 0.81, SUPABASE_FREE_DB_BYTES)).toBe("warn");
    expect(usageLevel(SUPABASE_FREE_STORAGE_BYTES * 0.95, SUPABASE_FREE_STORAGE_BYTES)).toBe("danger");
    expect(usageLevel(GB, R2_FREE_PHOTO_BYTES)).toBe("ok"); // 1 GB de 10 GB
  });
});

describe("formatBytes — formato legible", () => {
  it("0 o negativo → 0 MB", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(-100)).toBe("0 MB");
  });

  it("menos de 10 MB → un decimal", () => {
    expect(formatBytes(MB / 2)).toBe("0.5 MB");
    expect(formatBytes(5 * MB)).toBe("5.0 MB");
  });

  it("de 10 MB a <1 GB → entero", () => {
    expect(formatBytes(50 * MB)).toBe("50 MB");
    expect(formatBytes(500 * MB)).toBe("500 MB");
  });

  it("1 GB o más → GB con dos decimales", () => {
    expect(formatBytes(GB)).toBe("1.00 GB");
    expect(formatBytes(2 * GB)).toBe("2.00 GB");
    expect(formatBytes(R2_FREE_PHOTO_BYTES)).toBe("10.00 GB");
  });
});

describe("límites del free tier (constantes)", () => {
  it("coinciden con los valores documentados", () => {
    expect(SUPABASE_FREE_DB_BYTES).toBe(500 * MB);
    expect(SUPABASE_FREE_STORAGE_BYTES).toBe(GB);
    expect(R2_FREE_PHOTO_BYTES).toBe(10 * GB);
  });
});
