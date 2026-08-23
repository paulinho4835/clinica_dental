-- Colores fijos para identificar profesionales en la agenda.
alter table public.profiles
  add column if not exists agenda_color text;

alter table public.profiles
  drop constraint if exists profiles_agenda_color_valid;

alter table public.profiles
  add constraint profiles_agenda_color_valid
  check (
    agenda_color is null or agenda_color in
      ('blue', 'red', 'emerald', 'amber', 'violet', 'pink', 'cyan', 'lime', 'orange', 'fuchsia')
  );

create index if not exists profiles_agenda_color_idx
  on public.profiles (clinic_id, agenda_color);
