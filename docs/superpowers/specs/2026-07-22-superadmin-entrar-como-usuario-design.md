# Superadmin: "Entrar como este usuario" — Design

## Objetivo

El superadmin (Paulo) necesita reproducir bugs que reportan admins/recepcionistas/doctores
de una clínica ("a mí me funciona como admin, pero la recepcionista dice que no"). Hoy la
única forma es pedir credenciales o adivinar por rol. Se necesita poder ver el sistema
**exactamente como esa persona real lo ve** (su agenda, sus pacientes asignados, sus
permisos), sin conocer su contraseña y sin que la clínica se entere.

## Alcance

- Impersonar una cuenta real de staff de una clínica (cualquier rol: admin,
  recepcionista, colega, odontólogo, especialista, asistente).
- **Nunca** permite impersonar a otro superadmin (usuarios en `platform_admins`).
- **No** modifica la contraseña real de la persona — su login normal sigue funcionando
  exactamente igual mientras el superadmin la usa.
- **No** deja rastro en `audit_log` ni en ninguna tabla visible por la clínica. Decisión
  explícita del usuario: "la clínica no sabe que puedo ingresar a ver su sistema".
- No requiere ninguna migración de base de datos — usa mecanismos ya existentes de
  Supabase Auth (Admin API) más una tabla ya existente (`profiles`, `platform_admins`).

## Mecanismo de autenticación

Se usa un **magic link generado del lado del servidor**, canjeado inmediatamente por una
sesión — sin enviar ningún email y sin tocar la contraseña real:

1. `admin.auth.admin.generateLink({ type: "magiclink", email })` genera un token
   (`hashed_token`) para el email real del usuario objetivo. Esta llamada **no envía
   ningún correo** — solo genera el token.
2. `serverClient.auth.verifyOtp({ token_hash, type: "magiclink" })` canjea ese token por
   una sesión real de esa cuenta.
3. Se devuelven al navegador tanto los tokens de la sesión **original** (superadmin) como
   los de la sesión **impersonada**, para que el cliente pueda fijar la nueva sesión y
   más tarde restaurar la original.

Se descarta la alternativa de sobrescribir la contraseña temporal (patrón ya existente
pero huérfano en `app/api/superadmin/preview/[clinicId]/route.ts`) porque invalidaría la
contraseña real de la persona cada vez que se use.

## Por qué el "volver a superadmin" vive en el navegador, no en el servidor

El mecanismo existente de "vista previa de clínica" (`enterClinic`/`exitClinic`) mantiene
el mismo `auth.uid()` del superadmin — solo cambia su fila en `profiles` (clinic_id/role).
Por eso el layout puede detectar el modo vista previa con una simple consulta:
`isPreview = superadmin && !!profile`.

Impersonar una cuenta real es distinto: `auth.uid()` pasa a ser literalmente el de esa
persona. Ninguna consulta del servidor puede ya distinguir "esta sesión es en realidad un
superadmin disfrazado" — esa información solo existe en el navegador que hizo el cambio.
Por eso el banner de "volver" se detecta y controla 100% del lado del cliente, vía
`sessionStorage` (no `localStorage`, para que los tokens guardados no sobrevivan más allá
de la pestaña/sesión del navegador).

## Componentes

### `impersonateUser(targetUserId)` — nueva server action

Ubicación: `app/(dashboard)/superadmin/actions.ts` (junto a `enterClinic`/`exitClinic`).

```typescript
export async function impersonateUser(targetUserId: string): Promise<{
  original: { access_token: string; refresh_token: string };
  impersonated: { access_token: string; refresh_token: string };
  targetName: string;
  targetRole: string;
}>
```

Pasos:
1. `assertSuperadmin()`.
2. Lee la sesión actual (`serverClient.auth.getSession()`) — son los tokens "de vuelta".
3. Verifica que `targetUserId` NO esté en `platform_admins` — si lo está, lanza error
   ("No se puede entrar como otro superadmin").
