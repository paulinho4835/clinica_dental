# Modo "Consultorio compartido entre colegas" — Diseño

**Fecha:** 2026-07-19
**Estado:** aprobado en brainstorming, pendiente de plan de implementación

## Problema

Hoy toda clínica tiene un `admin` que ve todo. Cuando dos o más odontólogos
comparten un consultorio como **pares** (sin jefe), esa super-vista rompe la
confidencialidad: ninguno debe ver la producción, cobros ni gastos del otro.
Separarlos en clínicas distintas no sirve porque **comparten pacientes
(historial clínico único) y agenda/sillones**.

## Decisiones tomadas

- **Comparten:** pacientes (ficha e historial clínico completos) y agenda.
- **Confidencial:** solo lo financiero (cobros, deudas, producción, gastos,
  comisiones). El historial clínico es visible entre colegas.
- **Administración común:** todos los colegas pueden administrar lo común
  (ajustes, invitar usuarios, catálogo de tratamientos). Nadie tiene
  super-vista financiera.
- **Convivencia:** es un **modo por clínica** (flag). Las clínicas normales
  con admin clásico no cambian en nada.
- Inventario y gastos comunes **no** se comparten (fuera de alcance; cada
  colega registra sus propios gastos).

## Modelo de datos

- `clinics.shared_practice boolean not null default false` — el flag del modo.
- `payments.doctor_id uuid references profiles(id)` (nullable) — atribución
  del cobro:
  - Cobro derivado de un trabajo → hereda el `doctor_id` del `doctor_works`.
  - Cobro registrado por un colega → se fuerza su propio `auth.uid()`.
  - Backfill histórico desde trabajos vinculados cuando sea posible; el resto
    queda `null`.
- `expenses.doctor_id uuid references profiles(id)` (nullable) — mismo patrón
  para gastos.
- **Sin rol nuevo.** Los socios usan el rol `colega` existente (own-only en
  `doctor_works` desde la migración 0057). En clínicas compartidas ese rol
  gana permisos de administración común.

## Permisos y RLS

### Helper SQL

`auth_shared_practice()` — mismo patrón que `auth_role()`/`auth_clinic_id()`;
devuelve el flag de la clínica del usuario autenticado.

### Patrón de policy

```sql
(select auth_role()) in ('admin', 'recepcionista')
or not (select auth_shared_practice())
or doctor_id = (select auth.uid())
```

Con `not auth_shared_practice()` las clínicas normales conservan su
comportamiento exacto actual.

### Cambios por tabla

| Tabla | Clínica normal | Clínica compartida |
|---|---|---|
| `doctor_works` | own-only para colega (0057) | sin cambios |
| `payments` | visible a toda la clínica | colega solo ve/inserta `doctor_id = auth.uid()`; filas con `doctor_id null` (históricas) visibles para todos |
| `expenses` | visible a toda la clínica | own-only por `doctor_id`; `null` histórico visible para todos |
| `staff_payments` | gestiona admin | colega solo las suyas (`doctor_id = auth.uid()`) |
| `clinics` (update) | solo admin | también colega |
| `treatments` | solo admin escribe | también colega |
| `appointments` | — | sin cambios: agenda compartida, visible para todos |
| historial clínico (odontograma, evoluciones, anamnesis) | — | sin cambios: compartido por clínica |

### Lado app (`lib/rbac.ts`)

- `can()` y `canSeeNav()` aceptan un flag opcional `sharedPractice`.
- Con el flag, `colega` suma nav: `caja`, `cuentas`, `pagos`, `tratamientos`,
  `ajustes`; y permisos: `expenses:write`, `settings:write`.
- Inventario queda fuera del nav de colega (no se comparte).

### Invitaciones

El server action de invitación acepta también a `colega` cuando
`shared_practice = true`, pero **nunca permite invitar rol `admin`** en una
clínica compartida. Esa es la garantía estructural de que nadie adquiere la
super-vista.

## Pantallas afectadas (modo compartido)

- **Inicio:** tarjetas de ingresos/producción calculadas solo sobre filas
  propias (RLS lo garantiza; revisar que los totales no asuman clínica
  completa).
- **Caja:** accesible para colega; sus cobros y gastos; el insert fija
  `doctor_id` propio.
- **Cuentas:** saldos por paciente derivados solo de trabajos/cobros propios.
- **Pagos:** solo comisiones/pagos de personal propios.
- **Ajustes:** accesible para colega; la gestión de usuarios oculta la opción
  de rol `admin`.
- **Agenda:** sin cambios.

## Casos borde

1. **Activar el modo en clínica existente:** toggle en Ajustes con
   advertencia; el `admin` actual se convierte en `colega`. Queda registrado
   en auditoría.
2. **Cobros históricos sin doctor:** visibles para todos los colegas (ya eran
   visibles antes de activar el modo; no se filtra información nueva).
3. **Recepcionista:** ve toda la clínica (rol staff neutral, necesario para
   cobrar para todos). En modo compartido, al registrar un cobro debe elegir
   obligatoriamente a qué doctor corresponde.
4. **Vapi / agente WhatsApp:** sin cambios; solo crea citas (compartidas), no
   toca datos financieros.
5. **Alta de clínica nueva:** el onboarding ofrece "consultorio compartido
   entre colegas"; el creador entra como `colega`.

## Fuera de alcance

- Inventario/gastos comunes divididos entre socios.
- Agenda opaca (bloques "ocupado" sin detalle) — se decidió visibilidad total.
- Clínicas vinculadas cross-clinic (opción C descartada por complejidad de
  RLS cross-tenant).

## Pruebas clave

- RLS: con dos usuarios `colega` en una clínica `shared_practice`, verificar
  que ninguno lee `payments`/`expenses`/`staff_payments`/`doctor_works` del
  otro (consulta directa, no solo UI).
- Regresión: en una clínica normal (`shared_practice = false`), el
  comportamiento de admin/recepcionista/colega no cambia.
- Invitación: en clínica compartida, intentar invitar rol `admin` falla
  también a nivel server action (no solo UI).
- Backfill: cobros históricos con y sin trabajo vinculado quedan con el
  `doctor_id` esperado.
