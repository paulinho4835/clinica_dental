alter table clinics add column if not exists currency text not null default 'Bs';

notify pgrst, 'reload schema';
