import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { money } from "@/lib/format";

export const runtime = "nodejs";

// Genera el presupuesto en PDF on-demand desde datos estructurados.
// Sin binarios almacenados: el PDF se construye en cada request.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  // RLS limita el plan a la clínica del usuario.
  const { data: plan } = await supabase
    .from("treatment_plans")
    .select(
      "id, status, patient:patients(full_name), clinic:clinics(name, currency), treatment_phases(title, phase_no, treatment_items(tooth_fdi, price, status, custom_name, procedure:procedure_catalog(name)))",
    )
    .eq("id", planId)
    .single();

  if (!plan) return new NextResponse("Plan no encontrado", { status: 404 });

  const clinicName = (plan.clinic as { name?: string } | null)?.name ?? "Clínica";
  const currency = (plan.clinic as { currency?: string } | null)?.currency ?? "Bs";
  const patientName = (plan.patient as { full_name?: string } | null)?.full_name ?? "Paciente";

  type Item = { tooth_fdi: string | null; price: number; status: string; custom_name: string | null; procedure: { name?: string } | null };
  type Phase = { title: string; phase_no: number; treatment_items: Item[] };
  const phases = ((plan.treatment_phases as Phase[]) ?? []).sort((a, b) => a.phase_no - b.phase_no);

  // --- Construcción del PDF ---
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;
  const teal = rgb(0.055, 0.647, 0.643);
  const gray = rgb(0.4, 0.4, 0.4);

  const draw = (text: string, x: number, size = 11, f = font, color = rgb(0, 0, 0)) =>
    page.drawText(text, { x, y, size, font: f, color });

  draw(clinicName, margin, 18, bold, teal);
  y -= 24;
  draw("Presupuesto de tratamiento", margin, 13, bold);
  y -= 18;
  draw(`Paciente: ${patientName}`, margin, 11, font, gray);
  y -= 14;
  draw(`Fecha: ${new Date().toLocaleDateString("es-MX")}`, margin, 11, font, gray);
  y -= 28;

  // Cabecera de tabla
  page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 1, color: teal });
  draw("Procedimiento", margin, 10, bold);
  draw("Diente", margin + 250, 10, bold);
  draw("Estado", margin + 320, 10, bold);
  draw("Precio", width - margin - 60, 10, bold);
  y -= 6;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: gray });
  y -= 16;

  let total = 0;
  const newPageIfNeeded = () => {
    if (y < margin + 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = height - margin;
    }
  };

  for (const ph of phases) {
    newPageIfNeeded();
    draw(ph.title.toUpperCase(), margin, 9, bold, gray);
    y -= 16;
    for (const it of ph.treatment_items ?? []) {
      newPageIfNeeded();
      const price = Number(it.price);
      total += price;
      draw(it.procedure?.name ?? it.custom_name ?? "—", margin, 10);
      draw(it.tooth_fdi ?? "—", margin + 250, 10);
      draw(it.status, margin + 320, 10, font, gray);
      draw(money(price, currency), width - margin - 60, 10);
      y -= 16;
    }
  }

  y -= 8;
  page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 1, color: teal });
  y -= 12;
  draw("TOTAL", margin + 250, 12, bold);
  draw(money(total, currency), width - margin - 60, 12, bold);
  y -= 30;
  draw("Este presupuesto es informativo y puede variar según hallazgos clínicos.", margin, 8, font, gray);

  const bytes = await pdf.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="presupuesto-${planId}.pdf"`,
    },
  });
}
