// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VoiceReviewDialog } from "@/components/odontogram/VoiceReviewDialog";

const operation = { action: "set_surface" as const, tooth: "46", surface: "O" as const, condition: "caries" as const };

describe("VoiceReviewDialog", () => {
  it("permite descartar y aplicar cambios seguros", () => {
    const onApply = vi.fn();
    const onRemove = vi.fn();
    render(<VoiceReviewDialog transcript="caries en 46" operations={[operation]} uncertainties={[]} warnings={[]} onApply={onApply} onRemove={onRemove} onDismissUncertainty={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Diente 46: Caries en cara oclusal.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onRemove).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByRole("button", { name: "Aplicar al odontograma" }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("bloquea aplicar mientras haya incertidumbres", () => {
    render(<VoiceReviewDialog transcript="en el treinta y" operations={[operation]} uncertainties={["No se entiende el diente"]} warnings={[]} onApply={vi.fn()} onRemove={vi.fn()} onDismissUncertainty={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Aplicar al odontograma" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("No se entiende el diente")).toBeTruthy();
  });

  it("descartar una incertidumbre la quita de la lista (vía callback)", () => {
    const onDismissUncertainty = vi.fn();
    render(<VoiceReviewDialog transcript="en el treinta y" operations={[operation]} uncertainties={["No se entiende el diente"]} warnings={[]} onApply={vi.fn()} onRemove={vi.fn()} onDismissUncertainty={onDismissUncertainty} onCancel={vi.fn()} />);
    // El bloque de incertidumbres se renderiza antes que la lista de operaciones,
    // por eso el primer botón "Descartar" en el DOM es el de la incertidumbre.
    fireEvent.click(screen.getAllByRole("button", { name: "Descartar" })[0]);
    expect(onDismissUncertainty).toHaveBeenCalledWith(0);
  });
});
