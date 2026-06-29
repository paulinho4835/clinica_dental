import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rutas que NO requieren sesión. Todo lo demás exige estar autenticado.
// Los formularios que el paciente abre desde un enlace de WhatsApp se identifican
// solo por un token de un solo uso, validado en el server action: "/h" (historial),
// "/r" (calificación del trabajo) y "/c" (confirmación de cita del recordatorio).
// "/terminos" y "/privacidad" son los documentos legales públicos. "/recuperar" y
// "/restablecer" son el flujo de recuperación de contraseña, y "/auth/callback"
// canjea el código del correo por sesión: todos deben ser accesibles SIN sesión.
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/h",
  "/r",
  "/c",
  "/terminos",
  "/privacidad",
  "/recuperar",
  "/restablecer",
  "/auth/callback",
];

// Páginas de autenticación: si ya hay sesión, redirigir al panel. NO incluye
// "/h" — el staff (logueado) debe poder abrir el formulario del paciente para
// previsualizarlo sin que lo rebote a /agenda. Tampoco "/restablecer": un admin
// con sesión de recuperación debe poder completar el cambio de contraseña.
const AUTH_PAGES = ["/login", "/signup"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/api/"); // Las API routes manejan su propio auth.

  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si ya tiene sesión y va a /login o /signup, redirigir al panel.
  if (user && AUTH_PAGES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/agenda";
    return NextResponse.redirect(url);
  }

  return response;
}
