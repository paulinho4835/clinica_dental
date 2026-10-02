// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/app/(dashboard)/agenda/actions", () => ({
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  cancelAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  linkAppointmentPatient: vi.fn(),
  rescheduleAppointment: vi.fn(),
  setAppointmentStatus: vi.fn(),
}));

const { AgendaShell } = await import("@/components/agenda/AgendaShell");

const ANA = { id: "p1", full_name: "Ana Vargas", national_id: "123" };

function renderShell(presetPatient: typeof ANA | null) {
  return render(
    <AgendaShell
      searchPatients={async () => []}
      presetPatient={presetPatient}
      appts={[]}
      date="2026-10-01"
      view="day"
      canWrite
      doctors={[]}
      isAdmin
      myName="Dra. Paz"
      recordatoriosEnabled={false}
      whatsappManualEnabled={false}
      avisoDoctoresEnabled={false}
      currency="Bs"
      onNavigate={vi.fn()}
    />,
  );
}

describe("Agendar cita desde la ficha del paciente", () => {
  it("avisa para quién se está agendando y permite volver a la ficha", () => {
    renderShell(ANA);
    expect(screen.getByText(/Agendando cita para/)).toBeInTheDocument();
    expect(screen.getByText("Ana Vargas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Volver a la ficha/ })).toHaveAttribute(
      "href",
      "/pacientes/p1",
    );
  });

  it("la nueva cita llega con el paciente ya elegido", () => {
    renderShell(ANA);
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva cita" })[0]);
    expect(screen.getByDisplayValue("Ana Vargas · CI 123")).toBeInTheDocument();
  });

  it("se puede quitar el paciente preseleccionado", () => {
    renderShell(ANA);
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(screen.queryByText(/Agendando cita para/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Nueva cita" })[0]);
    expect(screen.queryByDisplayValue("Ana Vargas · CI 123")).not.toBeInTheDocument();
  });

  it("sin paciente preseleccionado no muestra el aviso", () => {
    renderShell(null);
    expect(screen.queryByText(/Agendando cita para/)).not.toBeInTheDocument();
  });
});
