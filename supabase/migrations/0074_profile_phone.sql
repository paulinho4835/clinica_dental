-- Teléfono del doctor, usado por el addon "aviso_doctores": permite mandarle al
-- doctor por WhatsApp Web (wa.me) el resumen manual de sus citas del día, igual
-- que los recordatorios manuales que la recepción envía a los pacientes.
alter table profiles add column if not exists phone text;
