create table if not exists public.coordination_layout_preferences (
  layout_key text primary key,
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout)='object'),
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.coordination_layout_preferences enable row level security;
revoke all on public.coordination_layout_preferences from anon, authenticated;

create or replace function public.get_coordination_layout(
  p_username text,
  p_password text
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','extensions'
as $$
declare
  v_layout jsonb;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select layout into v_layout
  from public.coordination_layout_preferences
  where layout_key='coordination-main';

  return coalesce(v_layout,'{}'::jsonb);
end;
$$;

create or replace function public.save_coordination_layout(
  p_username text,
  p_password text,
  p_master_password text,
  p_week_no integer,
  p_layout jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $$
declare
  v_week public.epc15_project_weeks%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.bi_access_ok(p_username,p_password) then
    raise exception 'Acesso negado' using errcode='42501';
  end if;

  select * into v_week
  from public.epc15_project_weeks
  where week_no=p_week_no;

  if not found then raise exception 'Semana EPC-15 inválida'; end if;
  if v_week.end_date < v_today then raise exception 'Semana encerrada'; end if;
  if not public.coordination_master_ok(p_master_password) then
    raise exception 'Senha master incorreta' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_layout,'{}'::jsonb)) <> 'object' then
    raise exception 'Layout inválido';
  end if;

  insert into public.coordination_layout_preferences(layout_key,layout,updated_by,updated_at)
  values ('coordination-main',coalesce(p_layout,'{}'::jsonb),trim(p_username),now())
  on conflict (layout_key) do update
    set layout=excluded.layout,
        updated_by=excluded.updated_by,
        updated_at=excluded.updated_at;

  return jsonb_build_object(
    'ok',true,
    'layout',coalesce(p_layout,'{}'::jsonb),
    'updated_by',trim(p_username),
    'updated_at',now()
  );
end;
$$;

grant execute on function public.get_coordination_layout(text,text) to anon, authenticated;
grant execute on function public.save_coordination_layout(text,text,text,integer,jsonb) to anon, authenticated;
