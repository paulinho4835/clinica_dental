# Pagos a personal — Rediseño maestro-detalle

**Fecha:** 2026-07-14
**Estado:** Aprobado (diseño validado con Paulo en sesión)

## Problema

El módulo `/pagos` (Pagos a personal) confunde al admin de la clínica:

1. La barra de progreso dentro de "Trabajos pendientes de comisión" muestra
   **lo que el paciente pagó del tratamiento** (ej. Bs 300/500), no lo que se
   le debe al doctor. Sin rótulo, el admin no sabe qué representa.
2. Los nombres de pacientes salen truncados ("Angela Sdenka Roja...").
3. Todo está apilado en una sola página larga: formulario global, tarjetas,
   resumen por empleado, filtros y tabla — sin una vista clara "por persona".

El módulo `/cuentas` (Cuentas de pacientes) no tiene este problema: usa un
layout maestro-detalle (lista lateral con buscador → detalle de la persona
con tarjetas de totales, formulario e historial) que el admin sí entiende.

## Solución

Rediseñar `/pagos` con el **mismo layout maestro-detalle de `/cuentas`**,
manteniendo intacta toda la funcionalidad actual (comisiones, abonos
parciales, adelantos, desembolso, impresión, recepcionistas sin cuenta).

Es un cambio **solo de UI**: sin migraciones, sin cambios en server actions
(`actions.ts` y `work-actions.ts` quedan intactos).

## Layout

Dos paneles, patrón idéntico a `app/(dashboard)/cuentas/page.tsx`:

- **Panel izquierdo** (`w-full md:w-72 md:shrink-0`): buscador + lista de
  personas.
- **Panel derecho** (`min-w-0 flex-1`): detalle de la persona seleccionada.
- **Móvil:** al seleccionar a alguien, la lista se oculta y aparece el enlace
  "← Volver a la lista" (mismas clases condicionales que cuentas).
- **Sin selección:** el panel derecho muestra el placeholder
  "Selecciona a una persona para ver sus pagos" (caja `h-64` centrada, como
  cuentas). Las tarjetas globales del mes y el "Resumen por empleado"
  actuales **se eliminan** — la vista rápida la da el badge de pendiente en
  la lista.

## Panel izquierdo

- **Buscador** por nombre: form GET con param `q` (igual que cuentas).
  Filtra server-side con `ilike` sobre el nombre.
- **Lista unificada de personas:**
  - Empleados con cuenta (`profiles` de la clínica, excluyendo platform
    admins) — igual que el dropdown actual.
  - Recepcionistas sin cuenta (`clinic_receptionists` activas).
- **Cada fila:** nombre completo, rol debajo en texto pequeño (usar
  `ROLE_LABEL` existente), y si la persona tiene comisiones sin pagar, un
  badge ámbar a la derecha: `Bs 852 pendiente`.
- **Selección vía URL:** `/pagos?p=p:<uuid>` (perfil) o `/pagos?p=r:<uuid>`
  (recepcionista) — el mismo esquema de IDs compuestos que hoy usa el filtro
  de empleado. El param `q` se preserva al navegar (patrón `qParam` de
  cuentas).
- **Orden:** alfabético por nombre; perfiles primero, luego recepcionistas
  (mismo orden que el dropdown actual).

### Cálculo del badge "pendiente"

Query agregada server-side sobre `doctor_works` de la clínica: trabajos con
`commission_amount + lab_commission_amount > commission_paid_amount`
(comisión no saldada), agrupados por `doctor_id`, sumando el restante.
Con aislamiento explícito por `clinic_id` (regla del proyecto: no depender
solo de RLS). Las recepcionistas sin cuenta no ganan comisión → nunca llevan
badge.

## Panel derecho (persona seleccionada)

En orden vertical:

### 1. Encabezado
Nombre completo + rol (con `ROLE_LABEL`). En móvil, encima va el enlace
"← Volver a la lista".

### 2. Tarjetas de resumen (componente `Stat` existente)
- **Comisión pendiente** (ámbar): suma de comisiones no saldadas de la
  persona. Solo para roles con comisión (`COMMISSION_ROLES`); para
  recepcionistas esta tarjeta no se muestra.
- **Pagado — {mes seleccionado}** (verde): suma de `staff_payments`
  desembolsados de la persona en el mes del filtro (label dinámico, ej.
  "Pagado — julio de 2026" o "Pagado — Todos los meses").
- **Pendiente de desembolso** (ámbar): suma de pagos registrados no
  desembolsados de la persona. Solo si > 0.

### 3. Trabajos pendientes de comisión
Solo para personas con rol en `COMMISSION_ROLES` (odontólogo, especialista,
colega, admin). Misma lógica actual de `StaffPaymentForm` (grupos por ítem
de plan, abonos parciales, "Seleccionar todos", validación de máximos), con
estos cambios de presentación:

