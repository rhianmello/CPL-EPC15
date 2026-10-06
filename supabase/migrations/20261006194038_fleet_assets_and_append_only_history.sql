-- Fleet is additive: no existing dashboard table/function/password is changed.
-- Public RPC wrappers run as invoker. Private endpoint functions use a verified,
-- short-lived capability because this BI uses shared access, not Supabase Auth.
begin;

do $$ begin
  if to_regprocedure('public.coordination_master_ok(text)') is null then
    raise exception 'Pré-requisito ausente: coordination_master_ok(text)';
  end if;
end $$;

create role cpl_fleet_executor nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
do $$ begin execute format('grant cpl_fleet_executor to %I', current_user); end $$;
create schema fleet_private;
revoke all on schema fleet_private from public, anon, authenticated;
alter default privileges in schema fleet_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema fleet_private revoke all on functions from public, anon, authenticated;
alter default privileges in schema fleet_private revoke all on sequences from public, anon, authenticated;

create table fleet_private.fleet_import_batches (
  id uuid primary key,
  file_name text not null check (length(file_name) between 1 and 300),
  payload_hash text not null,
  row_count integer not null check (row_count between 1 and 2000),
  reviewed_rows jsonb not null check (jsonb_typeof(reviewed_rows)='array'),
  actor text not null,
  authenticated_as text not null default 'master' check (authenticated_as='master'),
  actor_user_id uuid,
  published_at timestamptz not null default clock_timestamp(),
  summary jsonb not null default '{}'::jsonb
);

-- Initial source can be staged by an authorized database administrator without
-- creating any assets. Raw source is visible only through a master capability.
create table fleet_private.fleet_import_drafts (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (length(file_name) between 1 and 300),
  row_count integer not null check (row_count between 1 and 2000),
  source_rows jsonb not null check (jsonb_typeof(source_rows)='array' and jsonb_array_length(source_rows)=row_count and pg_column_size(source_rows)<=8000000),
  source_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metadata)='object'),
  created_at timestamptz not null default clock_timestamp(),
  published_batch_id uuid references fleet_private.fleet_import_batches(id),
  published_at timestamptz,
  check ((published_batch_id is null and published_at is null) or (published_batch_id=id and published_at is not null))
);

create table fleet_private.fleet_assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text,
  placa_identificador text,
  tipo text,
  categoria text,
  modelo text,
  marca text,
  ano integer check (ano between 1900 and 2200),
  cor text,
  empresa text,
  gerencia text,
  responsavel_cpl text,
  status_operacional text,
  -- null means unconfirmed: Excel does not establish contract/operating status.
  ativo_no_contrato boolean,
  data_entrada date,
  data_saida date,
  observacao_atual text,
  quilometragem numeric check (quilometragem >= 0),
  horimetro numeric check (horimetro >= 0),
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (coalesce(nullif(trim(placa_identificador), ''), nullif(trim(modelo), ''), nullif(trim(asset_code), '')) is not null)
);

