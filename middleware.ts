import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Excluir archivos estáticos, rutas internas de Next.js y todas las API routes.
    // Las API routes manejan su propio auth; además en local el Edge sandbox no puede
    // hacer fetch a 127.0.0.1, así que excluirlas aquí evita el "fetch failed".
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
