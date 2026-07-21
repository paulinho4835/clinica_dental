import { describe, it, expect } from "vitest";
import { sanitizeEnvValue, validateEnv } from "@/lib/env";

describe("sanitizeEnvValue", () => {
  it("quita el BOM al inicio (el bug real de R2_BUCKET)", () => {
    expect(sanitizeEnvValue("\uFEFFclinica-fotos")).toBe("clinica-fotos");
  });

  it("quita espacios de ancho cero intercalados", () => {
    expect(sanitizeEnvValue("abc\u200Bdef")).toBe("abcdef");
  });

  it("recorta espacios normales", () => {
    expect(sanitizeEnvValue("  valor  ")).toBe("valor");
  });

  it("trata la cadena vacía (o solo espacios) como ausente", () => {
    expect(sanitizeEnvValue("")).toBeUndefined();
    expect(sanitizeEnvValue("   ")).toBeUndefined();
  });

  it("devuelve undefined para no-strings", () => {
    expect(sanitizeEnvValue(undefined)).toBeUndefined();
  });
});

// Entorno mínimo válido para construir casos de prueba.
const validBase: Record<string, string | undefined> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  CRON_SECRET: "secreto",
};

describe("validateEnv", () => {
  it("no reporta errores ni advertencias con el entorno mínimo válido", () => {
    const { errors, warnings } = validateEnv(validBase);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("reporta error por cada variable obligatoria faltante", () => {
    const { errors } = validateEnv({});
    expect(errors.some((e) => e.includes("NEXT_PUBLIC_SUPABASE_URL"))).toBe(true);
    expect(errors.some((e) => e.includes("SUPABASE_SERVICE_ROLE_KEY"))).toBe(true);
  });

  it("detecta una URL de Supabase inválida", () => {
    const { errors } = validateEnv({ ...validBase, NEXT_PUBLIC_SUPABASE_URL: "no-es-url" });
    expect(errors.some((e) => e.includes("no es una URL válida"))).toBe(true);
  });

  it("advierte (no error) si falta CRON_SECRET", () => {
    const { errors, warnings } = validateEnv({ ...validBase, CRON_SECRET: undefined });
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes("CRON_SECRET"))).toBe(true);
  });

  it("advierte si un grupo de feature está configurado a medias", () => {
    const { warnings } = validateEnv({
      ...validBase,
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      // faltan R2_SECRET_ACCESS_KEY y R2_BUCKET
    });
    expect(warnings.some((w) => w.includes("R2") && w.includes("R2_BUCKET"))).toBe(true);
  });

  it("no advierte si el grupo de feature está completo o totalmente ausente", () => {
    const full = validateEnv({
      ...validBase,
      R2_ACCOUNT_ID: "a",
      R2_ACCESS_KEY_ID: "b",
      R2_SECRET_ACCESS_KEY: "c",
      R2_BUCKET: "d",
    });
    expect(full.warnings.some((w) => w.includes("R2"))).toBe(false);
    const none = validateEnv(validBase);
    expect(none.warnings.some((w) => w.includes("R2"))).toBe(false);
  });

  it("advierte si falta GOOGLE_CLIENT_SECRET habiendo GOOGLE_CLIENT_ID", () => {
    const { warnings } = validateEnv({ ...validBase, GOOGLE_CLIENT_ID: "abc" });
    expect(warnings.some((w) => w.includes("Google Calendar") && w.includes("GOOGLE_CLIENT_SECRET"))).toBe(true);
  });
});
