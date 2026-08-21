import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit,
  clientIp: () => "127.0.0.1",
  tooManyRequestsMessage: (s: number) => `Espera ${s}s`,
}));

function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "single", "maybeSingle"]) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let inviteResult: { data: unknown };
let clinicResult: { data: unknown };
let updatePayload: Record<string, unknown> | null = null;
const from = vi.fn((table: string) => {
  if (table === "anamnesis_invitations") {
    return {
      ...chain(inviteResult),
      update: (payload: Record<string, unknown>) => {
        updatePayload = payload;
        return chain({ data: null, error: null });
      },
    };
  }
  return chain(clinicResult);
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from }) }));

const { submitPublicAnamnesis } = await import("@/app/h/[token]/submit-action");

const NOW = Date.now();

function form(
  overrides: { custom?: unknown; personal?: Record<string, unknown>; firma?: string } = {},
) {
  const fd = new FormData();
  fd.set("anamnesis", JSON.stringify({ firma: overrides.firma ?? "data:image/png;base64,test" }));
  fd.set("allergies", "");
  fd.set("medical_alerts", "");
  fd.set("personal", JSON.stringify({ full_name: "Paciente Test", ...(overrides.personal ?? {}) }));
  if (overrides.custom !== undefined) fd.set("custom", JSON.stringify(overrides.custom));
  return fd;
}

describe("submitPublicAnamnesis — preguntas adicionales (kind: new)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePayload = null;
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
    inviteResult = {
      data: {
        id: "inv-1",
        kind: "new",
        patient_id: null,
        clinic_id: "clinic-1",
        expires_at: new Date(NOW + 60_000).toISOString(),
        completed_at: null,
      },
    };
    clinicResult = {
      data: {
        settings: {
          custom_intake_questions: [
            { key: "seguro", label: "¿Tienes seguro?", type: "boolean", required: true, active: true, position: 0 },
          ],
        },
        features: { preguntas_registro: true },
      },
    };
  });

  it("rechaza si falta una pregunta obligatoria", async () => {
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: {} }));
    expect(result.error).toContain("Falta responder");
    expect(updatePayload).toBeNull();
  });

  it("rechaza el registro si falta la firma", async () => {
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: { seguro: true }, firma: "" }));
    expect(result.error).toContain("firma es obligatoria");
    expect(updatePayload).toBeNull();
  });

  it("guarda el snapshot en submitted_custom cuando la respuesta es válida", async () => {
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: { seguro: true } }));
    expect(result.ok).toBe(true);
    expect(updatePayload?.submitted_custom).toEqual([
      { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
    ]);
  });

  it("ignora una clave que no corresponde a ninguna pregunta activa", async () => {
    const result = await submitPublicAnamnesis(
      "tok",
      {},
      form({ custom: { seguro: true, inventada: "x" } }),
    );
    expect(result.ok).toBe(true);
    expect(
      (updatePayload?.submitted_custom as { key: string }[]).some((s) => s.key === "inventada"),
    ).toBe(false);
  });

  it("con el addon apagado, ignora la pregunta obligatoria (no la exige ni la guarda)", async () => {
    clinicResult = {
      data: {
        settings: {
          custom_intake_questions: [
            { key: "seguro", label: "¿Tienes seguro?", type: "boolean", required: true, active: true, position: 0 },
          ],
        },
        features: { preguntas_registro: false },
      },
    };
    const result = await submitPublicAnamnesis("tok", {}, form({ custom: {} }));
    expect(result.ok).toBe(true);
    expect(updatePayload?.submitted_custom).toEqual([]);
  });
});
