// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImpersonateUserButton } from "@/components/superadmin/ImpersonateUserButton";

const { impersonateUser } = vi.hoisted(() => ({
  impersonateUser: vi.fn(),
}));

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ auth: { setSession: vi.fn() } })),
}));

vi.mock("@/app/(dashboard)/superadmin/actions", () => ({ impersonateUser }));
vi.mock("@/lib/supabase/client", () => ({ createClient }));

describe("ImpersonateUserButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    impersonateUser.mockResolvedValue({
      original: { access_token: "sa-a", refresh_token: "sa-r" },
      impersonated: { access_token: "imp-a", refresh_token: "imp-r" },
      targetName: "Ana Recepción",
      targetRole: "recepcionista",
    });
  });

  it("guarda la sesión original, fija la impersonada y redirige a /agenda", async () => {
    const mockSetSession = vi.fn();
    createClient.mockReturnValue({ auth: { setSession: mockSetSession } } as any);

    render(<ImpersonateUserButton userId="user-1" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(mockSetSession).toHaveBeenCalledWith({ access_token: "imp-a", refresh_token: "imp-r" }),
    );

    expect(impersonateUser).toHaveBeenCalledWith("user-1");
    expect(JSON.parse(sessionStorage.getItem("sa_impersonation_return")!)).toEqual({
      access_token: "sa-a",
      refresh_token: "sa-r",
    });
    expect(sessionStorage.getItem("sa_impersonation_label")).toBe(
      "Ana Recepción (Recepcionista)",
    );
    expect(window.location.href).toBe("/agenda");
  });
});