4. Lee `profiles` del objetivo (`full_name`, `role`) — si no existe, error ("Usuario no
   encontrado").
5. `admin.auth.admin.getUserById(targetUserId)` para obtener su email real.
6. `generateLink` + `verifyOtp` como se describe arriba.
7. Devuelve ambos pares de tokens + nombre/rol del objetivo.

No escribe nada en ninguna tabla. No hay `revalidatePath` porque no cambia datos.

### `ImpersonateUserButton` — nuevo componente cliente

Ubicación: `components/superadmin/ImpersonateUserButton.tsx`, usado dentro de
`ClinicUsers.tsx` (una fila ya existente por usuario, con nombre/email/rol).

```tsx
"use client";
export function ImpersonateUserButton({ userId }: { userId: string }) {
  // onClick:
  // 1. const result = await impersonateUser(userId)
  // 2. sessionStorage.setItem("sa_impersonation_return", JSON.stringify(result.original))
  // 3. sessionStorage.setItem("sa_impersonation_label", `${result.targetName} (${roleLabel(result.targetRole)})`)
  // 4. await createClient().auth.setSession(result.impersonated)
  // 5. window.location.href = "/agenda"
}
```

Icono `LogIn` (mismo que `EnterClinicButton`), título "Entrar como este usuario".
Deshabilitado si `userId` está en `platform_admins` (no debería listarse ahí de todas
formas — los superadmins no aparecen en `ClinicUsers`).

### `ImpersonationBanner` — nuevo componente cliente

Ubicación: `components/superadmin/ImpersonationBanner.tsx`, montado en
`app/(dashboard)/layout.tsx` de forma **incondicional** (se auto-detecta en el cliente,
no depende de ningún dato del servidor — a diferencia de `ExitPreviewBanner`, que sigue
usando `isPreview` calculado en el servidor para el mecanismo existente).

```tsx
"use client";
export function ImpersonationBanner() {
  // useEffect en mount: lee sessionStorage.getItem("sa_impersonation_return")
  // si existe, guarda en state y renderiza el banner; si no, renderiza null.
  // onClick "Salir":
  // 1. const original = JSON.parse(sessionStorage.getItem("sa_impersonation_return"))
  // 2. sessionStorage.removeItem("sa_impersonation_return")
  // 3. sessionStorage.removeItem("sa_impersonation_label")
  // 4. await createClient().auth.setSession(original)
  // 5. window.location.href = "/superadmin"
}
```

Mismo estilo visual que `ExitPreviewBanner` (franja de color, ícono `Eye`), texto:
"Viendo como **{label}** — no se registra en ningún lado".

### Limpieza al cerrar sesión normal

El botón de "Cerrar sesión" existente (en `Sidebar.tsx` o donde esté el logout) debe
limpiar también `sessionStorage.removeItem("sa_impersonation_return")` y
`sa_impersonation_label` — si no, un cierre de sesión normal mientras esas claves siguen
en la pestaña podría mostrar el banner de "volver" de forma incorrecta en un login
posterior en la misma pestaña.

## Seguridad

- `assertSuperadmin()` en la server action (mismo guard que todas las acciones de
  `superadmin/actions.ts`).
- Bloqueo explícito de impersonar a otro `platform_admins`.
- No se envía ningún email al usuario objetivo (solo se genera y canjea el token
  server-side).
- No se modifica la contraseña del usuario objetivo.
- No se escribe en `audit_log` ni en ninguna tabla — decisión explícita del usuario.

## Casos límite (documentados, no bloqueantes)

- **Cierra la pestaña sin usar "Salir":** se pierde el camino de regreso automático (los
  tokens vivían solo en `sessionStorage` de esa pestaña). El superadmin simplemente
  vuelve a iniciar sesión normal con su propia cuenta — nunca queda bloqueado.
- **Cuenta objetivo desactivada (`profiles.active = false`):** el layout ya bloquea con
  la pantalla de "Cuenta desactivada" para cualquier no-superadmin — como ahora
  `auth.uid()` es el del usuario real, este bloqueo aplica normalmente. Esto es
  intencional: replica exactamente lo que esa persona ve.
- **Impersonar dentro de una clínica suspendida:** mismo razonamiento — el layout ya
  bloquea el acceso si `clinic.active === false` para no-superadmins.

## Testing

- Test de la server action con mocks de Supabase Admin: bloquea si el objetivo es
  platform_admin; devuelve ambos pares de tokens correctamente; propaga error si
  `generateLink`/`verifyOtp` fallan.
- Test manual (no automatizable sin credenciales reales de Supabase): entrar como un
  usuario recepcionista de una clínica de prueba, confirmar que el rol/menú visto
  corresponde al real, y que "Salir" restaura la sesión de superadmin sin re-login.
