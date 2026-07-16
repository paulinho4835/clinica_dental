# Selección de tratamientos al imprimir presupuesto — Diseño

## Problema

Al imprimir el presupuesto de un paciente desde la ficha (botón "Presupuesto"
en `TreatmentPlanPanel`), la vista de impresión (`/pacientes/[id]/imprimir`)
siempre incluye **todos** los tratamientos históricos del paciente. Para
pacientes con muchos años de historial, esto genera un documento largo e
irrelevante — el admin necesita poder elegir qué tratamientos van en el
presupuesto que entrega al paciente.

## Alcance

Solo el flujo de impresión de presupuesto de un paciente. No afecta el resto
del panel de tratamientos, el registro de trabajos, ni otros documentos
impresos del sistema.

## Diseño

### 1. Modal de selección (`components/treatments/PrintSelectModal.tsx`, nuevo)

Reemplaza el `<a>` actual del botón "Presupuesto" en `TreatmentPlanPanel.tsx`.
Al hacer clic, abre un modal (reutiliza `components/ui/Modal.tsx`) con:

- Una fila por cada tratamiento en `works` (mismo array que ya recibe el
  panel — sin fetch adicional): checkbox, fecha, nombre, estado
  (Realizado/Pendiente), precio.
- Todos los checkboxes **desmarcados** por defecto.
- Un enlace "Marcar todos" / "Desmarcar todos" para listas largas.
- Un total en vivo (Bs) de lo seleccionado, visible en el footer.
- Botón "Imprimir" (deshabilitado si no hay nada seleccionado) y "Cancelar".

Al confirmar, abre en pestaña nueva
`/pacientes/{patientId}/imprimir?items=<id1>,<id2>,...` (mismo
`target="_blank"` que el enlace actual).

### 2. Página de impresión (`app/(print)/pacientes/[id]/imprimir/page.tsx`)

Lee `searchParams.items` (string separado por comas, opcional):

- **Si viene `items`**: filtra el array `works` a solo esos IDs antes de
  renderizar la tabla. El resumen financiero se recalcula sobre ese
  subconjunto:
  - `totalQuoted` = suma de `price` de los tratamientos filtrados.
  - `totalPaid` = suma de `payments.amount` **solo** de los pagos cuyo
    `treatment_item_id` esté dentro de los IDs seleccionados. Pagos sin
    `treatment_item_id` (pagos generales no vinculados a un tratamiento
    puntual) quedan excluidos del total cuando hay selección activa — decisión
    confirmada con el usuario.
  - `saldo` = `totalQuoted - totalPaid` sobre ese mismo subconjunto.
- **Si NO viene `items`** (por ejemplo, un enlace guardado de antes del
  cambio): se mantiene el comportamiento actual — todos los tratamientos,
  todos los pagos del paciente. Esto evita romper cualquier otro punto que
  enlace directamente a esta URL sin pasar por el modal.

Cambio necesario en la query de `payments`: agregar `treatment_item_id` al
`select` (hoy solo trae `amount`).

## Fuera de alcance

- No se persiste la selección — cada impresión es una elección nueva.
- No se agrega un modo "editar y reimprimir" con la misma selección guardada.
- No cambia el comportamiento de otros documentos impresos (recetas,
  consentimientos, etc.).
