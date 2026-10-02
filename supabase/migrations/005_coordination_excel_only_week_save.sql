-- Excel-only weekly save for Reunião de Coordenação.
-- Past EPC-15 weeks remain locked; current/future weeks can be saved without the old master-password flow.

create or replace function public.save_coordination_excel_week(
  p_username text,
  p_password text,
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
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_version integer;
  v_row public.coordination_week_versions%rowtype;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select * into v_week from public.epc15_project_weeks where week_no=p_week_no;
  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if v_week.end_date < v_today then raise exception 'Semana encerrada'; end if;

  perform pg_advisory_xact_lock(hashtext('coordination-week:'||p_week_no::text));
  select coalesce(max(version_no),0)+1 into v_version
  from public.coordination_week_versions
  where week_no=p_week_no;

  update public.coordination_week_versions
     set is_current=false
   where week_no=p_week_no and is_current;

  insert into public.coordination_week_versions(
    week_no,version_no,excel_file_name,excel_data_base,ppt_file_name,ppt_data_base,
    schema_version,dataset,pb_manual,coordination_deck,is_current,saved_by
  ) values (
    p_week_no,v_version,p_excel_file_name,p_excel_data_base,null,null,
    coalesce(nullif(p_schema_version,''),'epc15_coordination_excel_v1'),
    p_dataset,coalesce(p_pb_manual,'{}'::jsonb),'{}'::jsonb,true,trim(p_username)
  )
  returning * into v_row;

  return jsonb_build_object(
    'week_no',v_row.week_no,
    'version_no',v_row.version_no,
    'excel_file_name',v_row.excel_file_name,
    'excel_data_base',v_row.excel_data_base,
    'saved_by',v_row.saved_by,
    'saved_at',v_row.saved_at
  );
end;
$$;

revoke all on function public.save_coordination_excel_week(text,text,integer,text,date,text,jsonb,jsonb)
  from public,authenticated;
grant execute on function public.save_coordination_excel_week(text,text,integer,text,date,text,jsonb,jsonb)
  to anon;
