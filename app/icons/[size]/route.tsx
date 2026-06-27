import { renderIconPng } from "@/lib/brandIcon";

// Íconos PNG del manifest PWA en los tamaños que pide Chrome para "Instalar app".
// Se generan a partir del SVG de marca (ver lib/brandIcon), así no hay que
// commitear binarios. Rutas: /icons/192 y /icons/512.
const ALLOWED = new Set([192, 512]);

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const n = Number(size);
  if (!ALLOWED.has(n)) return new Response("Not found", { status: 404 });
  return renderIconPng(n);
}
