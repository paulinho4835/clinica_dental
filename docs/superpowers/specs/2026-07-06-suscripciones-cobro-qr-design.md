# Cobro de suscripción por QR (Fase 0) — Diseño

**Fecha:** 2026-07-06
**Estado:** propuesta (pendiente de aprobación de Paulo)
**Autor:** Paulo + Claude

## Objetivo

Que el SaaS cobre a las clínicas sin depender de Stripe (que no opera en
Bolivia). Cada mes el sistema genera un cargo por clínica, le muestra al
**administrador** de la clínica un aviso con el QR de pago de Paulo, la clínica
reporta el pago (opcionalmente con comprobante), Paulo confirma desde Superadmin,
y el aviso desaparece hasta el mes siguiente. Si nadie paga, el sistema bloquea
el acceso de forma suave (sin borrar datos).

La capa se diseña **agnóstica al medio de pago**: hoy es QR manual, mañana se
puede enchufar Stripe cambiando solo quién confirma el pago (un webhook en vez
del click de Paulo), sin rehacer la tabla ni los estados.

## No-objetivos (v1)

- Nada de Stripe / tarjetas / pagos automáticos.
- Nada de derivar el monto automáticamente desde los addons (el monto se fija a
  mano por clínica; se puede automatizar después).
- Nada de facturación fiscal (NIT, factura legal boliviana): esto es control
  interno de cobranza, no un documento tributario.
- Nada de prorrateo por cambio de plan a mitad de mes.

---

## Máquina de estados

Una **factura** (`subscription_invoice`) por clínica por mes. Su estado:

```
  (cron día 1)                (admin toca "Ya pagué")      (superadmin confirma)
 ────────────►  pending  ──────────────────────────►  reported  ──────────────►  confirmed
                   ▲                                      │
                   └──────────────────────────────────────┘
                        (superadmin rechaza: "no llegó")
```

- **pending** — cargo generado, sin pagar.
- **reported** — el admin de la clínica dijo "ya pagué" (con o sin comprobante).
  Estado de confianza temporal: NO bloquea, pero espera verificación.
- **confirmed** — Paulo verificó la transferencia. Acceso pleno, sin aviso.

El **bloqueo** es derivado (no es un estado guardado), calculado en cada carga:

| Situación                                             | Resultado                          |
|-------------------------------------------------------|------------------------------------|
| `confirmed`                                           | Acceso pleno, sin aviso            |
| `pending`/`reported` y hoy < `due_date`               | Aviso descartable (banner)         |
| `reported` (cualquier fecha, aún no rechazado)        | Banner "verificando", sin bloqueo  |
| `pending` y hoy ≥ `due_date`                          | **Bloqueo suave** (pantalla)       |

**El control de un reporte falso es humano y está en manos de Paulo:** si la
clínica dice "ya pagué" pero la plata nunca llega, Paulo toca **Rechazar** en
Superadmin → la factura vuelve a `pending` → como ya pasó el `due_date`, el
bloqueo aplica de inmediato. Esto respeta la realidad boliviana (la relación
personal importa; el sistema registra y recuerda, el apretón final lo da Paulo)
sin castigar por default a quien sí pagó.

**Clínica nueva no se bloquea:** el cron solo genera factura para clínicas con
`monthly_amount` configurado. Una clínica sin monto asignado nunca se cobra ni
se bloquea → eso sirve de "trial" natural hasta que Paulo decide empezar a
cobrarle.

---

## Modelo de datos

### Migración `0079_subscription_billing.sql`

