-- Legenda editável do registro fotográfico.
alter table public.coordination_stage_photos
  add column if not exists caption text not null default '';
