-- EPC-15 project weeks based on "Semanas EPC-15.xlsx"
-- Semana 1 = 29/03/2026–04/04/2026
-- Semana 26 = 20/09/2026–26/09/2026
-- Semana 134 = 15/10/2028–21/10/2028

create table if not exists public.epc15_project_weeks (
  week_no integer primary key check (week_no between 1 and 134),
  start_date date not null,
  end_date date not null,
  check (end_date = start_date + 6)
);

insert into public.epc15_project_weeks (week_no,start_date,end_date)
select g,
       date '2026-03-29' + ((g-1) * 7),
       date '2026-03-29' + ((g-1) * 7) + 6
from generate_series(1,134) g
on conflict (week_no) do update
set start_date=excluded.start_date,end_date=excluded.end_date;

create table if not exists public.coordination_master (
  id smallint primary key default 1 check (id=1),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

insert into public.coordination_master (id,password_hash)
values (1,extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'),extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.coordination_week_versions (
  id bigint generated always as identity primary key,
  week_no integer not null references public.epc15_project_weeks(week_no),
  version_no integer not null,
  excel_file_name text,
  excel_data_base date,
  ppt_file_name text,
  ppt_data_base date,
  schema_version text not null default 'epc15_coordination_week_v1',
  dataset jsonb not null,
  pb_manual jsonb not null default '{}'::jsonb,
  coordination_deck jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  saved_by text not null,
  saved_at timestamptz not null default now(),
  unique(week_no,version_no),
  check (jsonb_typeof(dataset)='object'),
  check (jsonb_typeof(pb_manual)='object'),
  check (jsonb_typeof(coordination_deck)='object')
);

create unique index if not exists coordination_week_one_current
  on public.coordination_week_versions(week_no) where is_current;
create index if not exists coordination_week_history
  on public.coordination_week_versions(week_no,saved_at desc);

alter table public.epc15_project_weeks enable row level security;
alter table public.coordination_master enable row level security;
alter table public.coordination_week_versions enable row level security;

revoke all on public.epc15_project_weeks from anon,authenticated;
revoke all on public.coordination_master from anon,authenticated;
revoke all on public.coordination_week_versions from anon,authenticated;
revoke all on sequence public.coordination_week_versions_id_seq from anon,authenticated;

create or replace function public.coordination_master_ok(p_master_password text)
returns boolean language sql stable security definer
set search_path=public,extensions as $$
  select exists (
    select 1 from public.coordination_master m
    where m.id=1
      and m.password_hash=extensions.crypt(coalesce(p_master_password,''),m.password_hash)
  );
$$;
revoke all on function public.coordination_master_ok(text) from public,anon,authenticated;

create or replace function public.list_coordination_weeks(p_username text,p_password text)
returns table(
  week_no integer,start_date date,end_date date,is_current boolean,is_locked boolean,
  has_snapshot boolean,version_no integer,excel_data_base date,ppt_data_base date,saved_at timestamptz
)
language plpgsql stable security definer set search_path=public,extensions as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  return query
  select w.week_no,w.start_date,w.end_date,
         (v_today between w.start_date and w.end_date),
         (w.end_date<v_today),(v.id is not null),v.version_no,v.excel_data_base,v.ppt_data_base,v.saved_at
  from public.epc15_project_weeks w
  left join public.coordination_week_versions v on v.week_no=w.week_no and v.is_current
  order by w.week_no;
end; $$;

create or replace function public.verify_coordination_master(
  p_username text,p_password text,p_master_password text,p_week_no integer
) returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ok boolean;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  v_ok:=public.coordination_master_ok(p_master_password);
  return jsonb_build_object('ok',v_ok and v_week.end_date>=v_today,'password_ok',v_ok,'locked',v_week.end_date<v_today,
    'week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date);
end; $$;

create or replace function public.get_coordination_week(
  p_username text,p_password text,p_week_no integer
) returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare
  v_row public.coordination_week_versions%rowtype;
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  select * into v_row from public.coordination_week_versions
    where week_no=p_week_no and is_current order by saved_at desc limit 1;
  if not found then
    return jsonb_build_object('week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date,
      'locked',v_week.end_date<v_today,'snapshot',null);
  end if;
  return jsonb_build_object(
    'week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date,'locked',v_week.end_date<v_today,
    'snapshot',jsonb_build_object(
      'id',v_row.id,'version_no',v_row.version_no,'excel_file_name',v_row.excel_file_name,'excel_data_base',v_row.excel_data_base,
      'ppt_file_name',v_row.ppt_file_name,'ppt_data_base',v_row.ppt_data_base,'schema_version',v_row.schema_version,
      'dataset',v_row.dataset,'pb_manual',v_row.pb_manual,'coordination_deck',v_row.coordination_deck,
      'saved_by',v_row.saved_by,'saved_at',v_row.saved_at
    )
  );
end; $$;

create or replace function public.save_coordination_week(
  p_username text,p_password text,p_master_password text,p_week_no integer,
  p_excel_file_name text,p_excel_data_base date,p_ppt_file_name text,p_ppt_data_base date,
  p_schema_version text,p_dataset jsonb,p_pb_manual jsonb,p_coordination_deck jsonb
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_version integer;
  v_row public.coordination_week_versions%rowtype;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if not public.coordination_master_ok(p_master_password) then raise exception 'Senha master inválida' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if v_week.end_date<v_today then raise exception 'Semana encerrada: alterações não são mais permitidas'; end if;
  if p_dataset is null or jsonb_typeof(p_dataset)<>'object' then raise exception 'Dataset do Excel inválido'; end if;

  perform pg_advisory_xact_lock(hashtext('coordination-week:'||p_week_no::text));
  select coalesce(max(version_no),0)+1 into v_version from public.coordination_week_versions where week_no=p_week_no;
  update public.coordination_week_versions set is_current=false where week_no=p_week_no and is_current;

  insert into public.coordination_week_versions(
    week_no,version_no,excel_file_name,excel_data_base,ppt_file_name,ppt_data_base,schema_version,
    dataset,pb_manual,coordination_deck,is_current,saved_by
  ) values (
    p_week_no,v_version,nullif(p_excel_file_name,''),p_excel_data_base,nullif(p_ppt_file_name,''),p_ppt_data_base,
    coalesce(nullif(p_schema_version,''),'epc15_coordination_week_v1'),p_dataset,
    coalesce(p_pb_manual,'{}'::jsonb),coalesce(p_coordination_deck,'{}'::jsonb),true,trim(p_username)
  ) returning * into v_row;

  return jsonb_build_object(
    'week_no',v_row.week_no,'version_no',v_row.version_no,'excel_file_name',v_row.excel_file_name,
    'excel_data_base',v_row.excel_data_base,'ppt_file_name',v_row.ppt_file_name,'ppt_data_base',v_row.ppt_data_base,
    'saved_by',v_row.saved_by,'saved_at',v_row.saved_at
  );
end; $$;

revoke all on function public.list_coordination_weeks(text,text) from public;
revoke all on function public.verify_coordination_master(text,text,text,integer) from public;
revoke all on function public.get_coordination_week(text,text,integer) from public;
revoke all on function public.save_coordination_week(text,text,text,integer,text,date,text,date,text,jsonb,jsonb,jsonb) from public;

grant execute on function public.list_coordination_weeks(text,text) to anon;
grant execute on function public.verify_coordination_master(text,text,text,integer) to anon;
grant execute on function public.get_coordination_week(text,text,integer) to anon;
grant execute on function public.save_coordination_week(text,text,text,integer,text,date,text,date,text,jsonb,jsonb,jsonb) to anon;
