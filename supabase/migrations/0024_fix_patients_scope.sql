-- patients_doctor_scope era restrictiva pero lanzaba 2 EXISTS correlacionados
-- (appointments + doctor_works) con RLS propio -> cascada lenta.
-- Se elimina y la restricción se maneja en la capa de aplicación (server component).
drop policy if exists patients_doctor_scope on patients;
