// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
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

describe("AgendaShell con navegación cliente", () => {
  it("cambia de mes sin navegar nuevamente por Next.js", () => {
    const onNavigate = vi.fn();
    render(
      <AgendaShell
        patients={[]}
        appts={[]}
        date="2026-06-10"
        view="month"
        canWrite={false}
        doctors={[]}
        isAdmin={false}
        myName="Dra. Paz"
        recordatoriosEnabled={false}
        whatsappManualEnabled={false}
        avisoDoctoresEnabled={false}
        currency="Bs"
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onNavigate).toHaveBeenCalledWith("2026-07-10", "month");
  });

  it("cambia de vista conservando la fecha mediante el callback local", () => {
    const onNavigate = vi.fn();
    render(
      <AgendaShell
        patients={[]}
        appts={[]}
        date="2026-06-10"
        view="month"
        canWrite={false}
        doctors={[]}
        isAdmin={false}
        myName="Dra. Paz"
        recordatoriosEnabled={false}
        whatsappManualEnabled={false}
        avisoDoctoresEnabled={false}
        currency="Bs"
        onNavigate={onNavigate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Semana" }));
    expect(onNavigate).toHaveBeenCalledWith("2026-06-10", "week");
  });
});