create table fleet_private.fleet_ptrans (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  supersedes_id uuid unique references fleet_private.fleet_ptrans(id),
  numero_ptran text, numero_isc text,
  data_recebimento date, data_solicitacao date, data_emissao date, data_validade date,
  status text, tipo_ptran text, provisoria boolean,
  observacao text, responsavel text,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table fleet_private.fleet_inspections (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  supersedes_id uuid unique references fleet_private.fleet_inspections(id),
  tipo_inspecao text, data_inspecao date, validade date, proxima_inspecao date,
  status text, inspetor text, resultado text,
  quilometragem numeric check (quilometragem >= 0), horimetro numeric check (horimetro >= 0),
  observacao text, anexo_url text, storage_bucket text, storage_path text,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table fleet_private.fleet_maintenance (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  supersedes_id uuid unique references fleet_private.fleet_maintenance(id),
  tipo text, categoria text, data_abertura date, data_execucao date, proxima_revisao_data date,
  km_atual numeric check (km_atual >= 0), proxima_revisao_km numeric check (proxima_revisao_km >= 0),
  horimetro_atual numeric check (horimetro_atual >= 0), proxima_revisao_horas numeric check (proxima_revisao_horas >= 0),
  oficina_fornecedor text, numero_os text, descricao text,
  valor numeric(15,2) check (valor >= 0), status text, observacao text,
  storage_bucket text, storage_path text,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table fleet_private.fleet_documents (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  supersedes_id uuid unique references fleet_private.fleet_documents(id),
  tipo_documento text, numero_documento text, emissao date, validade date,
  status text, arquivo_url text, observacao text, storage_bucket text, storage_path text,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table fleet_private.fleet_movements (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  supersedes_id uuid unique references fleet_private.fleet_movements(id),
  tipo_movimento text not null,
  data date, origem text, destino text, responsavel_anterior text, responsavel_novo text,
  observacao text,
  extra jsonb not null default '{}'::jsonb check (jsonb_typeof(extra) = 'object'),
  raw_import jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_import) = 'object'),
  import_batch_id uuid references fleet_private.fleet_import_batches(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table fleet_private.fleet_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  asset_id uuid not null references fleet_private.fleet_assets(id),
  record_id uuid not null,
  action text not null,
  table_name text not null,
  field_name text not null,
  old_value jsonb,
  new_value jsonb,
  actor text not null,
  authenticated_as text not null default 'master' check (authenticated_as='master'),
  actor_user_id uuid,
  origin text not null check (origin in ('manual', 'excel_import', 'system')),
  import_batch_id uuid references fleet_private.fleet_import_batches(id)
);

create table fleet_private.fleet_edit_sessions (
  token_hash text primary key,
  actor text not null,
  actor_user_id uuid,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create function fleet_private.identifier_key(p_value text)
returns text language sql immutable set search_path='' as $$
  select regexp_replace(translate(lower(coalesce(p_value,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[^a-z0-9]','','g');
$$;
create index fleet_assets_identifier on fleet_private.fleet_assets(fleet_private.identifier_key(placa_identificador));
create index fleet_assets_model on fleet_private.fleet_assets(lower(modelo));
create index fleet_assets_category on fleet_private.fleet_assets(categoria);
create index fleet_assets_responsible on fleet_private.fleet_assets(responsavel_cpl);
create index fleet_assets_company_management on fleet_private.fleet_assets(empresa, gerencia);
create index fleet_assets_status on fleet_private.fleet_assets(status_operacional, ativo_no_contrato);
create index fleet_assets_updated on fleet_private.fleet_assets(updated_at desc);
create index fleet_ptrans_numbers on fleet_private.fleet_ptrans(numero_ptran, numero_isc);
create index fleet_ptrans_isc on fleet_private.fleet_ptrans(numero_isc);
create index fleet_ptrans_ptran_normalized on fleet_private.fleet_ptrans(fleet_private.identifier_key(numero_ptran));
create index fleet_ptrans_isc_normalized on fleet_private.fleet_ptrans(fleet_private.identifier_key(numero_isc));
create index fleet_ptrans_due on fleet_private.fleet_ptrans(status, data_validade);
create index fleet_inspections_due on fleet_private.fleet_inspections(validade, proxima_inspecao);
create index fleet_maintenance_due on fleet_private.fleet_maintenance(status, proxima_revisao_data);
create index fleet_documents_due on fleet_private.fleet_documents(status, validade);
create index fleet_audit_asset_time on fleet_private.fleet_audit_log(asset_id, occurred_at desc);
create index fleet_audit_time on fleet_private.fleet_audit_log(occurred_at desc);
create index fleet_audit_filters on fleet_private.fleet_audit_log(origin, table_name, actor);
create index fleet_edit_session_expiry on fleet_private.fleet_edit_sessions(expires_at);
create index fleet_import_drafts_pending on fleet_private.fleet_import_drafts(created_at desc) where published_batch_id is null;

do $$ declare v_table text; begin
  foreach v_table in array array['fleet_assets','fleet_ptrans','fleet_inspections','fleet_maintenance','fleet_documents','fleet_movements','fleet_audit_log','fleet_edit_sessions','fleet_import_batches','fleet_import_drafts'] loop
    execute format('alter table fleet_private.%I enable row level security', v_table);
    execute format('revoke all on fleet_private.%I from public, anon, authenticated', v_table);
  end loop;
  foreach v_table in array array['fleet_ptrans','fleet_inspections','fleet_maintenance','fleet_documents','fleet_movements'] loop
    execute format('create index %I on fleet_private.%I(asset_id, created_at desc)', v_table || '_asset_time', v_table);
    execute format('create index %I on fleet_private.%I(import_batch_id)', v_table || '_batch', v_table);
  end loop;
end $$;

-- Only this constant helper retains the migration owner's privileges: postgres
-- can call auth.uid(), but cannot grant USAGE on the Supabase-owned auth schema.
-- No table access, arguments, dynamic SQL or grants to API roles.
create function fleet_private.request_user_id()
returns uuid language sql stable security definer set search_path='' as $$select auth.uid()$$;

create function fleet_private.require_session(p_token text)
returns fleet_private.fleet_edit_sessions
language plpgsql security definer set search_path = '' as $$
declare v_session fleet_private.fleet_edit_sessions;
begin
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Edição bloqueada. Libere a edição novamente.' using errcode = '42501';
  end if;
  select * into v_session from fleet_private.fleet_edit_sessions
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null and expires_at > clock_timestamp();
  -- null auth.uid() is deliberate for the existing shared BI access pattern.
  -- If issued to a Supabase Auth identity, the capability is identity-bound.
  if not found or v_session.actor_user_id is distinct from fleet_private.request_user_id() then
    raise exception 'Sessão de edição expirada ou inválida.' using errcode = '42501';
  end if;
  return v_session;
end $$;

create function fleet_private.open_edit_session(p_master_password text, p_actor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text; v_expires timestamptz;
begin
  if p_master_password is null or length(p_master_password) > 1024
      or public.coordination_master_ok(p_master_password) is not true then
    raise exception 'Senha master incorreta.' using errcode = '42501';
  end if;
  if nullif(trim(p_actor), '') is null or length(p_actor) > 150 then
    raise exception 'Informe o responsável pela alteração (até 150 caracteres).';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := clock_timestamp() + interval '15 minutes';
  insert into fleet_private.fleet_edit_sessions(token_hash, actor, actor_user_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), trim(p_actor), fleet_private.request_user_id(), v_expires);
  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

create function fleet_private.close_edit_session(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update fleet_private.fleet_edit_sessions set revoked_at = clock_timestamp()
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and actor_user_id is not distinct from fleet_private.request_user_id() and revoked_at is null;
  return jsonb_build_object('ok', true);
end $$;

-- Trigger protections also cover accidental privileged direct edits.
create function fleet_private.prevent_history_rewrite()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Histórico imutável: registre uma nova versão ou movimentação.' using errcode = '42501';
end $$;

create function fleet_private.guard_asset_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'UUID e criação são imutáveis; inative o ativo sem apagar o histórico.' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger fleet_asset_identity before update or delete on fleet_private.fleet_assets
for each row execute function fleet_private.guard_asset_identity();

create function fleet_private.audit_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb := to_jsonb(new); v_field text; v_asset uuid; v_action text;
  v_actor text := coalesce(nullif(current_setting('fleet.actor', true), ''), 'system');
  v_uid uuid := nullif(current_setting('fleet.actor_user_id', true), '')::uuid;
  v_origin text := coalesce(nullif(current_setting('fleet.origin', true), ''), 'system');
  v_batch uuid := nullif(current_setting('fleet.import_batch_id', true), '')::uuid;
begin
  v_asset := case when tg_table_name = 'fleet_assets' then new.id else (v_new->>'asset_id')::uuid end;
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_action := 'update';
  elsif nullif(v_new->>'supersedes_id', '') is not null then
    execute format('select to_jsonb(t) from fleet_private.%I t where id = $1', tg_table_name)
      into v_old using (v_new->>'supersedes_id')::uuid;
    v_action := 'version';
  else
    insert into fleet_private.fleet_audit_log(asset_id, record_id, action, table_name, field_name, new_value, actor, actor_user_id, origin, import_batch_id)
    values (v_asset, new.id, 'insert', tg_table_name, '*', v_new, v_actor, v_uid, v_origin, v_batch);
    return new;
  end if;
  for v_field in select jsonb_object_keys(v_new) loop
    if v_field <> all(array['id','asset_id','supersedes_id','created_at','updated_at','import_batch_id'])
       and v_old->v_field is distinct from v_new->v_field then
      insert into fleet_private.fleet_audit_log(asset_id, record_id, action, table_name, field_name, old_value, new_value, actor, actor_user_id, origin, import_batch_id)
      values (v_asset, new.id, v_action, tg_table_name, v_field, v_old->v_field, v_new->v_field, v_actor, v_uid, v_origin, v_batch);
    end if;
  end loop;
  return new;
end $$;

create trigger fleet_asset_audit after insert or update on fleet_private.fleet_assets
for each row execute function fleet_private.audit_change();
do $$ declare v_table text; begin
  foreach v_table in array array['fleet_ptrans','fleet_inspections','fleet_maintenance','fleet_documents','fleet_movements'] loop
    execute format('create trigger fleet_history_immutable before update or delete on fleet_private.%I for each row execute function fleet_private.prevent_history_rewrite()', v_table);
    execute format('create trigger fleet_history_audit after insert on fleet_private.%I for each row execute function fleet_private.audit_change()', v_table);
  end loop;
end $$;
create trigger fleet_audit_immutable before update or delete on fleet_private.fleet_audit_log
for each row execute function fleet_private.prevent_history_rewrite();

create function fleet_private.guard_import_batch()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.summary<>'{}'::jsonb
    or (to_jsonb(old)-'summary') is distinct from (to_jsonb(new)-'summary') then
    raise exception 'Lote publicado é imutável.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger fleet_batch_immutable before update or delete on fleet_private.fleet_import_batches
for each row execute function fleet_private.guard_import_batch();

create function fleet_private.guard_import_draft()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.published_batch_id is not null
    or (to_jsonb(old)-array['published_batch_id','published_at']) is distinct from (to_jsonb(new)-array['published_batch_id','published_at']) then
    raise exception 'A fonte pendente é imutável; publique a revisão sem reescrever o original.' using errcode='42501';
  end if;
  return new;
end $$;
create trigger fleet_draft_immutable before update or delete on fleet_private.fleet_import_drafts
for each row execute function fleet_private.guard_import_draft();

-- Internal helpers never receive API grants; external callers cannot select an origin or batch.
create function fleet_private.set_audit_context(p_session fleet_private.fleet_edit_sessions, p_origin text, p_batch uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform set_config('fleet.actor', p_session.actor, true);
  perform set_config('fleet.actor_user_id', coalesce(p_session.actor_user_id::text, ''), true);
  perform set_config('fleet.origin', p_origin, true);
  perform set_config('fleet.import_batch_id', coalesce(p_batch::text, ''), true);
end $$;

create function fleet_private.validate_json(p_data jsonb, p_allowed text[])
returns void language plpgsql immutable set search_path = '' as $$
declare v_key text;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data) > 100000 then
    raise exception 'Registro inválido ou maior que 100 KB.';
  end if;
  for v_key in select jsonb_object_keys(p_data) loop
    if v_key <> all(p_allowed) then raise exception 'Campo não permitido: %', v_key; end if;
    if jsonb_typeof(p_data->v_key) = 'string' and length(p_data->>v_key) > 12000 then
      raise exception 'Campo muito longo: %', v_key;
    end if;
  end loop;
end $$;

create function fleet_private.save_asset_internal(p_asset jsonb, p_expected_updated_at timestamptz, p_batch uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_old fleet_private.fleet_assets; v_new fleet_private.fleet_assets; v_id uuid;
begin
  perform fleet_private.validate_json(p_asset, array['id','asset_code','placa_identificador','tipo','categoria','modelo','marca','ano','cor','empresa','gerencia','responsavel_cpl','status_operacional','ativo_no_contrato','data_entrada','data_saida','observacao_atual','quilometragem','horimetro','extra','raw_import']);
  v_id := coalesce(nullif(p_asset->>'id', '')::uuid, gen_random_uuid());
  select * into v_old from fleet_private.fleet_assets where id = v_id for update;
  if found then
    if p_expected_updated_at is null or v_old.updated_at is distinct from p_expected_updated_at then
      raise exception 'O ativo foi alterado. Recarregue e confira antes de salvar.' using errcode = '40001';
    end if;
    v_new := jsonb_populate_record(v_old, p_asset - 'id');
    if (to_jsonb(v_new) - 'updated_at' - 'import_batch_id') = (to_jsonb(v_old) - 'updated_at' - 'import_batch_id') then
      return to_jsonb(v_old);
    end if;
    v_new.updated_at := clock_timestamp();
    v_new.import_batch_id := coalesce(p_batch, v_old.import_batch_id);
    update fleet_private.fleet_assets set
      asset_code=v_new.asset_code, placa_identificador=v_new.placa_identificador,
      tipo=v_new.tipo, categoria=v_new.categoria, modelo=v_new.modelo, marca=v_new.marca,
      ano=v_new.ano, cor=v_new.cor, empresa=v_new.empresa, gerencia=v_new.gerencia,
      responsavel_cpl=v_new.responsavel_cpl, status_operacional=v_new.status_operacional,
      ativo_no_contrato=v_new.ativo_no_contrato, data_entrada=v_new.data_entrada, data_saida=v_new.data_saida,
      observacao_atual=v_new.observacao_atual, quilometragem=v_new.quilometragem, horimetro=v_new.horimetro,
      extra=v_new.extra, raw_import=v_new.raw_import, import_batch_id=v_new.import_batch_id,
      updated_at=v_new.updated_at
    where id=v_id returning * into v_new;
  else
    if p_expected_updated_at is not null then raise exception 'Ativo não encontrado.' using errcode = '40001'; end if;
    v_new := jsonb_populate_record(null::fleet_private.fleet_assets,
      jsonb_build_object('id',v_id,'extra','{}'::jsonb,'raw_import','{}'::jsonb,'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'import_batch_id',p_batch) || (p_asset - 'id'));
    insert into fleet_private.fleet_assets select (v_new).* returning * into v_new;
  end if;
  return to_jsonb(v_new);
end $$;

create function fleet_private.save_asset(p_token text, p_asset jsonb, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_session fleet_private.fleet_edit_sessions; v_result jsonb;
begin
  v_session := fleet_private.require_session(p_token);
  perform fleet_private.set_audit_context(v_session, 'manual', null);
  v_result:=fleet_private.save_asset_internal(p_asset, p_expected_updated_at, null);
  -- A row lock may have waited beyond expiry or a concurrent revocation.
  -- Revalidation here aborts and rolls back the complete RPC transaction.
  perform fleet_private.require_session(p_token);
  return v_result;
end $$;

create function fleet_private.add_record_internal(p_kind text, p_asset_id uuid, p_record jsonb, p_expected_updated_at timestamptz, p_batch uuid)
returns jsonb language plpgsql set search_path = '' as $$
declare v_table text; v_allowed text[]; v_asset fleet_private.fleet_assets; v_old jsonb;
  v_payload jsonb; v_result jsonb; v_supersedes uuid; v_patch jsonb := '{}'::jsonb;
  v_count integer; v_movement text; v_updated timestamptz;
begin
  v_table := case p_kind when 'ptrans' then 'fleet_ptrans' when 'inspections' then 'fleet_inspections'
    when 'maintenance' then 'fleet_maintenance' when 'documents' then 'fleet_documents'
    when 'movements' then 'fleet_movements' end;
  if v_table is null then raise exception 'Tipo de registro inválido.'; end if;
  v_allowed := array['supersedes_id','extra','raw_import'];
  v_allowed := v_allowed || case p_kind
    when 'ptrans' then array['numero_ptran','numero_isc','data_recebimento','data_solicitacao','data_emissao','data_validade','status','tipo_ptran','provisoria','observacao','responsavel']
    when 'inspections' then array['tipo_inspecao','data_inspecao','validade','proxima_inspecao','status','inspetor','resultado','quilometragem','horimetro','observacao','anexo_url','storage_bucket','storage_path']
    when 'maintenance' then array['tipo','categoria','data_abertura','data_execucao','proxima_revisao_data','km_atual','proxima_revisao_km','horimetro_atual','proxima_revisao_horas','oficina_fornecedor','numero_os','descricao','valor','status','observacao','storage_bucket','storage_path']
    when 'documents' then array['tipo_documento','numero_documento','emissao','validade','status','arquivo_url','observacao','storage_bucket','storage_path']
    when 'movements' then array['tipo_movimento','data','origem','destino','responsavel_anterior','responsavel_novo','observacao'] end;
  perform fleet_private.validate_json(p_record, v_allowed);
  if coalesce(nullif(p_record->>'arquivo_url',''), nullif(p_record->>'anexo_url','')) is not null
    and coalesce(nullif(p_record->>'arquivo_url',''), nullif(p_record->>'anexo_url','')) !~ '^https://[^[:space:]]+$' then
    raise exception 'O link do anexo deve usar HTTPS.';
  end if;
  select * into v_asset from fleet_private.fleet_assets where id=p_asset_id for update;
  if not found then raise exception 'Ativo não encontrado.'; end if;
  if p_expected_updated_at is null or v_asset.updated_at is distinct from p_expected_updated_at then
    raise exception 'O ativo foi alterado. Recarregue antes de registrar o evento.' using errcode='40001';
  end if;
  v_supersedes := nullif(p_record->>'supersedes_id','')::uuid;
  if v_supersedes is not null then
    if p_kind = 'movements' then raise exception 'Corrija movimentações com um novo evento compensatório.'; end if;
    execute format('select to_jsonb(t) from fleet_private.%I t where id=$1 and asset_id=$2 for update',v_table)
      into v_old using v_supersedes,p_asset_id;
    if v_old is null then raise exception 'Versão anterior não pertence a este ativo.'; end if;
    execute format('select count(*) from fleet_private.%I where supersedes_id=$1',v_table)
      into v_count using v_supersedes;
    if v_count > 0 then raise exception 'Esta versão já foi substituída. Recarregue a ficha.' using errcode='40001'; end if;
  end if;
  v_payload := coalesce(v_old,'{}'::jsonb) || jsonb_build_object('extra','{}'::jsonb,'raw_import','{}'::jsonb)
    || p_record || jsonb_build_object('id',gen_random_uuid(),'asset_id',p_asset_id,'supersedes_id',v_supersedes,
       'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'import_batch_id',p_batch);
  -- Preserve metadata omitted from a partial version patch.
  if v_old is not null then
    if not (p_record ? 'extra') then v_payload := jsonb_set(v_payload,'{extra}',v_old->'extra'); end if;
    if not (p_record ? 'raw_import') then v_payload := jsonb_set(v_payload,'{raw_import}',v_old->'raw_import'); end if;
  end if;
  if p_kind='movements' then
    v_movement := lower(trim(p_record->>'tipo_movimento'));
    if nullif(v_movement,'') is null then raise exception 'Informe o tipo de movimentação.'; end if;
    if v_movement in ('entrada','entrada no contrato','saida','saída','saída do contrato','saida do contrato') then
      if nullif(p_record->>'data','') is null then raise exception 'Informe a data da entrada ou saída.'; end if;
      if v_movement in ('entrada','entrada no contrato') then
        v_patch := jsonb_build_object('ativo_no_contrato',true,'data_entrada',p_record->'data','data_saida',null);
        if lower(trim(v_asset.status_operacional))='fora do contrato' then
          v_patch := v_patch||jsonb_build_object('status_operacional',null);
        end if;
      else
        v_patch := jsonb_build_object('ativo_no_contrato',false,'data_saida',p_record->'data','status_operacional','Fora do contrato');
      end if;
    elsif v_movement in ('troca de responsável','troca de responsavel','responsavel','responsável') then
      if nullif(trim(p_record->>'responsavel_novo'),'') is null then raise exception 'Informe o novo responsável.'; end if;
      if p_record ? 'responsavel_anterior' and nullif(p_record->>'responsavel_anterior','') is distinct from v_asset.responsavel_cpl then
        raise exception 'Responsável anterior diverge do cadastro atual.' using errcode='40001';
      end if;
      v_payload := v_payload || jsonb_build_object('responsavel_anterior',v_asset.responsavel_cpl);
      v_patch := jsonb_build_object('responsavel_cpl',trim(p_record->>'responsavel_novo'));
    elsif v_movement in ('troca de gerência','troca de gerencia','gerencia','gerência') then
      if nullif(trim(p_record->>'destino'),'') is null then raise exception 'Informe a nova gerência em Destino.'; end if;
      v_payload := v_payload || jsonb_build_object('origem',v_asset.gerencia);
      v_patch := jsonb_build_object('gerencia',trim(p_record->>'destino'));
    elsif v_movement='indisponibilidade' then
      v_patch := jsonb_build_object('status_operacional','Indisponível');
    elsif v_movement in ('retorno à operação','retorno a operacao','retorno à operacao') then
      v_patch := jsonb_build_object('status_operacional','Disponível');
    end if;
  end if;
  execute format('insert into fleet_private.%I select (jsonb_populate_record(null::fleet_private.%I,$1)).* returning to_jsonb(%I)',v_table,v_table,v_table)
    into v_result using v_payload;
  if v_patch <> '{}'::jsonb then
    perform fleet_private.save_asset_internal(v_patch || jsonb_build_object('id',p_asset_id),v_asset.updated_at,p_batch);
  end if;
  -- Also advances the optimistic concurrency clock for child-only writes.
  update fleet_private.fleet_assets set updated_at=clock_timestamp() where id=p_asset_id returning updated_at into v_updated;
  return v_result || jsonb_build_object('asset_updated_at',v_updated);
end $$;

create function fleet_private.add_record(p_token text,p_kind text,p_asset_id uuid,p_record jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_session fleet_private.fleet_edit_sessions; v_result jsonb;
begin
  v_session := fleet_private.require_session(p_token);
  perform fleet_private.set_audit_context(v_session,'manual',null);
  v_result:=fleet_private.add_record_internal(p_kind,p_asset_id,p_record,p_expected_updated_at,null);
  perform fleet_private.require_session(p_token);
  return v_result;
end $$;

create function fleet_private.current_records(p_kind text,p_asset_id uuid)
returns jsonb language plpgsql stable set search_path='' as $$
declare v_table text; v_type text; v_date text; v_result jsonb;
begin
  v_table := case p_kind when 'ptrans' then 'fleet_ptrans' when 'inspections' then 'fleet_inspections'
    when 'maintenance' then 'fleet_maintenance' when 'documents' then 'fleet_documents' when 'movements' then 'fleet_movements' end;
  if v_table is null then raise exception 'Tipo de registro inválido.'; end if;
  -- Routine renewals supersede the current indicator by type without deleting
  -- their rows: the detail endpoint still returns every inspection/document.
  if p_kind in ('inspections','documents') then
    v_type := case p_kind when 'inspections' then 'tipo_inspecao' else 'tipo_documento' end;
    v_date := case p_kind when 'inspections' then 'data_inspecao' else 'emissao' end;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)-''rn'' order by t.created_at desc),''[]''::jsonb) from
      (select r.*,row_number() over(partition by coalesce(nullif(trim(r.%I),''''),r.id::text) order by r.%I desc nulls last,r.created_at desc,r.id) rn
       from fleet_private.%I r where asset_id=$1 and not exists(select 1 from fleet_private.%I next where next.supersedes_id=r.id)) t where rn=1',v_type,v_date,v_table,v_table)
      into v_result using p_asset_id;
  else
    execute format('select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id),''[]''::jsonb)
      from fleet_private.%I r where asset_id=$1 and not exists(select 1 from fleet_private.%I next where next.supersedes_id=r.id)',v_table,v_table)
      into v_result using p_asset_id;
  end if;
  return v_result;
end $$;

create function fleet_private.list_assets(p_search text,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_search text:=trim(coalesce(p_search,'')); v_result jsonb;
begin
  if length(v_search)>200 or p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 500 then raise exception 'Paginação ou busca inválida.'; end if;
  with matches as (
    select a.* from fleet_private.fleet_assets a
    where v_search='' or concat_ws(' ',a.asset_code,a.placa_identificador,a.modelo,a.categoria,a.tipo,a.empresa,a.gerencia,a.responsavel_cpl) ilike '%'||v_search||'%'
      or exists(select 1 from fleet_private.fleet_ptrans p where p.asset_id=a.id
         and not exists(select 1 from fleet_private.fleet_ptrans next where next.supersedes_id=p.id)
         and concat_ws(' ',p.numero_ptran,p.numero_isc) ilike '%'||v_search||'%')
  ), page as (select * from matches order by coalesce(placa_identificador,modelo,asset_code),id offset p_offset limit p_limit)
  select jsonb_build_object(
    'assets',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object(
      'ptrans',fleet_private.current_records('ptrans',a.id),
      'inspections',fleet_private.current_records('inspections',a.id),
      'maintenance',fleet_private.current_records('maintenance',a.id),
      'documents',fleet_private.current_records('documents',a.id)) order by coalesce(a.placa_identificador,a.modelo,a.asset_code),a.id) from page a),'[]'::jsonb),
    'total',(select count(*) from matches),
    'updated_at',(select max(updated_at) from fleet_private.fleet_assets),
    'pending_import',(select jsonb_build_object('id',d.id,'file_name',d.file_name,'row_count',d.row_count) from fleet_private.fleet_import_drafts d where published_batch_id is null order by created_at desc,id limit 1)) into v_result;
  return v_result;
end $$;

create function fleet_private.asset_detail(p_asset_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_asset jsonb; v_result jsonb; v_kind text; v_table text; v_records jsonb;
begin
  select to_jsonb(a) into v_asset from fleet_private.fleet_assets a where id=p_asset_id;
  if v_asset is null then raise exception 'Ativo não encontrado.'; end if;
  v_result:=jsonb_build_object('asset',v_asset);
  foreach v_kind in array array['ptrans','inspections','maintenance','documents','movements'] loop
    v_table:=case v_kind when 'ptrans' then 'fleet_ptrans' when 'inspections' then 'fleet_inspections' when 'maintenance' then 'fleet_maintenance' when 'documents' then 'fleet_documents' else 'fleet_movements' end;
    execute format('select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object(''is_current'',not exists(select 1 from fleet_private.%I next where next.supersedes_id=t.id)) order by t.created_at desc,t.id),''[]''::jsonb) from fleet_private.%I t where asset_id=$1',v_table,v_table)
      into v_records using p_asset_id;
    v_result:=v_result||jsonb_build_object(v_kind,v_records);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('created_at',l.occurred_at) order by occurred_at desc,id),'[]'::jsonb) into v_records
    from fleet_private.fleet_audit_log l where asset_id=p_asset_id;
  return v_result||jsonb_build_object('audit',v_records);
end $$;

create function fleet_private.history(p_filters jsonb,p_offset integer,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_filters jsonb:=coalesce(p_filters,'{}'::jsonb); v_result jsonb;
begin
  perform fleet_private.validate_json(v_filters,array['from','to','asset_id','kind','actor','origin','origem','responsavel','user']);
  if v_filters ? 'origem' and not (v_filters ? 'origin') then v_filters:=v_filters||jsonb_build_object('origin',v_filters->'origem'); end if;
  if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 500 then raise exception 'Paginação inválida.'; end if;
  with matches as (
    select l.*,l.occurred_at as created_at,a.placa_identificador,a.modelo,a.responsavel_cpl from fleet_private.fleet_audit_log l join fleet_private.fleet_assets a on a.id=l.asset_id
    where (nullif(v_filters->>'from','') is null or l.occurred_at>=(v_filters->>'from')::timestamptz)
      and (nullif(v_filters->>'to','') is null or l.occurred_at<(v_filters->>'to')::timestamptz+interval '1 day')
      and (nullif(v_filters->>'asset_id','') is null or l.asset_id=(v_filters->>'asset_id')::uuid)
      and (nullif(v_filters->>'kind','') is null or l.table_name=case when (v_filters->>'kind') like 'fleet_%' then v_filters->>'kind' else 'fleet_'||(v_filters->>'kind') end)
      and (nullif(v_filters->>'actor','') is null or l.actor ilike '%'||(v_filters->>'actor')||'%')
      and (nullif(v_filters->>'user','') is null or l.actor ilike '%'||(v_filters->>'user')||'%')
      and (nullif(v_filters->>'origin','') is null or l.origin=v_filters->>'origin')
      and (nullif(v_filters->>'responsavel','') is null or a.responsavel_cpl ilike '%'||(v_filters->>'responsavel')||'%'
        or (l.field_name in ('responsavel','responsavel_cpl','responsavel_anterior','responsavel_novo') and concat_ws(' ',l.old_value#>>'{}',l.new_value#>>'{}') ilike '%'||(v_filters->>'responsavel')||'%'))
  ), page as (select * from matches order by occurred_at desc,id offset p_offset limit p_limit)
  select jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(p) order by occurred_at desc,id) from page p),'[]'::jsonb),'total',(select count(*) from matches)) into v_result;
  return v_result;
end $$;

create function fleet_private.nonempty_import_fields(p_data jsonb)
returns jsonb language sql immutable set search_path='' as $$
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) from jsonb_each(p_data)
  where value <> 'null'::jsonb and not (jsonb_typeof(value)='string' and trim(value#>>'{}')='');
$$;

create function fleet_private.pending_import(p_token text,p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_draft fleet_private.fleet_import_drafts; v_issues jsonb; v_result jsonb;
begin
  perform fleet_private.require_session(p_token);
  select * into v_draft from fleet_private.fleet_import_drafts where id=p_draft_id and published_batch_id is null;
  if not found then raise exception 'A carga pendente não foi encontrada ou já foi publicada.'; end if;
  select coalesce(jsonb_agg(i.value),'[]'::jsonb) into v_issues
    from jsonb_array_elements(v_draft.source_rows) r cross join lateral jsonb_array_elements(coalesce(r.value->'issues','[]'::jsonb)) i;
  v_result:=jsonb_build_object('draft_id',v_draft.id,'file_name',v_draft.file_name,'row_count',v_draft.row_count,
    'parsed',jsonb_build_object('rows',v_draft.source_rows,'issues',v_issues,'ignored',0));
  perform fleet_private.require_session(p_token);
  return v_result;
end $$;

create function fleet_private.publish_import(p_token text,p_batch_id uuid,p_file_name text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_session fleet_private.fleet_edit_sessions; v_hash text; v_batch fleet_private.fleet_import_batches;
  v_draft fleet_private.fleet_import_drafts; v_source jsonb; v_source_count integer;
  v_row jsonb; v_peer jsonb; v_raw jsonb; v_asset_data jsonb; v_ptran_data jsonb;
  v_asset fleet_private.fleet_assets; v_saved jsonb; v_old_ptran jsonb; v_merged jsonb;
  v_id uuid; v_record_id uuid; v_expected timestamptz; v_identifier text; v_ptran text; v_isc text;
  v_count integer; v_reviewed boolean; v_decision text; v_seen_ids uuid[]:=array[]::uuid[];
  v_inserted integer:=0; v_updated integer:=0; v_ptrans integer:=0; v_ignored integer:=0; v_result jsonb;
begin
  v_session:=fleet_private.require_session(p_token);
  if p_batch_id is null or nullif(trim(p_file_name),'') is null or length(p_file_name)>300
    or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 2000
    or pg_column_size(p_rows)>8000000 then raise exception 'Lote inválido (máximo 2.000 linhas / 8 MB).'; end if;
  v_hash:=encode(extensions.digest(p_rows::text,'sha256'),'hex');
  -- Serializes batch retries and identifier conflict checks within imports.
  perform pg_advisory_xact_lock(hashtext('fleet_import_publication'));
  select * into v_draft from fleet_private.fleet_import_drafts where id=p_batch_id for update;
  if found then
    if v_draft.file_name<>trim(p_file_name) or v_draft.row_count<>jsonb_array_length(p_rows) then
      raise exception 'A revisão deve conter todas as linhas do arquivo pendente, inclusive as ignoradas.';
    end if;
    for v_row in select value from jsonb_array_elements(p_rows) loop
      if coalesce((v_row->>'reviewed')::boolean,false) is not true then
        raise exception 'Linha % da fonte pendente exige revisão humana explícita antes de publicar, inclusive quando ignorada.',v_row->>'row_number';
      end if;
      select count(*) into v_source_count from jsonb_array_elements(p_rows) r where r.value->>'row_number'=v_row->>'row_number';
      if v_source_count<>1 then raise exception 'Número de linha repetido na revisão pendente.'; end if;
      select r.value into v_source from jsonb_array_elements(v_draft.source_rows) r where r.value->>'row_number'=v_row->>'row_number';
      if v_source is null or ((v_source->'raw')-'issues') is distinct from ((v_row->'raw')-'issues') then
        raise exception 'A fonte original da linha % foi alterada; reabra a carga pendente.',v_row->>'row_number';
      end if;
    end loop;
  end if;
  select * into v_batch from fleet_private.fleet_import_batches where id=p_batch_id;
  if found then
    if v_batch.payload_hash<>v_hash or v_batch.file_name<>trim(p_file_name) then
      raise exception 'Este identificador de lote já foi usado com outro conteúdo.' using errcode='40001';
    end if;
    perform fleet_private.require_session(p_token);
    return v_batch.summary;
  end if;
  insert into fleet_private.fleet_import_batches(id,file_name,payload_hash,row_count,reviewed_rows,actor,actor_user_id)
  values(p_batch_id,trim(p_file_name),v_hash,jsonb_array_length(p_rows),p_rows,v_session.actor,v_session.actor_user_id);
  perform fleet_private.set_audit_context(v_session,'excel_import',p_batch_id);
  for v_row in select value from jsonb_array_elements(p_rows) loop
    -- Validate the session inside the row loop too; a long import cannot cross expiry.
    perform fleet_private.require_session(p_token);
    perform fleet_private.validate_json(v_row,array['row_number','raw','asset_id','expected_updated_at','asset','ptran','decision','reviewed']);
    v_decision:=v_row->>'decision';
    v_reviewed:=coalesce((v_row->>'reviewed')::boolean,false);
    if v_decision not in ('new','update','ignore') or v_decision is null then raise exception 'Decisão de importação inválida.'; end if;
    if v_decision='ignore' then v_ignored:=v_ignored+1; continue; end if;
    if nullif(v_row->>'row_number','') is null or (v_row->>'row_number')::integer<1 then raise exception 'Número de linha inválido.'; end if;
    v_raw:=coalesce(v_row->'raw','{}'::jsonb);
    if jsonb_typeof(v_raw) is distinct from 'object' then raise exception 'Linha original inválida.'; end if;
    if v_raw ? 'issues' and jsonb_typeof(v_raw->'issues') is distinct from 'array' then raise exception 'Alertas de conferência inválidos.'; end if;
    if exists(select 1 from jsonb_array_elements(coalesce(v_raw->'issues','[]'::jsonb)) issue where issue->>'severity'='error') and not v_reviewed then
      raise exception 'Linha % contém inconsistências e exige revisão humana explícita.',v_row->>'row_number';
    end if;
    if jsonb_typeof(v_row->'asset') is distinct from 'object' then raise exception 'Cadastro da linha inválido.'; end if;
    -- Even blank/unrecognized source cells remain available for human audit.
    v_asset_data:=fleet_private.nonempty_import_fields(v_row->'asset') - 'id';
    v_asset_data:=v_asset_data||jsonb_build_object('raw_import',jsonb_build_object('row_number',(v_row->>'row_number')::integer,'file_name',trim(p_file_name),'source',v_raw));
    if v_asset_data->>'observacao_atual' ~* 'cancelar' and not v_reviewed then
      raise exception 'Observação CANCELAR exige revisão humana: linha %.',v_row->>'row_number';
    end if;
    v_id:=nullif(v_row->>'asset_id','')::uuid;
    v_expected:=nullif(v_row->>'expected_updated_at','')::timestamptz;
    if v_decision='new' and v_id is not null then raise exception 'Um novo ativo deve receber UUID próprio do banco.'; end if;
    if v_decision='update' and (v_id is null or v_expected is null) then raise exception 'Atualização exige ativo e versão conferida.' using errcode='40001'; end if;
    if v_id=any(v_seen_ids) then raise exception 'O mesmo ativo aparece em duas atualizações: revise ou ignore uma linha.'; end if;
    v_identifier:=fleet_private.identifier_key(v_asset_data->>'placa_identificador');
    if v_identifier<>'' then
      select count(*) into v_count from fleet_private.fleet_assets where fleet_private.identifier_key(placa_identificador)=v_identifier and id is distinct from v_id;
      if v_count>0 and not v_reviewed then raise exception 'Identificação repetida na linha %. Exige revisão humana explícita.',v_row->>'row_number'; end if;
      for v_peer in select value from jsonb_array_elements(p_rows) where value is distinct from v_row and coalesce(value->>'decision','')<>'ignore' loop
        if fleet_private.identifier_key(v_peer->'asset'->>'placa_identificador')=v_identifier
          and (not v_reviewed or coalesce((v_peer->>'reviewed')::boolean,false) is not true) then
          raise exception 'Identificação repetida dentro do lote: %. Revise ambas as linhas.',v_identifier;
        end if;
      end loop;
    end if;
    v_ptran_data:=null;
    if v_row ? 'ptran' and v_row->'ptran'<>'null'::jsonb then
      if jsonb_typeof(v_row->'ptran') is distinct from 'object' then raise exception 'PTRAN da linha inválido.'; end if;
      v_ptran_data:=fleet_private.nonempty_import_fields(v_row->'ptran');
      if v_ptran_data ? 'status' and fleet_private.identifier_key(v_ptran_data->>'status') <> all(array['naosolicitado','empreparacao','solicitado','emanalise','pendente','aprovado','aprovada','pronto','pronta','provisorio','provisoria','cancelado','cancelada','vencido','vencida']) and not v_reviewed then
        raise exception 'Status PTRAN desconhecido exige revisão humana: linha %.',v_row->>'row_number';
      end if;
      v_ptran:=fleet_private.identifier_key(v_ptran_data->>'numero_ptran');
      v_isc:=fleet_private.identifier_key(v_ptran_data->>'numero_isc');
      if v_ptran<>'' then
        select count(*) into v_count from fleet_private.fleet_ptrans p where fleet_private.identifier_key(p.numero_ptran)=v_ptran and p.asset_id is distinct from v_id
          and not exists(select 1 from fleet_private.fleet_ptrans next where next.supersedes_id=p.id);
        if v_count>0 and not v_reviewed then raise exception 'PTRAN repetido em outro ativo na linha %. Exige revisão humana.',v_row->>'row_number'; end if;
        for v_peer in select value from jsonb_array_elements(p_rows) where value is distinct from v_row and coalesce(value->>'decision','')<>'ignore' loop
          if fleet_private.identifier_key(v_peer->'ptran'->>'numero_ptran')=v_ptran
            and (not v_reviewed or coalesce((v_peer->>'reviewed')::boolean,false) is not true) then
            raise exception 'PTRAN repetido dentro do lote: %. Revise ambas as linhas.',v_ptran;
          end if;
        end loop;
      end if;
      if v_isc<>'' then
        select count(*) into v_count from fleet_private.fleet_ptrans p where fleet_private.identifier_key(p.numero_isc)=v_isc and p.asset_id is distinct from v_id
          and not exists(select 1 from fleet_private.fleet_ptrans next where next.supersedes_id=p.id);
        if v_count>0 and not v_reviewed then raise exception 'ISC repetido em outro ativo na linha %. Exige revisão humana.',v_row->>'row_number'; end if;
        for v_peer in select value from jsonb_array_elements(p_rows) where value is distinct from v_row and coalesce(value->>'decision','')<>'ignore' loop
          if fleet_private.identifier_key(v_peer->'ptran'->>'numero_isc')=v_isc
            and (not v_reviewed or coalesce((v_peer->>'reviewed')::boolean,false) is not true) then
            raise exception 'ISC repetido dentro do lote: %. Revise ambas as linhas.',v_isc;
          end if;
        end loop;
      end if;
    end if;
    if v_id is not null then
      select * into v_asset from fleet_private.fleet_assets where id=v_id for update;
      if not found or v_asset.updated_at is distinct from v_expected then raise exception 'Cadastro mudou desde a conferência: linha %.',v_row->>'row_number' using errcode='40001'; end if;
      v_asset_data:=v_asset_data||jsonb_build_object('id',v_id);
    end if;
    v_saved:=fleet_private.save_asset_internal(v_asset_data,v_expected,p_batch_id);
    v_id:=(v_saved->>'id')::uuid;
    v_seen_ids:=array_append(v_seen_ids,v_id);
    if v_decision='new' then v_inserted:=v_inserted+1;
    elsif (v_saved->>'updated_at')::timestamptz is distinct from v_expected then v_updated:=v_updated+1; end if;
    if v_ptran_data is not null and v_ptran_data<>'{}'::jsonb then
      v_record_id:=nullif(v_ptran_data->>'supersedes_id','')::uuid;
      v_old_ptran:=null;
      if v_record_id is null then
        -- A present PTRAN number or ISC is required for automatic version linking.
        -- Two absent identifiers never imply the same PTRAN.
        select count(*), (array_agg(p.id order by p.created_at desc))[1] into v_count,v_record_id
        from fleet_private.fleet_ptrans p where p.asset_id=v_id
          and ((fleet_private.identifier_key(v_ptran_data->>'numero_ptran')<>''
              and fleet_private.identifier_key(p.numero_ptran)=fleet_private.identifier_key(v_ptran_data->>'numero_ptran'))
            or (fleet_private.identifier_key(v_ptran_data->>'numero_ptran')=''
              and fleet_private.identifier_key(v_ptran_data->>'numero_isc')<>''
              and fleet_private.identifier_key(p.numero_isc)=fleet_private.identifier_key(v_ptran_data->>'numero_isc')))
          and not exists(select 1 from fleet_private.fleet_ptrans next where next.supersedes_id=p.id);
        if v_count>1 then
          if not v_reviewed then raise exception 'Há vários PTRAN candidatos na linha %. Escolha a versão ou revise.',v_row->>'row_number'; end if;
          v_record_id:=null;
        end if;
      end if;
      if v_record_id is null and fleet_private.identifier_key(v_ptran_data->>'numero_ptran')=''
        and fleet_private.identifier_key(v_ptran_data->>'numero_isc')='' and not v_reviewed then
        raise exception 'PTRAN sem número e sem ISC exige revisão humana: linha %.',v_row->>'row_number';
      end if;
      if v_record_id is not null then
        select to_jsonb(p) into v_old_ptran from fleet_private.fleet_ptrans p where id=v_record_id and asset_id=v_id;
        if v_old_ptran is null then raise exception 'PTRAN anterior não pertence ao ativo.'; end if;
        v_merged:=v_old_ptran||v_ptran_data;
      else v_merged:=v_ptran_data; end if;
      -- Identical source facts in a new batch do not manufacture new PTRAN history.
      if v_old_ptran is null or (v_merged-array['id','asset_id','supersedes_id','created_at','updated_at','import_batch_id','raw_import'])
          is distinct from (v_old_ptran-array['id','asset_id','supersedes_id','created_at','updated_at','import_batch_id','raw_import']) then
        v_ptran_data:=v_ptran_data||jsonb_build_object('raw_import',jsonb_build_object('row_number',(v_row->>'row_number')::integer,'file_name',trim(p_file_name),'source',v_raw));
        if v_record_id is not null then v_ptran_data:=v_ptran_data||jsonb_build_object('supersedes_id',v_record_id); end if;
        perform fleet_private.add_record_internal('ptrans',v_id,v_ptran_data,(v_saved->>'updated_at')::timestamptz,p_batch_id);
        v_ptrans:=v_ptrans+1;
      end if;
    end if;
  end loop;
  v_result:=jsonb_build_object('batch_id',p_batch_id,'inserted',v_inserted,'updated',v_updated,'ptran_inserted',v_ptrans,'ignored',v_ignored);
  perform fleet_private.require_session(p_token);
  update fleet_private.fleet_import_batches set summary=v_result where id=p_batch_id;
  if v_draft.id is not null then
    update fleet_private.fleet_import_drafts set published_batch_id=p_batch_id,published_at=clock_timestamp() where id=v_draft.id;
  end if;
  return v_result;
end $$;

-- Small, explicit RPC surface. No table/view is granted to the browser.
create function public.fleet_open_edit_session(p_master_password text,p_actor text)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.open_edit_session(p_master_password,p_actor)$$;
create function public.fleet_close_edit_session(p_token text)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.close_edit_session(p_token)$$;
create function public.fleet_list_assets_public(p_search text default '',p_offset integer default 0,p_limit integer default 250)
returns jsonb language sql stable security invoker set search_path='' as $$select fleet_private.list_assets(p_search,p_offset,p_limit)$$;
create function public.fleet_asset_detail_public(p_asset_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select fleet_private.asset_detail(p_asset_id)$$;
create function public.fleet_history_public(p_filters jsonb default '{}'::jsonb,p_offset integer default 0,p_limit integer default 250)
returns jsonb language sql stable security invoker set search_path='' as $$select fleet_private.history(p_filters,p_offset,p_limit)$$;
create function public.fleet_save_asset(p_token text,p_asset jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.save_asset(p_token,p_asset,p_expected_updated_at)$$;
create function public.fleet_add_record(p_token text,p_kind text,p_asset_id uuid,p_record jsonb,p_expected_updated_at timestamptz default null)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.add_record(p_token,p_kind,p_asset_id,p_record,p_expected_updated_at)$$;
create function public.fleet_publish_import(p_token text,p_batch_id uuid,p_file_name text,p_rows jsonb)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.publish_import(p_token,p_batch_id,p_file_name,p_rows)$$;
create function public.fleet_pending_import(p_token text,p_draft_id uuid)
returns jsonb language sql security invoker set search_path='' as $$select fleet_private.pending_import(p_token,p_draft_id)$$;

revoke all on all functions in schema fleet_private from public,anon,authenticated;
grant usage on schema fleet_private to anon,authenticated;
grant execute on function fleet_private.open_edit_session(text,text),fleet_private.close_edit_session(text),
  fleet_private.list_assets(text,integer,integer),fleet_private.asset_detail(uuid),fleet_private.history(jsonb,integer,integer),
  fleet_private.save_asset(text,jsonb,timestamptz),fleet_private.add_record(text,text,uuid,jsonb,timestamptz),
  fleet_private.publish_import(text,uuid,text,jsonb),fleet_private.pending_import(text,uuid) to anon,authenticated;
revoke all on function public.fleet_open_edit_session(text,text),public.fleet_close_edit_session(text),
  public.fleet_list_assets_public(text,integer,integer),public.fleet_asset_detail_public(uuid),public.fleet_history_public(jsonb,integer,integer),
  public.fleet_save_asset(text,jsonb,timestamptz),public.fleet_add_record(text,text,uuid,jsonb,timestamptz),
  public.fleet_publish_import(text,uuid,text,jsonb),public.fleet_pending_import(text,uuid) from public,anon,authenticated;
grant execute on function public.fleet_open_edit_session(text,text),public.fleet_close_edit_session(text),
  public.fleet_list_assets_public(text,integer,integer),public.fleet_asset_detail_public(uuid),public.fleet_history_public(jsonb,integer,integer),
  public.fleet_save_asset(text,jsonb,timestamptz),public.fleet_add_record(text,text,uuid,jsonb,timestamptz),
  public.fleet_publish_import(text,uuid,text,jsonb),public.fleet_pending_import(text,uuid) to anon,authenticated;

comment on schema fleet_private is 'Frota CPL: tabelas privadas e funções de capacidade; não incluir nos schemas expostos pelo PostgREST.';
comment on table fleet_private.fleet_assets is 'UUID imutável. Identificador pode repetir por decisão humana; nulos não inferem fatos. Inativação preserva histórico.';
comment on table fleet_private.fleet_edit_sessions is 'Token SHA256 de 256 bits aleatórios; expire após 15 minutos. Nunca exposto em RPC de leitura.';
comment on table fleet_private.fleet_audit_log is 'Auditoria por campo, imutável. Actor é atribuição declarada do operador; actor_user_id existe apenas quando há Supabase Auth.';
comment on function public.fleet_publish_import(text,uuid,text,jsonb) is 'Importação atômica, idempotente por batch/hash, decisões humanas para conflitos, merge não vazio, sem exclusões.';

-- The definer owns only this module. It has no login or privileges on existing
-- dashboard data except EXECUTE on the existing master-password verifier.
grant usage on schema public,extensions to cpl_fleet_executor;
-- auth.uid() already has PUBLIC EXECUTE in this project; postgres is not its
-- owner and cannot regrant it. Do not change its existing ACL.
grant execute on function public.coordination_master_ok(text),extensions.digest(text,text),extensions.gen_random_bytes(integer) to cpl_fleet_executor;
grant execute on function fleet_private.request_user_id() to cpl_fleet_executor;
do $$ begin
  if not has_schema_privilege('cpl_fleet_executor','extensions','USAGE')
    or not has_function_privilege('cpl_fleet_executor','fleet_private.request_user_id()','EXECUTE')
    or not has_function_privilege('cpl_fleet_executor','public.coordination_master_ok(text)','EXECUTE') then
    raise exception 'Privilégios insuficientes para a role interna da frota; nenhuma alteração será confirmada.';
  end if;
end $$;
alter schema fleet_private owner to cpl_fleet_executor;
alter default privileges for role cpl_fleet_executor in schema fleet_private revoke all on functions from public,anon,authenticated;
alter default privileges for role cpl_fleet_executor in schema fleet_private revoke all on tables from public,anon,authenticated;
do $$ declare v_object record; begin
  for v_object in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='fleet_private' and c.relkind='r' loop
    execute format('alter table fleet_private.%I owner to cpl_fleet_executor',v_object.relname);
  end loop;
  for v_object in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='fleet_private' and p.proname<>'request_user_id' loop
    execute format('alter function %s owner to cpl_fleet_executor',v_object.signature);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
