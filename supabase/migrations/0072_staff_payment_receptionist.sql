-- Permitir registrar pagos a recepcionistas SIN cuenta de login.
--
-- Hasta ahora staff_payments.employee_id era un FK NOT NULL a profiles, así que
-- solo se podía pagar a usuarios con cuenta. Las recepcionistas de la clínica
-- viven en clinic_receptionists (sin auth propia). Para llevar constancia de los
-- pagos que se les hacen, agregamos una segunda referencia opcional y exigimos
-- que cada pago apunte EXACTAMENTE a un destinatario (perfil O recepcionista).

alter table staff_payments
  alter column employee_id drop not null;

alter table staff_payments
  add column receptionist_id uuid
    references clinic_receptionists (id) on delete restrict;

-- Exactamente uno de los dos: o un empleado (profiles) o una recepcionista
-- (clinic_receptionists). Las filas existentes tienen employee_id → cumplen.
alter table staff_payments
  add constraint staff_payments_payee_chk
    check (num_nonnulls(employee_id, receptionist_id) = 1);

create index staff_payments_receptionist_idx
  on staff_payments (receptionist_id);

-- La política RLS existente (staff_payments_admin_all) ya cubre toda la tabla,
-- así que el nuevo campo queda protegido por el mismo criterio (solo admin).
