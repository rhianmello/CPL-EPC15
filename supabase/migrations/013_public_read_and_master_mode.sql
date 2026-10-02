-- Public read mode + master-only coordination edits.
-- This intentionally allows anyone with the site URL to view published BI/coordination data.
-- Write actions remain protected by BI credentials or the coordination master password.

create or replace function public.get_current_bi_snapshot_public(p_dataset_type text default 'epc15')
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
as $$
declare
  v_row public.bi_publications%rowtype;
  v_dataset_type text := coalesce(nullif(p_dataset_type,''),'epc15');
begin
  select * into v_row
  from public.bi_publications p
  where p.dataset_type=v_dataset_type and p.is_current
  order by published_at desc
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'id',v_row.id,'dataset_type',v_row.dataset_type,'version_no',v_row.version_no,
    'file_name',v_row.file_name,'file_size',v_row.file_size,'file_last_modified',v_row.file_last_modified,
    'data_base',v_row.data_base,'schema_version',v_row.schema_version,'dataset',v_row.dataset,
    'pb_manual',v_row.pb_manual,'published_by',v_row.published_by,'published_at',v_row.published_at
  );
end;
$$;

create or replace function public.list_bi_publications_public(
  p_dataset_type text default 'epc15',
  p_limit integer default 10
)
returns table(
  id bigint, version_no bigint, file_name text, data_base date, schema_version text,
  is_current boolean, published_by text, published_at timestamptz
)
language sql
stable
security definer
set search_path=public,extensions
as $$
  select p.id,p.version_no,p.file_name,p.data_base,p.schema_version,p.is_current,p.published_by,p.published_at
  from public.bi_publications p
  where p.dataset_type=coalesce(nullif(p_dataset_type,''),'epc15')
  order by p.published_at desc
  limit greatest(1,least(coalesce(p_limit,10),50));
$$;

create or replace function public.list_coordination_weeks_public()
returns table(
  week_no integer,start_date date,end_date date,is_current boolean,is_locked boolean,
  has_snapshot boolean,version_no integer,excel_data_base date,ppt_data_base date,saved_at timestamptz
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
    w.week_no,w.start_date,w.end_date,
    (params.today between w.start_date and w.end_date),
    (w.end_date < params.today),
    (v.id is not null),
    v.version_no,v.excel_data_base,v.ppt_data_base,v.saved_at
  from public.epc15_project_weeks w
  cross join params
  left join public.coordination_week_versions v
    on v.week_no=w.week_no and v.is_current
  order by w.week_no;
$$;

create or replace function public.get_coordination_week_public(p_week_no integer)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
as $$
declare
  v_row public.coordination_week_versions%rowtype;
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;

  select * into v_row
  from public.coordination_week_versions
  where week_no=p_week_no and is_current
  order by saved_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date,
      'locked',v_week.end_date<v_today,'snapshot',null
    );
  end if;

  return jsonb_build_object(
    'week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date,
    'locked',v_week.end_date<v_today,
    'snapshot',jsonb_build_object(
      'id',v_row.id,'version_no',v_row.version_no,'excel_file_name',v_row.excel_file_name,
      'excel_data_base',v_row.excel_data_base,'ppt_file_name',v_row.ppt_file_name,'ppt_data_base',v_row.ppt_data_base,
      'schema_version',v_row.schema_version,'dataset',v_row.dataset,'pb_manual',v_row.pb_manual,
      'coordination_deck',v_row.coordination_deck,'saved_by',v_row.saved_by,'saved_at',v_row.saved_at
    )
  );
end;
$$;

create or replace function public.get_coordination_manual_week_public(p_week_no integer)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
as $$
declare
  v_row public.coordination_week_versions%rowtype;
begin
  select * into v_row
  from public.coordination_week_versions
  where week_no=p_week_no and is_current
  order by saved_at desc
  limit 1;

  if not found then
    return jsonb_build_object('week_no',p_week_no,'version_no',null,'saved_at',null,'pb_manual','{}'::jsonb);
  end if;

  return jsonb_build_object(
    'week_no',v_row.week_no,'version_no',v_row.version_no,'saved_at',v_row.saved_at,'pb_manual',v_row.pb_manual
  );
end;
$$;

create or replace function public.get_coordination_layout_public()
returns jsonb
language sql
stable
security definer
set search_path=public,extensions
as $$
  select coalesce(
    (select layout from public.coordination_layout_preferences where layout_key='coordination-main'),
    '{}'::jsonb
  );
$$;

