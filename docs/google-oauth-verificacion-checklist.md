# Checklist: verificación de la app de Google (Calendar sync)

> Estado: preparando con la URL temporal de Vercel para configurar y probar el flujo.
> El envío real a revisión de Google requiere un **dominio propio** (no `*.vercel.app`) — pendiente.

Proyecto GCP: `clinica-dental-whatsapp`
Client ID: `268492106646-mk43u82ap8g8okku80p1r9k85olovoed.apps.googleusercontent.com`
Scope solicitado: `https://www.googleapis.com/auth/calendar.events` (sensitive, no restricted — no requiere evaluación CASA)

## 1. Google Cloud Console → APIs & Services → OAuth consent screen

Ir a: https://console.cloud.google.com/apis/credentials/consent?project=clinica-dental-whatsapp

Rellenar (con la URL temporal de Vercel por ahora):

| Campo | Valor |
|---|---|
| App name | ClinicaDental SaaS |
| User support email | paulinho4835@gmail.com |
| App logo | (opcional por ahora — subir el ícono de la app cuando haya dominio propio) |
| Application home page | `https://clinica-dental-one-vert.vercel.app` |
| Application privacy policy link | `https://clinica-dental-one-vert.vercel.app/privacidad` |
| Application terms of service link | `https://clinica-dental-one-vert.vercel.app/terminos` |
| Authorized domains | ⚠️ no se puede agregar `vercel.app` (está en la Public Suffix List, Google lo rechaza). Dejar vacío o solo con dominio propio cuando exista. |
| Developer contact email | paulinho4835@gmail.com |

**Nota:** sin un dominio propio en "Authorized domains", el botón "Publish App" / enviar a verificación no va a estar disponible o Google lo va a rechazar en la revisión. Todo lo demás (nombre, emails, links, scopes) se puede dejar configurado ya mismo.

## 2. Scopes

En la pestaña "Data Access" / "Scopes": confirmar que el único scope no-básico es `.../auth/calendar.events`. Si Google pide una justificación de scope al enviar a revisión, usar este texto:

> "ClinicaDental SaaS is a practice-management platform for dental clinics. Each dentist can optionally connect their own Google account to sync their patient appointments (created inside our system) to their personal Google Calendar. We request calendar.events (not calendar.readonly or full calendar access) because we only need to create, update, and delete the specific events we create on the dentist's behalf — we never read or modify events the dentist created independently. The dentist can disconnect at any time from Settings, which immediately revokes and deletes the stored tokens."

## 3. Video de demostración (para cuando se envíe a revisión real)

Google pide un video corto (2-5 min) mostrando:
1. Login del odontólogo en la plataforma.
2. Ir a Ajustes → conectar Google Calendar (mostrar la pantalla de consentimiento de Google).
3. Crear o modificar una cita en la agenda de la plataforma.
4. Mostrar que el evento aparece/se actualiza en Google Calendar del odontólogo.
5. Desconectar Google Calendar desde Ajustes y mostrar que ya no sincroniza.

Grabar esto recién cuando el dominio propio esté conectado y el flujo se pruebe sobre esa URL final (Google valida que el video coincida con la app real que se está verificando).

## 4. Dominio propio (bloqueante para el envío final)

Pasos cuando se compre el dominio:
1. Comprar dominio (Vercel Domains, Namecheap, etc.).
2. Conectarlo al proyecto en Vercel (Project → Settings → Domains).
3. Actualizar `NEXT_PUBLIC_SITE_URL` en Vercel env vars al nuevo dominio.
4. En Google Cloud Console → Credentials → el OAuth Client: agregar el nuevo dominio a "Authorized JavaScript origins" y la nueva URL de callback a "Authorized redirect URIs" (mantener las de `localhost`/`vercel.app` mientras se prueba, quitarlas antes de publicar en producción).
5. Verificar el dominio en Google Search Console (Domain property, TXT en DNS).
6. Volver a esta checklist y reemplazar todas las URLs de `vercel.app` por el dominio propio en el paso 1.
7. Enviar a revisión ("Publish App" → "Prepare for verification").

## 5. Mientras tanto (modo Testing actual)

No hay ninguna urgencia funcional: la sync ya está confirmada funcionando end-to-end en modo Testing. La única fricción es que cada cuenta nueva de doctor ve una vez el aviso "Google no verificó esta app" al conectar — click en "Continuar" y sigue funcionando normal. Mientras el número de doctores externos sea bajo (uso interno / pre-lanzamiento), esto es aceptable.
