import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getProfile = vi.fn();
vi.mock("@/lib/auth", () => ({ getProfile }));

const getClinicFeatures = vi.fn();
vi.mock("@/lib/superadmin", () => ({ getClinicFeatures }));

const withinClinicalHours = vi.fn();
vi.mock("@/lib/clinicalHours", () => ({ withinClinicalHours }));

const checkRateLimit = vi.fn();
vi.mock("@/lib/ratelimit", () => ({
  checkRateLimit,
  tooManyRequestsMessage: (s: number) => `Demasiadas solicitudes. Espera ${s} segundos.`,
}));

const transcribeOdontogramAudio = vi.fn();
vi.mock("@/lib/odontogram/voice-transcription", () => ({ transcribeOdontogramAudio }));

const interpretOdontogramVoice = vi.fn();
vi.mock("@/lib/odontogram/voice-interpretation", () => ({ interpretOdontogramVoice }));

// Builder encadenable mínimo: cada método regresa `this`, y el consumidor
// awaitea el builder mismo (thenable) para llegar al resultado configurado.
function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "eq", "single", "maybeSingle"];
  for (const m of methods) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let clinicResult: { data: unknown };
let patientResult: { data: unknown };
const from = vi.fn((table: string) => (table === "clinics" ? chain(clinicResult) : chain(patientResult)));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from }) }));

const { POST } = await import("@/app/api/odontogram/voice/interpret/route");

const PROFILE = { userId: "u1", clinicId: "c1", role: "odontologo_general", fullName: "Dra. Test" };

function audioForm(overrides: Partial<{ audio: Blob; patientId: string; durationMs: string }> = {}) {
  const form = new FormData();
  form.set("audio", overrides.audio ?? new Blob(["x"], { type: "audio/webm" }), "d.webm");
  form.set("patientId", overrides.patientId ?? "p1");
  form.set("durationMs", overrides.durationMs ?? "2000");
  return form;
}

function request(form: FormData) {
  return new Request("http://x/api/odontogram/voice/interpret", { method: "POST", body: form });
}

describe("POST /api/odontogram/voice/interpret", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProfile.mockResolvedValue(PROFILE);
    getClinicFeatures.mockResolvedValue({ odontogram_dictado_voz: true, bloqueo_horario: false });
    withinClinicalHours.mockReturnValue(true);
    checkRateLimit.mockResolvedValue({ ok: true, retryAfterSeconds: 0 });
    clinicResult = { data: { settings: {} } };
    patientResult = { data: { id: "p1" } };
    transcribeOdontogramAudio.mockResolvedValue("caries en el cuarenta y seis");
    interpretOdontogramVoice.mockResolvedValue({
      operations: [{ action: "set_surface", tooth: "46", surface: "O", condition: "caries" }],
      uncertainties: [],
    });
  });

  it("rechaza sin permiso clínico (recepcionista)", async () => {
    getProfile.mockResolvedValue({ ...PROFILE, role: "recepcionista" });
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(403);
    expect(interpretOdontogramVoice).not.toHaveBeenCalled();
  });

  it("rechaza si el feature flag de la clínica está apagado", async () => {
    getClinicFeatures.mockResolvedValue({ odontogram_dictado_voz: false, bloqueo_horario: false });
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(403);
  });

  it("rechaza fuera de horario clínico (no admin)", async () => {
    getClinicFeatures.mockResolvedValue({ odontogram_dictado_voz: true, bloqueo_horario: true });
    withinClinicalHours.mockReturnValue(false);
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(403);
  });

  it("permite fuera de horario si el rol es admin", async () => {
    getProfile.mockResolvedValue({ ...PROFILE, role: "admin" });
    getClinicFeatures.mockResolvedValue({ odontogram_dictado_voz: true, bloqueo_horario: true });
    withinClinicalHours.mockReturnValue(false);
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(200);
  });

  it("devuelve 429 con Retry-After si excede el rate limit", async () => {
    checkRateLimit.mockResolvedValue({ ok: false, retryAfterSeconds: 45 });
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("rechaza content-type que no sea multipart/form-data", async () => {
    const res = await POST(
      new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
    );
    expect(res.status).toBe(415);
  });

  it("rechaza audio que exceda 5 MB", async () => {
    const big = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "audio/webm" });
    const res = await POST(request(audioForm({ audio: big })));
    expect(res.status).toBe(400);
  });

  it("rechaza duración mayor a 60 segundos", async () => {
    const res = await POST(request(audioForm({ durationMs: "60001" })));
    expect(res.status).toBe(400);
  });

  it("rechaza tipo de audio no permitido", async () => {
    const res = await POST(request(audioForm({ audio: new Blob(["x"], { type: "audio/wav" }) })));
    expect(res.status).toBe(400);
  });

  it("acepta audio/webm con parámetros de codec (formato real que manda el navegador)", async () => {
    const res = await POST(request(audioForm({ audio: new Blob(["x"], { type: "audio/webm;codecs=opus" }) })));
    expect(res.status).toBe(200);
  });

  it("responde 404 si el paciente no pertenece a la clínica", async () => {
    patientResult = { data: null };
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(404);
  });

  it("responde 422 sin invocar al LLM si la transcripción no tiene texto útil", async () => {
    transcribeOdontogramAudio.mockResolvedValue("  ");
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(422);
    expect(interpretOdontogramVoice).not.toHaveBeenCalled();
  });

  it("responde 502 genérico si el proveedor falla, sin filtrar detalles", async () => {
    transcribeOdontogramAudio.mockRejectedValue(new Error("Deepgram 500: payload interno secreto"));
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain("secreto");
  });

  it("200: separa operaciones válidas de inválidas (advertencias) y nunca aplica una operación inválida", async () => {
    interpretOdontogramVoice.mockResolvedValue({
      operations: [
        { action: "set_surface", tooth: "46", surface: "O", condition: "caries" },
        { action: "set_whole", tooth: "99", condition: "corona" }, // FDI inexistente
      ],
      uncertainties: ["en el treinta y..."],
    });
    const res = await POST(request(audioForm()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.operations).toEqual([{ action: "set_surface", tooth: "46", surface: "O", condition: "caries" }]);
    expect(body.warnings).toHaveLength(1);
    expect(body.uncertainties).toEqual(["en el treinta y..."]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
