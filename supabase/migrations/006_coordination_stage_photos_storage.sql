-- Registro fotográfico persistente da Reunião de Coordenação
-- Fotos privadas no Storage, vinculadas exatamente à Semana EPC-15 + linha/Etapa Nível 5.

create table if not exists public.coordination_stage_photos (
  id uuid primary key default gen_random_uuid(),
  week_no integer not null references public.epc15_project_weeks(week_no) on delete cascade,
  source_index integer not null check (source_index >= 0),
  stage_key text not null,
  stage_label text not null,
  stage_path text not null default '',
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  sort_order integer not null default 0,
  uploaded_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coordination_stage_photos_week_stage_idx
  on public.coordination_stage_photos(week_no, source_index, sort_order, created_at);
create index if not exists coordination_stage_photos_stage_key_idx
  on public.coordination_stage_photos(week_no, stage_key);

alter table public.coordination_stage_photos enable row level security;
revoke all on public.coordination_stage_photos from public, anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'epc15-coordination-photos','epc15-coordination-photos',false,10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']::text[]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;
