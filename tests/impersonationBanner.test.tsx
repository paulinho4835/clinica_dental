// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImpersonationBanner } from "@/components/superadmin/ImpersonationBanner";

const setSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { setSession } }),
}));

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  });

  it("no renderiza nada si no hay sesión de impersonación guardada", () => {
    render(<ImpersonationBanner />);
    expect(screen.queryByText(/Viendo como/)).not.toBeInTheDocument();
  });

  it("muestra el nombre guardado y restaura la sesión original al salir", async () => {
    sessionStorage.setItem("sa_impersonation_label", "Ana Recepción (Recepcionista)");
    sessionStorage.setItem(
      "sa_impersonation_return",
      JSON.stringify({ access_token: "sa-a", refresh_token: "sa-r" }),
    );

    render(<ImpersonationBanner />);
    expect(await screen.findByText(/Ana Recepción/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /salir/i }));

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: "sa-a", refresh_token: "sa-r" }),
    );
    expect(sessionStorage.getItem("sa_impersonation_return")).toBeNull();
    expect(sessionStorage.getItem("sa_impersonation_label")).toBeNull();
    expect(window.location.href).toBe("/superadmin");
  });
});