```sql
-- Facturas de suscripción: una por clínica por mes. El "estado actual" de una
-- clínica es simplemente su factura más reciente. Mismo patrón que backup_runs:
-- RLS activa, SELECT para la propia clínica (el banner necesita leerla), y NADA
-- de INSERT/UPDATE/DELETE para authenticated → todas las escrituras van por
-- server actions con service-role (que verifican el rol antes de escribir).
create table subscription_invoices (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics(id) on delete cascade,
  period        date not null,              -- primer día del mes cobrado (YYYY-MM-01)
  amount        numeric(12,2) not null,     -- monto en Bs, congelado al generar
  currency      text not null default 'BOB',
  status        text not null default 'pending', -- pending | reported | confirmed
  due_date      date not null,              -- period + días de gracia
  reported_at   timestamptz,                -- cuándo el admin tocó "Ya pagué"
  reported_by   uuid references profiles(id) on delete set null,
  receipt_key   text,                       -- comprobante en R2 (opcional)
  confirmed_at  timestamptz,                -- cuándo Paulo confirmó
  note          text,                       -- nota interna de Paulo
  created_at    timestamptz not null default now(),
  unique (clinic_id, period)                -- idempotencia del cron
);

create index subscription_invoices_clinic_idx
  on subscription_invoices (clinic_id, period desc);

alter table subscription_invoices enable row level security;

-- La clínica LEE sus propias facturas (para el banner / la página /suscripcion).
create policy subinv_select_own on subscription_invoices for select
  using (clinic_id = (select auth_clinic_id()));
-- Sin policies de insert/update/delete: denegado para authenticated.
-- Las escrituras van por server actions con createAdminClient (service-role).

-- Configuración de la plataforma (clave-valor). Aquí vive el QR de pago de Paulo
-- y sus datos bancarios. Solo el service-role la toca (RLS activa, sin policies),
-- salvo el QR que se sirve vía URL firmada desde el server.
create table platform_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table platform_settings enable row level security;
```

### Config por clínica (sin migración — jsonb `clinics.settings`)

Igual que la config de Vapi y `fotos_max`, la config de cobro vive en
`clinics.settings.billing`:

```jsonc
{
  "billing": {
    "monthly_amount": 350,   // Bs/mes. Si falta → la clínica no se cobra.
    "exempt": false,         // true = cortesía / clínica de pruebas, nunca se cobra
    "line_items": "Plan base + Agente IA"  // texto libre opcional que se muestra en el aviso
  }
}
```

### Config de plataforma (fila en `platform_settings`)

```jsonc
// key = "payment"
{
  "qr_r2_key": "platform/payment-qr.png",  // subido por Paulo desde Superadmin
  "instructions": "Banco Ganadera · Cta 123 · Paulo X · o escanea el QR",
  "grace_days": 7                          // días entre period y due_date
}
```

---

## Estructura de archivos

**Crear:**
- `supabase/migrations/0079_subscription_billing.sql` — tablas + RLS (arriba).
- `lib/billing.ts` — tipos, `computeBillingStatus()` (deriva banner/bloqueo desde
  la factura + fecha), lectura/escritura de `clinics.settings.billing` y
  `platform_settings`. Lógica pura → testeable con Vitest.
- `app/api/cron/subscriptions/route.ts` — genera las facturas del mes.
- `app/(dashboard)/suscripcion/page.tsx` — página del admin de clínica: estado
  actual, QR, "Ya pagué", subir comprobante, historial.
- `app/(dashboard)/suscripcion/actions.ts` — `reportPayment()`,
  `presignReceiptUpload()` (admin de la clínica).
- `components/billing/SubscriptionBanner.tsx` — banner descartable (client).
- `components/billing/SubscriptionBlocked.tsx` — pantalla de bloqueo suave.
- `app/(dashboard)/superadmin/cobranza/page.tsx` — panel de cobranza de Paulo.
- `app/(dashboard)/superadmin/billing-actions.ts` — `confirmPayment()`,
  `rejectPayment()`, `setClinicBilling()`, `uploadPlatformQr()` (superadmin).
- `components/superadmin/CobranzaPanel.tsx` — semáforo del mes + confirmar/rechazar.
- `components/superadmin/ClinicBillingForm.tsx` — fijar monto/exento por clínica.
- `tests/billing.test.ts` — tests de `computeBillingStatus`.