create or replace function public.verify_coordination_master_public(
  p_master_password text,
  p_week_no integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ok boolean;
begin
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  v_ok:=public.coordination_master_ok(p_master_password);

  return jsonb_build_object(
    'ok',v_ok,'password_ok',v_ok,'locked',v_week.end_date<v_today,
    'master_override',v_ok and v_week.end_date<v_today,
    'week_no',v_week.week_no,'start_date',v_week.start_date,'end_date',v_week.end_date
  );
end;
$$;

create or replace function public.save_coordination_manual_week_master_public(
  p_master_password text,
  p_week_no integer,
  p_pb_manual jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_row record;
begin
  if not public.coordination_master_ok(p_master_password) then
    raise exception 'Senha master incorreta' using errcode='42501';
  end if;

  update public.coordination_week_versions
  set pb_manual=coalesce(p_pb_manual,'{}'::jsonb),
      saved_at=now(),
      saved_by='master'
  where id=(
    select id from public.coordination_week_versions
    where week_no=p_week_no and is_current
    order by saved_at desc limit 1
  )
  returning week_no,version_no,excel_file_name,excel_data_base,saved_by,saved_at into v_row;

  if not found then raise exception 'Salve a semana antes de editar as configurações'; end if;

  return jsonb_build_object(
    'week_no',v_row.week_no,'version_no',v_row.version_no,'saved_at',v_row.saved_at,
    'saved_by',v_row.saved_by,'master_override',true
  );
end;
$$;

create or replace function public.save_coordination_excel_week_master_public(
  p_master_password text,
  p_week_no integer,
  p_excel_file_name text,
  p_excel_data_base date,
  p_schema_version text,
  p_dataset jsonb,
  p_pb_manual jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_version integer;
  v_row record;
begin
  if not public.coordination_master_ok(p_master_password) then
    raise exception 'Senha master incorreta' using errcode='42501';
  end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if p_dataset is null or jsonb_typeof(p_dataset)<>'object' then raise exception 'Dataset do Excel inválido'; end if;

  perform pg_advisory_xact_lock(hashtext('coordination-week:'||p_week_no::text));
  select coalesce(max(version_no),0)+1 into v_version
  from public.coordination_week_versions where week_no=p_week_no;

  update public.coordination_week_versions set is_current=false
  where week_no=p_week_no and is_current;

  insert into public.coordination_week_versions(
    week_no,version_no,excel_file_name,excel_data_base,ppt_file_name,ppt_data_base,
    schema_version,dataset,pb_manual,coordination_deck,is_current,saved_by
  ) values (
    p_week_no,v_version,p_excel_file_name,p_excel_data_base,null,null,
    coalesce(nullif(p_schema_version,''),'epc15_coordination_excel_v1'),
    p_dataset,coalesce(p_pb_manual,'{}'::jsonb),'{}'::jsonb,true,'master'
  )
  returning week_no,version_no,excel_file_name,excel_data_base,saved_by,saved_at into v_row;

  return jsonb_build_object(
    'week_no',v_row.week_no,'version_no',v_row.version_no,
    'excel_file_name',v_row.excel_file_name,'excel_data_base',v_row.excel_data_base,
    'saved_by',v_row.saved_by,'saved_at',v_row.saved_at,'master_override',true
  );
end;
$$;

create or replace function public.save_coordination_layout_master_public(
  p_master_password text,
  p_week_no integer,
  p_layout jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
begin
  if not public.coordination_master_ok(p_master_password) then
    raise exception 'Senha master incorreta' using errcode='42501';
  end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if jsonb_typeof(coalesce(p_layout,'{}'::jsonb)) <> 'object' then raise exception 'Layout inválido'; end if;

  insert into public.coordination_layout_preferences(layout_key,layout,updated_by,updated_at)
  values ('coordination-main',coalesce(p_layout,'{}'::jsonb),'master',now())
  on conflict (layout_key) do update
    set layout=excluded.layout,updated_by=excluded.updated_by,updated_at=excluded.updated_at;

  return jsonb_build_object(
    'ok',true,'layout',coalesce(p_layout,'{}'::jsonb),
    'updated_by','master','updated_at',now(),'master_override',true
  );
end;
$$;

revoke all on function public.get_current_bi_snapshot_public(text) from public,authenticated;
revoke all on function public.list_bi_publications_public(text,integer) from public,authenticated;
revoke all on function public.list_coordination_weeks_public() from public,authenticated;
revoke all on function public.get_coordination_week_public(integer) from public,authenticated;
revoke all on function public.get_coordination_manual_week_public(integer) from public,authenticated;
revoke all on function public.get_coordination_layout_public() from public,authenticated;
revoke all on function public.verify_coordination_master_public(text,integer) from public,authenticated;
revoke all on function public.save_coordination_manual_week_master_public(text,integer,jsonb) from public,authenticated;
revoke all on function public.save_coordination_excel_week_master_public(text,integer,text,date,text,jsonb,jsonb) from public,authenticated;
revoke all on function public.save_coordination_layout_master_public(text,integer,jsonb) from public,authenticated;

grant execute on function public.get_current_bi_snapshot_public(text) to anon;
grant execute on function public.list_bi_publications_public(text,integer) to anon;
grant execute on function public.list_coordination_weeks_public() to anon;
grant execute on function public.get_coordination_week_public(integer) to anon;
grant execute on function public.get_coordination_manual_week_public(integer) to anon;
grant execute on function public.get_coordination_layout_public() to anon;
grant execute on function public.verify_coordination_master_public(text,integer) to anon;
grant execute on function public.save_coordination_manual_week_master_public(text,integer,jsonb) to anon;
grant execute on function public.save_coordination_excel_week_master_public(text,integer,text,date,text,jsonb,jsonb) to anon;
grant execute on function public.save_coordination_layout_master_public(text,integer,jsonb) to anon;
