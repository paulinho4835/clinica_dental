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
    // También se excluyen los assets PWA públicos sin extensión de archivo:
    // manifest.webmanifest y /icons/* (los PNG generados). Si no, el middleware
    // los redirige a /login y Chrome no puede leerlos para "Instalar app".
    // /monitoring es el tunnelRoute de Sentry: debe ser público para que los
    // eventos del navegador no se rediretan a /login y se pierdan.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|monitoring|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
