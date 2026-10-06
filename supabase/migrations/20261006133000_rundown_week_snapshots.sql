-- Curva Rundown — snapshots semanais compactos
-- Armazena somente os dados já normalizados da aba 20_Planejamento-curvas_rundown.
-- O arquivo XLSM pesado não é salvo no banco.

create table if not exists public.rundown_week_versions (
  id bigint generated always as identity primary key,
  week_no integer not null references public.epc15_project_weeks(week_no),
  version_no integer not null,
  file_name text,
  file_size bigint,
  schema_version text not null default 'epc15_rundown_week_v1',
  dataset jsonb not null,
  is_current boolean not null default true,
  saved_by text not null,
  saved_at timestamptz not null default now(),
  unique (week_no, version_no),
  check (jsonb_typeof(dataset) = 'object')
);

create unique index if not exists rundown_week_one_current
  on public.rundown_week_versions (week_no)
  where is_current;

create index if not exists rundown_week_history
  on public.rundown_week_versions (week_no, saved_at desc);

alter table public.rundown_week_versions enable row level security;

revoke all on public.rundown_week_versions from anon, authenticated;
revoke all on sequence public.rundown_week_versions_id_seq from anon, authenticated;

create or replace function public.list_rundown_weeks_public()
returns table(
  week_no integer,
  start_date date,
  end_date date,
  is_current boolean,
  is_locked boolean,
  has_snapshot boolean,
  version_no integer,
  file_name text,
  file_size bigint,
  saved_by text,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path=public,extensions
as $$
  with params as (
    select (now() at time zone 'America/Sao_Paulo')::date as today
  )
  select
    w.week_no,
    w.start_date,
    w.end_date,
    (params.today between w.start_date and w.end_date),
    (w.end_date < params.today),
    (v.id is not null),
    v.version_no,
    v.file_name,
    v.file_size,
    v.saved_by,
    v.saved_at
  from public.epc15_project_weeks w
  cross join params
  left join public.rundown_week_versions v
    on v.week_no=w.week_no and v.is_current
  order by w.week_no;
$$;

create or replace function public.get_rundown_week_public(p_week_no integer)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_row public.rundown_week_versions%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_week
  from public.epc15_project_weeks
  where week_no=p_week_no;

  if not found then
    raise exception 'Semana EPC-15 inválida';
  end if;

  select * into v_row
  from public.rundown_week_versions
  where week_no=p_week_no and is_current
  order by saved_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'week_no',v_week.week_no,
      'start_date',v_week.start_date,
      'end_date',v_week.end_date,
      'locked',v_week.end_date<v_today,
      'snapshot',null
    );
  end if;

  return jsonb_build_object(
    'week_no',v_week.week_no,
    'start_date',v_week.start_date,
    'end_date',v_week.end_date,
    'locked',v_week.end_date<v_today,
    'snapshot',jsonb_build_object(
      'id',v_row.id,
      'version_no',v_row.version_no,
      'file_name',v_row.file_name,
      'file_size',v_row.file_size,
      'schema_version',v_row.schema_version,
      'dataset',v_row.dataset,
      'saved_by',v_row.saved_by,
      'saved_at',v_row.saved_at
    )
  );
end;
$$;

create or replace function public.save_rundown_week_master_public(
  p_master_password text,
  p_week_no integer,
  p_file_name text,
  p_file_size bigint,
  p_schema_version text,
  p_dataset jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_version integer;
  v_row public.rundown_week_versions%rowtype;
begin
  if not public.coordination_master_ok(p_master_password) then
    raise exception 'Senha master incorreta' using errcode='42501';
  end if;

  select * into v_week
  from public.epc15_project_weeks
  where week_no=p_week_no;

  if not found then
    raise exception 'Semana EPC-15 inválida';
  end if;

  if p_dataset is null or jsonb_typeof(p_dataset)<>'object' then
    raise exception 'Dataset da Curva Rundown inválido';
  end if;

  if coalesce(p_schema_version,'')='' then
    raise exception 'schema_version obrigatório';
  end if;

  perform pg_advisory_xact_lock(hashtext('rundown-week:'||p_week_no::text));

  select coalesce(max(version_no),0)+1
  into v_version
  from public.rundown_week_versions
  where week_no=p_week_no;

  update public.rundown_week_versions
  set is_current=false
  where week_no=p_week_no and is_current;

  insert into public.rundown_week_versions(
    week_no,version_no,file_name,file_size,schema_version,dataset,is_current,saved_by
  ) values (
    p_week_no,
    v_version,
    nullif(p_file_name,''),
    p_file_size,
    coalesce(nullif(p_schema_version,''),'epc15_rundown_week_v1'),
    p_dataset,
    true,
    'master'
  )
  returning * into v_row;

  return jsonb_build_object(
    'week_no',v_row.week_no,
    'version_no',v_row.version_no,
    'file_name',v_row.file_name,
    'file_size',v_row.file_size,
    'schema_version',v_row.schema_version,
    'saved_by',v_row.saved_by,
    'saved_at',v_row.saved_at
  );
end;
$$;

revoke all on function public.list_rundown_weeks_public() from public,authenticated;
revoke all on function public.get_rundown_week_public(integer) from public,authenticated;
revoke all on function public.save_rundown_week_master_public(text,integer,text,bigint,text,jsonb) from public,authenticated;

grant execute on function public.list_rundown_weeks_public() to anon;
grant execute on function public.get_rundown_week_public(integer) to anon;
grant execute on function public.save_rundown_week_master_public(text,integer,text,bigint,text,jsonb) to anon;
