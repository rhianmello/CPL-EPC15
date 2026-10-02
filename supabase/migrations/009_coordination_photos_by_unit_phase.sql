-- Registro fotográfico vinculado por Semana EPC-15 + Unidade + Fase.

alter table public.coordination_stage_photos
  add column if not exists unit_name text,
  add column if not exists unit_key text;

create index if not exists coordination_stage_photos_week_unit_phase_idx
  on public.coordination_stage_photos(week_no, unit_key, phase_key, sort_order, created_at);

-- Compatibilidade: as duas fotos antigas de Construção Civil foram registradas na U-8224.
update public.coordination_stage_photos
set unit_name = 'U-8224 – OFICINA DE MANUTENÇÃO',
    unit_key = lower('U-8224 – OFICINA DE MANUTENÇÃO')
where week_no = 27
  and phase_key = lower('SERVIÇOS DE CONSTRUÇÃO CÍVIL')
  and unit_key is null;
