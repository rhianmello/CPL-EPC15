create or replace function public.get_coordination_manual_week(
  p_username text,
  p_password text,
  p_week_no integer
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions'
as $$
declare
  v_row public.coordination_week_versions%rowtype;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select * into v_row
  from public.coordination_week_versions
  where week_no=p_week_no and is_current
  order by saved_at desc
  limit 1;

  if not found then
    return jsonb_build_object('week_no',p_week_no,'version_no',null,'saved_at',null,'pb_manual','{}'::jsonb);
  end if;

  return jsonb_build_object(
    'week_no',v_row.week_no,
    'version_no',v_row.version_no,
    'saved_at',v_row.saved_at,
    'pb_manual',v_row.pb_manual
  );
end;
$$;

create or replace function public.save_coordination_manual_week(
  p_username text,
  p_password text,
  p_week_no integer,
  p_pb_manual jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_row public.coordination_week_versions%rowtype;
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
  returning * into v_row;

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
$$;

grant execute on function public.get_coordination_manual_week(text,text,integer) to anon, authenticated;
grant execute on function public.save_coordination_manual_week(text,text,integer,jsonb) to anon, authenticated;