- Ancho completo del panel derecho — **nombre del paciente sin truncar**
  (quitar `max-w-[8rem]`; usar el ancho disponible).
- La comisión en texto explícito: cuando hay abono previo,
  "Abonado Bs 300 de Bs 500 — **restan Bs 200**" (ya existe, se conserva).
- **La barra de progreso del paciente se mantiene**, pero con rótulo
  explícito encima en texto pequeño: `Pago del paciente` — para que nunca se
  confunda con la comisión del doctor.

### 4. Formulario de pago
El `StaffPaymentForm` actual **sin el dropdown "Pagar a"**: la persona viene
fijada por la selección del panel izquierdo.

- Props: recibe un `payee` único (`{ key, id, full_name, role, kind }`) en
  vez del array `payees`.
- Se elimina el `<select>` y el estado `payeeKey`; los hidden inputs
  `employee_id`/`receptionist_id` se derivan del `payee` prop.
- Los trabajos pendientes se cargan al montar (o al cambiar de persona) con
  el `fetchDoctorUnpaidWorks` existente, solo si `earnsCommission`.
- Campos visibles: Fecha, Monto, Método, Concepto + el panel de trabajos
  (punto 3, que vive dentro del form como hoy). El auto-llenado de monto y
  concepto desde los checkboxes se conserva sin cambios.
- El server action `createStaffPayment` no cambia.

### 5. Historial de pagos de la persona
La tabla desktop y las tarjetas móviles actuales, filtradas a la persona
seleccionada:

- **Filtro de mes** se conserva (param `month`, default mes actual, opción
  "Todos los meses"). `PagosFilter` se reduce a solo el selector de mes —
  el dropdown de empleado desaparece (lo reemplaza la selección del panel).
- **Botón imprimir** (`PrintPagosButton`) se conserva, con las filas de la
  persona y el mes visibles.
- Columnas de la tabla: Fecha, Concepto, Método, Monto, Desembolso,
  eliminar. La columna "Trabajador" y "Rol" desaparecen (redundantes: todo
  el panel es de una persona).
- Sub-filas de trabajos incluidos en cada pago: sin cambios (fecha,
  descripción, paciente, badge "abono parcial", monto).
- `DisbursedToggle` y `DeletePaymentButton` se reutilizan sin cambios.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `app/(dashboard)/pagos/page.tsx` | Reescrito al layout de dos paneles (siguiendo `cuentas/page.tsx`). Nuevas queries: lista con badge de pendientes; detalle filtrado por persona. |
| `components/pagos/StaffPaymentForm.tsx` | Adaptado: prop `payee` único, sin dropdown; rótulo "Pago del paciente" sobre la barra; paciente sin truncar. |
| `components/pagos/PagosFilter.tsx` | Reducido a solo filtro de mes. |
| `components/pagos/DisbursedToggle.tsx` | Sin cambios (reuso). |
| `components/pagos/DeletePaymentButton.tsx` | Sin cambios (reuso). |
| `components/pagos/PrintPagosButton.tsx` | Sin cambios (reuso; recibe las filas ya filtradas). |
| `app/(dashboard)/pagos/actions.ts` | Sin cambios. |
| `app/(dashboard)/pagos/work-actions.ts` | Sin cambios. |

Sin migraciones SQL. Sin cambios de RLS.

## Manejo de errores y casos borde

- **Persona en URL que no existe / de otra clínica:** el detalle no carga
  (queries con `clinic_id` explícito devuelven vacío) → mostrar el
  placeholder de "Selecciona a una persona".
- **Recepcionista seleccionada:** sin tarjeta de comisión pendiente, sin
  panel de trabajos — solo formulario simple (fecha, monto, método,
  concepto) e historial.
- **Persona sin pagos en el mes:** EmptyState existente ("Sin pagos en este
  período") con el filtro de mes visible para cambiar de período.
- **Búsqueda sin resultados:** EmptyState en la lista (patrón de cuentas).

## Criterios de aceptación

1. El admin ve la lista de personas con su comisión pendiente de un vistazo.
2. Al seleccionar un doctor: totales, trabajos pendientes con nombres
   completos, formulario e historial — todo de esa persona.
3. La barra de progreso lleva el rótulo "Pago del paciente" y la comisión
   restante aparece en texto.
4. Registrar un pago con abono parcial funciona igual que hoy (mismo server
   action, misma bitácora `staff_payment_works`).
5. Imprimir y marcar desembolso funcionan igual que hoy.
6. En móvil, la navegación lista→detalle→volver funciona como en cuentas.
7. Español neutro en todos los textos de UI.
