// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/agenda" }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));
vi.mock("@/components/SignOutButton", () => ({ SignOutButton: () => <button>Cerrar sesión</button> }));
vi.mock("@/components/ui/ThemeToggle", () => ({ ThemeToggle: () => <button>Tema</button> }));

const { Sidebar } = await import("@/components/Sidebar");
const { FEATURES } = await import("@/lib/features");
const { navItemsFor } = await import("@/lib/nav");

const ALL_ON = Object.fromEntries(FEATURES.map((f) => [f.key, true])) as never;

function renderSidebar(nav: ReturnType<typeof navItemsFor>) {
  render(
    <Sidebar clinicName="Dentica" subtitle="Admin" initials="PA" nav={nav} superadmin={false} />,
  );
  // El contenido se pinta en la barra de escritorio (el drawer móvil está cerrado).
  return screen.getAllByRole("navigation")[0];
}

describe("menú lateral", () => {
  it("con muchos módulos los agrupa por sección", () => {
    const nav = renderSidebar(navItemsFor(ALL_ON, "admin"));
    for (const title of ["Clínica", "Finanzas", "Comunicación", "Administración"]) {
      expect(within(nav).getByText(title)).toBeInTheDocument();
    }
    const labels = within(nav).getAllByRole("link").map((a) => a.textContent);
    expect(labels[0]).toBe("Inicio");
    expect(labels.indexOf("Agenda")).toBeLessThan(labels.indexOf("Reportes"));
    expect(labels.indexOf("Reportes")).toBeLessThan(labels.indexOf("Ajustes"));
    expect(labels.at(-1)).toBe("Ajustes");
  });

  it("con pocos módulos no muestra títulos de sección", () => {
    const nav = renderSidebar(navItemsFor(ALL_ON, "odontologo_general"));
    expect(within(nav).queryByText("Clínica")).not.toBeInTheDocument();
    expect(within(nav).getByText("Agenda")).toBeInTheDocument();
  });

  it("el menú hace scroll propio para que Ajustes y Cerrar sesión nunca queden fuera de pantalla", () => {
    const nav = renderSidebar(navItemsFor(ALL_ON, "admin"));
    expect(nav.className).toContain("overflow-y-auto");
    expect(screen.getAllByText("Cerrar sesión")[0]).toBeInTheDocument();
  });

  it("el módulo de caja se llama Reportes (no compite con Inicio)", () => {
    expect(FEATURES.find((f) => f.key === "caja")?.label).toBe("Reportes");
  });
});

describe("navItemsFor", () => {
  it("todo módulo visible en el menú pertenece a una sección (solo Inicio va sin título)", () => {
    const unsectioned = navItemsFor(ALL_ON, "admin").filter((i) => i.section === null);
    expect(unsectioned.map((i) => i.label)).toEqual(["Inicio"]);
  });

  it("respeta los módulos apagados y el rol", () => {
    const features = { ...(ALL_ON as Record<string, boolean>), inventario: false } as never;
    const labels = navItemsFor(features, "asistente").map((i) => i.label);
    expect(labels).toEqual(["Inicio", "Agenda", "Pacientes"]);
  });
});
