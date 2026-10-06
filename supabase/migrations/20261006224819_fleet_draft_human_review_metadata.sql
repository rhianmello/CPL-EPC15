-- Permit review metadata produced by the fleet drawer while preserving every
-- original source cell/header/status. No data, grants or ownership changes.
-- The first migration has already been applied; patch only the exact reviewed
-- source-comparison expression in its existing function definition.
begin;
do $patch$
declare
  v_signature regprocedure := to_regprocedure('fleet_private.publish_import(text,uuid,text,jsonb)');
  v_definition text;
  v_before text := $before$((v_source->'raw')-'issues') is distinct from ((v_row->'raw')-'issues')$before$;
  v_after text := $after$((v_source->'raw')-array['issues','human_corrections']) is distinct from ((v_row->'raw')-array['issues','human_corrections'])$after$;
begin
  if v_signature is null then raise exception 'Pré-requisito ausente: migration de frota.'; end if;
  v_definition := pg_get_functiondef(v_signature);
  if strpos(v_definition,v_after)>0 then return; end if;
  if strpos(v_definition,v_before)=0
    or strpos(substr(v_definition,strpos(v_definition,v_before)+length(v_before)),v_before)>0 then
    raise exception 'Definição de publish_import diverge da revisão; patch não aplicado.';
  end if;
  -- pg_get_functiondef returns CREATE OR REPLACE: the existing signature,
  -- SECURITY DEFINER, search_path, ACL and dedicated role owner are retained.
  execute replace(v_definition,v_before,v_after);
end;
$patch$;
commit;
