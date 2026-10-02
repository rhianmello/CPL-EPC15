-- Registro fotográfico por Semana EPC-15 + Fase
-- Mantém compatibilidade com fotos antigas que eram vinculadas às etapas.

alter table public.coordination_stage_photos
  add column if not exists phase_name text,
  add column if not exists phase_key text;

alter table public.coordination_stage_photos
  alter column source_index drop not null;

update public.coordination_stage_photos
set phase_name = nullif(trim(split_part(stage_path,' › ',2)),''),
    phase_key = lower(nullif(trim(split_part(stage_path,' › ',2)),''))
where (phase_name is null or phase_key is null)
  and coalesce(stage_path,'') <> '';

update public.coordination_stage_photos
set phase_name = coalesce(phase_name, stage_label),
    phase_key = coalesce(phase_key, lower(stage_label))
where phase_name is null or phase_key is null;

alter table public.coordination_stage_photos
  alter column phase_name set not null,
  alter column phase_key set not null;

create index if not exists coordination_stage_photos_week_phase_idx
  on public.coordination_stage_photos(week_no, phase_key, sort_order, created_at);
