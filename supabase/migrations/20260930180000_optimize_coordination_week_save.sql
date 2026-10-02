ALTER TABLE public.coordination_week_versions ALTER COLUMN dataset SET COMPRESSION lz4;
CREATE OR REPLACE FUNCTION public.save_coordination_excel_week(p_username text, p_password text, p_week_no integer, p_excel_file_name text, p_excel_data_base date, p_schema_version text, p_dataset jsonb, p_pb_manual jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_version integer;
  v_row record;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;
  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if v_week.end_date < v_today then raise exception 'Semana encerrada'; end if;
  perform pg_advisory_xact_lock(hashtext('coordination-week:'||p_week_no::text));
  select coalesce(max(version_no),0)+1 into v_version from public.coordination_week_versions where week_no=p_week_no;
  update public.coordination_week_versions set is_current=false where week_no=p_week_no and is_current;
  insert into public.coordination_week_versions(
    week_no,version_no,excel_file_name,excel_data_base,ppt_file_name,ppt_data_base,
    schema_version,dataset,pb_manual,coordination_deck,is_current,saved_by
  ) values (
    p_week_no,v_version,p_excel_file_name,p_excel_data_base,null,null,
    coalesce(nullif(p_schema_version,''),'epc15_coordination_excel_v1'),
    p_dataset,coalesce(p_pb_manual,'{}'::jsonb),'{}'::jsonb,true,trim(p_username)
  ) returning week_no,version_no,excel_file_name,excel_data_base,saved_by,saved_at into v_row;
  return jsonb_build_object('week_no',v_row.week_no,'version_no',v_row.version_no,'excel_file_name',v_row.excel_file_name,'excel_data_base',v_row.excel_data_base,'saved_by',v_row.saved_by,'saved_at',v_row.saved_at);
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_coordination_manual_week(p_username text, p_password text, p_week_no integer, p_pb_manual jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_row record;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if v_week.end_date < v_today then raise exception 'Semana encerrada'; end if;

  update public.coordination_week_versions
  set pb_manual=coalesce(p_pb_manual,'{}'::jsonb),
      saved_at=now(),
      saved_by=trim(p_username)
  where id=(
    select id from public.coordination_week_versions
    where week_no=p_week_no and is_current
    order by saved_at desc
    limit 1
  )
  returning week_no,version_no,excel_file_name,excel_data_base,saved_by,saved_at into v_row;

  if not found then
    raise exception 'Salve a semana antes de editar os destaques';
  end if;

  return jsonb_build_object(
    'week_no',v_row.week_no,
    'version_no',v_row.version_no,
    'saved_at',v_row.saved_at,
    'saved_by',v_row.saved_by
  );
end;
$function$;
