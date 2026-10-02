create table public.andaime_scenario_versions (id bigint generated always as identity primary key, saved_at timestamptz not null default clock_timestamp(), saved_by text not null, payload jsonb not null check(jsonb_typeof(payload)='object'));
alter table public.andaime_scenario_versions enable row level security;
revoke all on public.andaime_scenario_versions from anon,authenticated;
grant select on public.andaime_scenario_versions to anon,authenticated;
create policy andaime_read on public.andaime_scenario_versions for select to anon,authenticated using(true);
create schema if not exists private;
create function private.save_andaime_scenario(p_username text,p_password text,p_payload jsonb,p_base_id bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare latest bigint; result jsonb;
begin
if not public.bi_access_ok(p_username,p_password) then raise exception 'Usuário ou senha do BI incorretos' using errcode='42501'; end if;
if jsonb_typeof(p_payload->'cells') is distinct from 'object' or jsonb_typeof(p_payload->'qty') is distinct from 'object' or jsonb_typeof(p_payload->'override') is distinct from 'object' or pg_column_size(p_payload)>50000 then raise exception 'Cenário inválido'; end if;
if (p_payload->>'teams')::numeric<1 or (p_payload->>'icpd')::numeric not between 0 and 100 then raise exception 'Cenário inválido'; end if;
perform pg_advisory_xact_lock(987321);
select id into latest from public.andaime_scenario_versions order by id desc limit 1;
if latest is distinct from p_base_id then raise exception 'Outra versão foi salva. Reabra a última versão antes de salvar.'; end if;
insert into public.andaime_scenario_versions(saved_by,payload) values(trim(p_username),p_payload) returning jsonb_build_object('id',id,'saved_at',saved_at,'saved_by',saved_by) into result;
return result;
end $$;
revoke all on function private.save_andaime_scenario(text,text,jsonb,bigint) from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.save_andaime_scenario(text,text,jsonb,bigint) to anon,authenticated;
create function public.save_andaime_scenario(p_username text,p_password text,p_payload jsonb,p_base_id bigint) returns jsonb language sql security invoker set search_path='' as $$select private.save_andaime_scenario(p_username,p_password,p_payload,p_base_id)$$;
revoke all on function public.save_andaime_scenario(text,text,jsonb,bigint) from public;
grant execute on function public.save_andaime_scenario(text,text,jsonb,bigint) to anon,authenticated;