**Modificar:**
- `app/(dashboard)/layout.tsx` — tras los gates existentes (cuenta desactivada,
  clínica suspendida, términos), agregar el gate de suscripción: 1 query de la
  factura más reciente; si bloqueo → `SubscriptionBlocked`; si aviso →
  `SubscriptionBanner` junto a los otros hosts.
- `lib/features.ts` — nuevo feature `suscripcion` **core-oculto**: no es un addon
  que se apague, es transversal. (Alternativa: no tocar features y gatear siempre;
  ver "Decisiones".)
- `vercel.json` — nuevo cron `"/api/cron/subscriptions"`, `"0 12 1 * *"`
  (08:00 Bolivia del día 1).
- `app/(dashboard)/superadmin/page.tsx` — enlace/acceso a `/superadmin/cobranza`
  y (opcional) una métrica "Recaudado este mes".

---

## Flujos

### 1. Generación mensual (cron día 1)

`GET /api/cron/subscriptions` (protegido con `CRON_SECRET`, igual que backup):

1. Lee todas las clínicas activas con `settings.billing.monthly_amount > 0` y
   `exempt !== true`.
2. Para cada una, `insert ... on conflict (clinic_id, period) do nothing` con
   `period = primer día del mes actual (Bolivia)`, `amount = monthly_amount`,
   `due_date = period + grace_days`.
3. Idempotente: si el cron corre dos veces, el `unique (clinic_id, period)` evita
   duplicados. Devuelve `{ generated, skipped }`.

> Opcional (no v1): además del banner in-app, disparar un mensaje por
> whatsapp-service al admin con el QR. El banner es el canal principal porque no
> depende de que Baileys esté conectado.

### 2. La clínica ve el aviso y reporta (admin)

- El layout calcula el estado y muestra `SubscriptionBanner` (descartable por
  sesión; reaparece al recargar mientras siga pendiente). El color escala según
  cercanía al `due_date`: discreto al inicio, ámbar cerca del vencimiento.
- El banner enlaza a `/suscripcion`: muestra monto, detalle (`line_items`), el QR
  (URL firmada de R2), instrucciones, y botón **"Ya pagué"**.
- Opción de **subir comprobante**: mismo patrón que fotos —
  `presignReceiptUpload()` (server action, admin-only) mina una URL PUT firmada,
  el navegador sube directo a R2 bajo `receipts/{clinic_id}/{invoice_id}.<ext>`,
  y luego `reportPayment(invoiceId, receiptKey)` guarda la referencia.
- `reportPayment()` verifica `getProfile().role === 'admin'` y que la factura sea
  de su `clinicId`; luego, con service-role, pone `status='reported'`,
  `reported_at=now()`, `reported_by`, `receipt_key`. El banner pasa a
  "Gracias, estamos verificando tu pago".

### 3. Paulo confirma (superadmin)

- `/superadmin/cobranza`: semáforo del mes — por clínica: monto, estado
  (Pendiente / Reportado / Confirmado), comprobante (miniatura vía URL firmada si
  hay), y botones **Confirmar** / **Rechazar**. Totales: recaudado vs esperado.
- `confirmPayment(invoiceId)` → `status='confirmed'`, `confirmed_at=now()`.
- `rejectPayment(invoiceId, note?)` → vuelve a `status='pending'` (si ya venció,
  el bloqueo aplica de inmediato).
- `setClinicBilling(clinicId, {monthly_amount, exempt, line_items})` → escribe en
  `clinics.settings.billing` (patrón de `setPhotoQuota`).
- `uploadPlatformQr()` → sube el QR de Paulo a R2 (`platform/payment-qr.<ext>`) y
  guarda la key + instrucciones en `platform_settings`.

### 4. Bloqueo suave (si nadie paga)

