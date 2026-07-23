import { describe, expect, it, vi, beforeEach } from "vitest";

let platformAdmin = true;
vi.mock("@/lib/superadmin", () => ({
  isPlatformAdmin: async () => platformAdmin,
}));

function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle"]) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let platformAdminRowResult: { data: unknown };
let profileResult: { data: unknown };
const adminFrom = vi.fn((table: string) => {
  if (table === "platform_admins") return chain(platformAdminRowResult);
  if (table === "profiles") return chain(profileResult);
  throw new Error(`tabla no mockeada: ${table}`);
});

let getUserByIdResult: { data: unknown; error: unknown };
let generateLinkResult: { data: unknown; error: unknown };
const generateLink = vi.fn(async () => generateLinkResult);
const getUserById = vi.fn(async () => getUserByIdResult);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    auth: { admin: { getUserById, generateLink } },
  }),
}));

let sessionResult: { data: { session: unknown } };
let verifyOtpResult: { data: { session: unknown }; error: unknown };
const getSession = vi.fn(async () => sessionResult);
const verifyOtp = vi.fn(async () => verifyOtpResult);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession, verifyOtp },
  }),
}));

const { impersonateUser } = await import("@/app/(dashboard)/superadmin/actions");

describe("impersonateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformAdmin = true;
    platformAdminRowResult = { data: null };
    profileResult = { data: { full_name: "Ana Recepción", role: "recepcionista" } };
    getUserByIdResult = { data: { user: { email: "ana@clinica.test" } }, error: null };
    generateLinkResult = {
      data: { properties: { hashed_token: "tok-123" } },
      error: null,
    };
    sessionResult = {
      data: { session: { access_token: "sa-access", refresh_token: "sa-refresh" } },
    };
    verifyOtpResult = {
      data: { session: { access_token: "imp-access", refresh_token: "imp-refresh" } },
      error: null,
    };
  });

  it("rechaza si quien llama no es superadmin", async () => {
    platformAdmin = false;
    await expect(impersonateUser("user-1")).rejects.toThrow("No autorizado");
  });

  it("rechaza entrar como otro superadmin", async () => {
    platformAdminRowResult = { data: { user_id: "user-1" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se puede entrar como otro superadmin",
    );
  });

  it("rechaza si el usuario no existe", async () => {
    profileResult = { data: null };
    await expect(impersonateUser("user-1")).rejects.toThrow("Usuario no encontrado");
  });

  it("devuelve tokens originales e impersonados, y nombre/rol del objetivo", async () => {
    const result = await impersonateUser("user-1");
    expect(result.original).toEqual({ access_token: "sa-access", refresh_token: "sa-refresh" });
    expect(result.impersonated).toEqual({ access_token: "imp-access", refresh_token: "imp-refresh" });
    expect(result.targetName).toBe("Ana Recepción");
    expect(result.targetRole).toBe("recepcionista");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "ana@clinica.test" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "tok-123", type: "magiclink" });
  });

  it("propaga error si generateLink falla", async () => {
    generateLinkResult = { data: null, error: { message: "boom" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se pudo generar el acceso: boom",
    );
  });

  it("propaga error si verifyOtp falla", async () => {
    verifyOtpResult = { data: { session: null }, error: { message: "otp inválido" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se pudo iniciar sesión: otp inválido",
    );
  });
});
