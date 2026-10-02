// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsTabs } from "@/components/ui/SettingsTabs";

const TABS = [
  { id: "historia", label: "Historia clínica", content: <p>contenido historia</p> },
  { id: "cuenta", label: "Cuenta", content: <p>contenido cuenta</p> },
];

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("SettingsTabs", () => {
  it("expone pestañas accesibles y marca la activa", () => {
    render(<SettingsTabs tabs={TABS} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Historia clínica" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Cuenta" })).toHaveAttribute("aria-selected", "false");
  });

  it("abre la pestaña indicada al cargar (p. ej. desde ?tab=cuenta)", () => {
    render(<SettingsTabs tabs={TABS} defaultTab="cuenta" />);
    expect(screen.getByText("contenido cuenta")).toBeInTheDocument();
  });

  it("ignora una pestaña inexistente y abre la primera", () => {
    render(<SettingsTabs tabs={TABS} defaultTab="no-existe" />);
    expect(screen.getByText("contenido historia")).toBeInTheDocument();
  });

  it("guarda la pestaña en la URL sin agregar entradas al historial", () => {
    window.history.replaceState(null, "", "/pacientes/1?foo=bar");
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    render(<SettingsTabs tabs={TABS} urlParam="tab" />);
    fireEvent.click(screen.getByRole("tab", { name: "Cuenta" }));
    expect(screen.getByText("contenido cuenta")).toBeInTheDocument();
    expect(replace).toHaveBeenLastCalledWith(null, "", "/pacientes/1?foo=bar&tab=cuenta");
    expect(push).not.toHaveBeenCalled();
  });

  it("sin urlParam no toca la URL", () => {
    const replace = vi.spyOn(window.history, "replaceState");
    render(<SettingsTabs tabs={TABS} />);
    fireEvent.click(screen.getByRole("tab", { name: "Cuenta" }));
    expect(replace).not.toHaveBeenCalled();
  });
});
