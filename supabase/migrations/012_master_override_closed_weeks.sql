-- Semana encerrada pode ser reaberta apenas com senha master válida.
-- A senha continua validada no banco; o frontend não armazena em localStorage.

create or replace function public.verify_coordination_master(
  p_username text,
  p_password text,
  p_master_password text,
  p_week_no integer
) returns jsonb
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
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  v_ok := public.coordination_master_ok(p_master_password);
  return jsonb_build_object(
    'ok',v_ok,
    'password_ok',v_ok,
    'locked',v_week.end_date < v_today,
    'master_override',v_ok and v_week.end_date < v_today,
    'week_no',v_week.week_no,
    'start_date',v_week.start_date,
    'end_date',v_week.end_date
  );
end;
$$;

revoke all on function public.verify_coordination_master(text,text,text,integer) from public,authenticated;
grant execute on function public.verify_coordination_master(text,text,text,integer) to anon;

create or replace function public.save_coordination_manual_week_master(
  p_username text,
  p_password text,
  p_master_password text,
  p_week_no integer,
  p_pb_manual jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_row record;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if not public.coordination_master_ok(p_master_password) then raise exception 'Senha master incorreta' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;

  update public.coordination_week_versions
  set pb_manual=coalesce(p_pb_manual,'{}'::jsonb), saved_at=now(), saved_by=trim(p_username)
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

revoke all on function public.save_coordination_manual_week_master(text,text,text,integer,jsonb) from public,authenticated;
grant execute on function public.save_coordination_manual_week_master(text,text,text,integer,jsonb) to anon;

create or replace function public.save_coordination_excel_week_master(
  p_username text,
  p_password text,
  p_master_password text,
  p_week_no integer,
  p_excel_file_name text,
  p_excel_data_base date,
  p_schema_version text,
  p_dataset jsonb,
  p_pb_manual jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_version integer;
  v_row record;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  if not public.coordination_master_ok(p_master_password) then raise exception 'Senha master incorreta' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if p_dataset is null or jsonb_typeof(p_dataset)<>'object' then raise exception 'Dataset do Excel inválido'; end if;

  perform pg_advisory_xact_lock(hashtext('coordination-week:'||p_week_no::text));
  select coalesce(max(version_no),0)+1 into v_version
  from public.coordination_week_versions where week_no=p_week_no;

  update public.coordination_week_versions set is_current=false where week_no=p_week_no and is_current;

  insert into public.coordination_week_versions(
    week_no,version_no,excel_file_name,excel_data_base,ppt_file_name,ppt_data_base,
    schema_version,dataset,pb_manual,coordination_deck,is_current,saved_by
  ) values (
    p_week_no,v_version,p_excel_file_name,p_excel_data_base,null,null,
    coalesce(nullif(p_schema_version,''),'epc15_coordination_excel_v1'),
    p_dataset,coalesce(p_pb_manual,'{}'::jsonb),'{}'::jsonb,true,trim(p_username)
  )
  returning week_no,version_no,excel_file_name,excel_data_base,saved_by,saved_at into v_row;

  return jsonb_build_object(
    'week_no',v_row.week_no,'version_no',v_row.version_no,'excel_file_name',v_row.excel_file_name,
    'excel_data_base',v_row.excel_data_base,'saved_by',v_row.saved_by,'saved_at',v_row.saved_at,
    'master_override',true
  );
end;
$$;

revoke all on function public.save_coordination_excel_week_master(text,text,text,integer,text,date,text,jsonb,jsonb) from public,authenticated;
grant execute on function public.save_coordination_excel_week_master(text,text,text,integer,text,date,text,jsonb,jsonb) to anon;

create or replace function public.save_coordination_layout(
  p_username text,
  p_password text,
  p_master_password text,
  p_week_no integer,
  p_layout jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
begin
  if not public.bi_access_ok(p_username,p_password) then raise exception 'Acesso negado' using errcode='42501'; end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if not public.coordination_master_ok(p_master_password) then raise exception 'Senha master incorreta' using errcode='42501'; end if;
  if jsonb_typeof(coalesce(p_layout,'{}'::jsonb)) <> 'object' then raise exception 'Layout inválido'; end if;

  insert into public.coordination_layout_preferences(layout_key,layout,updated_by,updated_at)
  values ('coordination-main',coalesce(p_layout,'{}'::jsonb),trim(p_username),now())
  on conflict (layout_key) do update
    set layout=excluded.layout, updated_by=excluded.updated_by, updated_at=excluded.updated_at;

  return jsonb_build_object('ok',true,'layout',coalesce(p_layout,'{}'::jsonb),'updated_by',trim(p_username),'updated_at',now(),'master_override',true);
end;
$$;

revoke all on function public.save_coordination_layout(text,text,text,integer,jsonb) from public,authenticated;
grant execute on function public.save_coordination_layout(text,text,text,integer,jsonb) to anon;
