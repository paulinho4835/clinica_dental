-- Límite configurable de usuarios por clínica.
-- El superadmin lo ajusta por clínica según el acuerdo comercial.
-- El admin de clínica no puede crear más usuarios que este límite.
alter table clinics add column if not exists max_users int not null default 10;
