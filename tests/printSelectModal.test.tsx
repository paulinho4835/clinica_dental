// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrintSelectModal } from "@/components/treatments/PrintSelectModal";
import type { Work } from "@/components/treatments/TreatmentPlanPanel";

const works: Work[] = [
  { id: "w1", name: "Limpieza", price: 100, done: true, createdAt: "2026-01-01T10:00:00" },
  { id: "w2", name: "Extracción", price: 250, done: false, createdAt: "2026-02-01T10:00:00" },
];

describe("PrintSelectModal", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  it("el botón 'Presupuesto' abre el modal con una fila por tratamiento", () => {
    render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    expect(screen.getByText("Limpieza")).toBeInTheDocument();
    expect(screen.getByText("Extracción")).toBeInTheDocument();
  });

  it("todos los checkboxes empiezan desmarcados y el botón Imprimir empieza deshabilitado", () => {
    render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeDisabled();
  });

  it("marcar un tratamiento habilita Imprimir y actualiza el total", () => {
    render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeEnabled();
    expect(screen.getByTestId("print-select-total")).toHaveTextContent("Bs 100.00");
  });

  it("'Marcar todos' selecciona todos los checkboxes y suma el total completo", () => {
    render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getByText("Marcar todos"));
    screen.getAllByRole("checkbox").forEach((cb) => expect(cb).toBeChecked());
    expect(screen.getByTestId("print-select-total")).toHaveTextContent("Bs 350.00");
  });

  it("Imprimir abre la URL con los IDs seleccionados separados por coma", () => {
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    render(<PrintSelectModal patientId="p1" works={works} currency="Bs" />);
    fireEvent.click(screen.getByRole("button", { name: /presupuesto/i }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getAllByRole("checkbox")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(openSpy).toHaveBeenCalledWith(
      "/pacientes/p1/imprimir?items=w1,w2",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
