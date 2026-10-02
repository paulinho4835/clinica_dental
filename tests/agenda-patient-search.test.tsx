// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PatientPicker } from "@/components/agenda/PatientPicker";
import {
  createPatientSearch,
  patientOptionFromAppt,
  type PatientOption,
} from "@/lib/agenda/patientSearch";
import type { MonthAppt } from "@/components/agenda/apptHelpers";

const migration = resolve(process.cwd(), "supabase/migrations/0126_search_agenda_patients.sql");
const sql = existsSync(migration) ? readFileSync(migration, "utf8").toLowerCase() : "";

const JOSE: PatientOption = { id: "p1", full_name: "José Pérez", national_id: "4835946" };
const ANA: PatientOption = { id: "p2", full_name: "Ana Vargas", national_id: null };

describe("search_agenda_patients (SQL)", () => {
  it("busca en el servidor sin acentos, por palabras y con tope de resultados", () => {
    expect(sql).toContain("function public.search_agenda_patients(");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("public.auth_clinic_id()");
    expect(sql).toContain("immutable_unaccent");
    expect(sql).toContain("search_text");
    expect(sql).toContain("limit least(");
  });

  it("mantiene la regla de visibilidad de pacientes por doctor", () => {
    expect(sql).toContain("p_doctor_id is null");
    expect(sql).toContain("a.dentist_name = p_dentist_name");
    expect(sql).toContain("w.doctor_id = p_doctor_id");
  });

  it("solo se puede ejecutar como usuario autenticado", () => {
    expect(sql).toContain("revoke all on function public.search_agenda_patients(text, integer, text, uuid)");
    expect(sql).toContain("grant execute on function public.search_agenda_patients(text, integer, text, uuid)");
  });
});

describe("createPatientSearch", () => {
  it("recepción y admin buscan en toda la clínica", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [JOSE], error: null });
    const search = createPatientSearch({ rpc } as never);
    await expect(search(" jose ")).resolves.toEqual([JOSE]);
    expect(rpc).toHaveBeenCalledWith("search_agenda_patients", {
      p_query: "jose",
      p_limit: 8,
      p_dentist_name: null,
      p_doctor_id: null,
    });
  });

  it("un doctor solo busca entre los pacientes que puede ver", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const search = createPatientSearch({ rpc } as never, {
      doctor: { dentistName: "Dra. Paz", doctorId: "u1" },
    });
    await search("ana");
    expect(rpc).toHaveBeenCalledWith("search_agenda_patients", {
      p_query: "ana",
      p_limit: 8,
      p_dentist_name: "Dra. Paz",
      p_doctor_id: "u1",
    });
  });

  it("falla de forma visible si la búsqueda da error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(createPatientSearch({ rpc } as never)("ana")).rejects.toThrow("boom");
  });
});

describe("patientOptionFromAppt", () => {
  const appt = (overrides: Partial<MonthAppt>): MonthAppt => ({
    id: "a1",
    starts_at: "2026-10-01T13:00:00Z",
    ends_at: null,
    status: "scheduled",
    dentist_name: null,
    patient_id: null,
    patient_name: null,
    reason: null,
    consult_price: null,
    deposit: null,
    deposit_method: null,
    patients: null,
    ...overrides,
  });

  it("precarga el paciente vinculado con los datos que trae la cita", () => {
    expect(
      patientOptionFromAppt(
        appt({ patient_id: "p9", patients: { full_name: "Zulema Zárate", national_id: "999" } }),
      ),
    ).toEqual({ id: "p9", full_name: "Zulema Zárate", national_id: "999" });
  });

  it("no precarga nada si la cita es una consulta rápida sin paciente", () => {
    expect(patientOptionFromAppt(appt({ patient_name: "Sin ficha" }))).toBeNull();
    expect(patientOptionFromAppt(undefined)).toBeNull();
  });
});

describe("PatientPicker con búsqueda en servidor", () => {
  function renderPicker(searchPatients: (q: string) => Promise<PatientOption[]>) {
    const onSelect = vi.fn();
    render(<PatientPicker searchPatients={searchPatients} selected={null} onSelect={onSelect} />);
    return { onSelect, input: screen.getByPlaceholderText("Buscar por nombre o CI…") };
  }

  it("al enfocar muestra las primeras sugerencias", async () => {
    const search = vi.fn().mockResolvedValue([ANA]);
    const { input } = renderPicker(search);
    fireEvent.focus(input);
    expect(await screen.findByText("Ana Vargas")).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith("");
  });

  it("busca lo que se escribe y permite elegir un resultado", async () => {
    const search = vi.fn().mockImplementation(async (q: string) => (q ? [JOSE, ANA] : []));
    const { input, onSelect } = renderPicker(search);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "jose" } });
    const option = await screen.findByText("José Pérez");
    expect(search).toHaveBeenLastCalledWith("jose");
    fireEvent.mouseDown(option);
    expect(onSelect).toHaveBeenLastCalledWith(JOSE);
  });

  it("avisa cuando no hay coincidencias", async () => {
    const { input } = renderPicker(vi.fn().mockResolvedValue([]));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(await screen.findByText("Sin pacientes que coincidan.")).toBeInTheDocument();
  });

  it("avisa si la búsqueda falla en vez de decir que no hay pacientes", async () => {
    const { input } = renderPicker(vi.fn().mockRejectedValue(new Error("red caída")));
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ana" } });
    expect(await screen.findByText("No se pudo buscar pacientes. Intenta de nuevo.")).toBeInTheDocument();
    expect(screen.queryByText("Sin pacientes que coincidan.")).not.toBeInTheDocument();
  });

  it("ignora respuestas viejas que llegan después de la búsqueda actual", async () => {
    let resolveOld: (rows: PatientOption[]) => void = () => {};
    const search = vi.fn().mockImplementation((q: string) => {
      if (q === "an") return new Promise<PatientOption[]>((r) => { resolveOld = r; });
      if (q === "ana") return Promise.resolve([ANA]);
      return Promise.resolve([]);
    });
    const { input } = renderPicker(search);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "an" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("an"));
    fireEvent.change(input, { target: { value: "ana" } });
    expect(await screen.findByText("Ana Vargas")).toBeInTheDocument();
    await act(async () => resolveOld([JOSE]));
    expect(screen.queryByText("José Pérez")).not.toBeInTheDocument();
  });
});
