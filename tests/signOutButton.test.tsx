// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutButton } from "@/components/SignOutButton";

const signOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));
// SignOutButton llama useRouter() incondicionalmente; fuera de un
// AppRouterContext real (como en jsdom/testing-library) lanza un invariant.
// Se mockea aquí solo para permitir el render en el test — no cambia el
// comportamiento que se está probando (limpieza de sessionStorage).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  });

  it("limpia las claves de impersonación al cerrar sesión", async () => {
    sessionStorage.setItem("sa_impersonation_return", "{}");
    sessionStorage.setItem("sa_impersonation_label", "alguien");

    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(sessionStorage.getItem("sa_impersonation_return")).toBeNull();
    expect(sessionStorage.getItem("sa_impersonation_label")).toBeNull();
    expect(window.location.href).toBe("/login");
  });
});