- Cuando `pending` y hoy ≥ `due_date`: el layout renderiza `SubscriptionBlocked`
  en vez del dashboard (mismo mecanismo que "Cuenta suspendida").
- **Solo el admin** ve el QR + "Ya pagué" en la pantalla de bloqueo. Los demás
  roles (recepción, doctores) ven "El acceso está en pausa. Contacta al
  administrador de tu clínica" — el tema plata es entre Paulo y el dueño.
- **Nunca se borran datos.** Al confirmar el pago, el acceso vuelve intacto.

---

## Seguridad

- **Escrituras a `subscription_invoices` nunca por el cliente.** La tabla no
  tiene policies de insert/update/delete → RLS las deniega para `authenticated`.
  Todo cambio pasa por server actions que verifican el rol y usan service-role
  scoping explícito por `clinic_id` (se evita el hueco de que la policy
  `tenant_isolation` `for all` permitiría a cualquier miembro poner
  `status='confirmed'`; por eso esta tabla define solo policy de SELECT).
- `reportPayment` es admin-only y solo puede llevar a `reported` (nunca a
  `confirmed`). `confirm`/`reject` son superadmin-only.
- Comprobantes en bucket privado R2; se ven solo vía URL firmada de corta
  duración (igual que las fotos de pacientes).
- El QR de la plataforma se sirve al admin de la clínica vía URL firmada generada
  en el server; no se expone la key ni se hace público el bucket.

## Rendimiento

- El gate agrega **1 query** por carga de dashboard (`select ... where clinic_id
  order by period desc limit 1`), solo para no-superadmin. Barato e indexado.
  Se puede cachear por request con `cache()` como `getProfile`.

## Testing

- `tests/billing.test.ts`: `computeBillingStatus()` con casos —
  confirmed→sin aviso; pending antes de due→banner; pending después de due→
  bloqueo; reported→banner sin bloqueo; sin factura→sin aviso; exento→sin aviso.
- Cron: probar idempotencia (dos corridas no duplican) contra Supabase local.
- Manual: fijar monto a una clínica de prueba, correr el cron a mano, ver banner,
  reportar con comprobante, confirmar desde superadmin, verificar que el aviso
  desaparece; probar rechazo → bloqueo.

---

## Decisiones abiertas para Paulo

1. **¿Feature flag o siempre activo?** Propongo gatear **siempre** (no como addon
   apagable): si una clínica no tiene monto, no se cobra igual, así que no hace
   falta un toggle. Más simple. (Alternativa: feature `suscripcion` para poder
   desactivar todo el módulo en una clínica concreta.)
2. **Días de gracia por defecto:** propongo **7**. ¿Otro número?
3. **Comprobante:** ¿obligatorio u opcional al reportar? Propongo **opcional**
   (menos fricción; Paulo igual verifica en el banco).
4. **Aviso por WhatsApp además del banner:** ¿v1 o después? Propongo **después**
   (el banner in-app resuelve el 90% y no depende de Baileys conectado).
5. **Bloqueo:** ¿pantalla completa dura, o dejar navegar en modo solo-lectura?
   Propongo **bloqueo completo** con datos intactos (más simple y más efectivo
   para cobrar; el respaldo semanal ya protege los datos).

---

## Fases de implementación (para el plan posterior)

1. **Datos + lógica:** migración 0079 + `lib/billing.ts` + tests. (1 tarea)
2. **Cron de generación** + prueba de idempotencia. (1 tarea)
3. **Lado clínica:** gate en layout + banner + página `/suscripcion` + reportar +
   comprobante. (2–3 tareas)
4. **Lado Paulo:** `/superadmin/cobranza` + confirmar/rechazar + fijar monto +
   subir QR. (2 tareas)
5. **Pulido:** semáforo con totales, escalado de color del banner, textos.

Nada de esto toca el commit del agente-IA ni requiere Stripe. Enchufar Stripe
después = agregar un webhook que llame al mismo `confirmPayment` interno; la
tabla y los estados no cambian.
