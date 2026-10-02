-- BI EPC-15 — publicação versionada de snapshots
-- O frontend usa somente a publishable key + RPCs protegidas pelo login compartilhado.
-- Nunca exponha service_role no GitHub Pages.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.bi_access (
  id smallint primary key default 1 check (id = 1),
  username text not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

insert into public.bi_access (id, username, password_hash)
values (1, 'admin', extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')))
on conflict (id) do nothing;

create table if not exists public.bi_publications (
  id bigint generated always as identity primary key,
  dataset_type text not null default 'epc15',
  version_no bigint not null,
  file_name text not null,
  file_size bigint,
  file_last_modified timestamptz,
  data_base date,
  schema_version text not null,
  dataset jsonb not null,
  pb_manual jsonb not null default '{}'::jsonb,
  is_current boolean not null default false,
  published_by text not null,
  published_at timestamptz not null default now(),
  constraint bi_publications_dataset_object check (jsonb_typeof(dataset) = 'object'),
  constraint bi_publications_pb_object check (jsonb_typeof(pb_manual) = 'object'),
  unique (dataset_type, version_no)
);

create unique index if not exists bi_publications_one_current
  on public.bi_publications (dataset_type)
  where is_current;

create index if not exists bi_publications_history_idx
  on public.bi_publications (dataset_type, published_at desc);

alter table public.bi_access enable row level security;
alter table public.bi_publications enable row level security;

revoke all on public.bi_access from anon, authenticated;
revoke all on public.bi_publications from anon, authenticated;
revoke all on sequence public.bi_publications_id_seq from anon, authenticated;

create or replace function public.bi_access_ok(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.bi_access a
    where lower(a.username) = lower(trim(coalesce(p_username,'')))
      and a.password_hash = extensions.crypt(coalesce(p_password,''), a.password_hash)
  );
$$;

revoke all on function public.bi_access_ok(text,text) from public;

create or replace function public.verify_bi_access(p_username text, p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select public.bi_access_ok(p_username, p_password);
$$;

create or replace function public.get_current_bi_snapshot(
  p_username text,
  p_password text,
  p_dataset_type text default 'epc15'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_row public.bi_publications%rowtype;
  v_dataset_type text := coalesce(nullif(p_dataset_type,''),'epc15');
begin
  if not public.bi_access_ok(p_username, p_password) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select *
    into v_row
    from public.bi_publications p
   where p.dataset_type = v_dataset_type
     and p.is_current
   order by published_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'dataset_type', v_row.dataset_type,
    'version_no', v_row.version_no,
    'file_name', v_row.file_name,
    'file_size', v_row.file_size,
    'file_last_modified', v_row.file_last_modified,
    'data_base', v_row.data_base,
    'schema_version', v_row.schema_version,
    'dataset', v_row.dataset,
    'pb_manual', v_row.pb_manual,
    'published_by', v_row.published_by,
    'published_at', v_row.published_at
  );
end;
$$;

create or replace function public.publish_bi_snapshot(
  p_username text,
  p_password text,
  p_dataset_type text,
  p_file_name text,
  p_file_size bigint,
  p_file_last_modified timestamptz,
  p_data_base date,
  p_schema_version text,
  p_dataset jsonb,
  p_pb_manual jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_version bigint;
  v_row public.bi_publications%rowtype;
begin
  if not public.bi_access_ok(p_username, p_password) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_dataset is null or jsonb_typeof(p_dataset) <> 'object' then
    raise exception 'Dataset inválido';
  end if;
  if coalesce(p_schema_version,'') = '' then
    raise exception 'schema_version obrigatório';
  end if;

  perform pg_advisory_xact_lock(hashtext('bi_publications:' || coalesce(p_dataset_type,'epc15')));

  select coalesce(max(version_no),0)+1
    into v_version
    from public.bi_publications
   where dataset_type = coalesce(p_dataset_type,'epc15');

  update public.bi_publications
     set is_current = false
   where dataset_type = coalesce(p_dataset_type,'epc15')
     and is_current;

  insert into public.bi_publications (
    dataset_type, version_no, file_name, file_size, file_last_modified,
    data_base, schema_version, dataset, pb_manual, is_current, published_by
  ) values (
    coalesce(p_dataset_type,'epc15'), v_version, coalesce(nullif(p_file_name,''),'dataset-local'),
    p_file_size, p_file_last_modified, p_data_base, p_schema_version,
    p_dataset, coalesce(p_pb_manual,'{}'::jsonb), true, trim(p_username)
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'dataset_type', v_row.dataset_type,
    'version_no', v_row.version_no,
    'file_name', v_row.file_name,
    'data_base', v_row.data_base,
    'schema_version', v_row.schema_version,
    'published_by', v_row.published_by,
    'published_at', v_row.published_at
  );
end;
$$;

create or replace function public.list_bi_publications(
  p_username text,
  p_password text,
  p_dataset_type text default 'epc15',
  p_limit integer default 10
)
returns table (
  id bigint,
  version_no bigint,
  file_name text,
  data_base date,
  schema_version text,
  is_current boolean,
  published_by text,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_dataset_type text := coalesce(nullif(p_dataset_type,''),'epc15');
begin
  if not public.bi_access_ok(p_username, p_password) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return query
  select p.id, p.version_no, p.file_name, p.data_base, p.schema_version,
         p.is_current, p.published_by, p.published_at
    from public.bi_publications p
   where p.dataset_type = v_dataset_type
   order by p.published_at desc
   limit greatest(1, least(coalesce(p_limit,10),50));
end;
$$;

revoke all on function public.verify_bi_access(text,text) from public;
revoke all on function public.get_current_bi_snapshot(text,text,text) from public;
revoke all on function public.publish_bi_snapshot(text,text,text,text,bigint,timestamptz,date,text,jsonb,jsonb) from public;
revoke all on function public.list_bi_publications(text,text,text,integer) from public;

grant execute on function public.verify_bi_access(text,text) to anon, authenticated;
grant execute on function public.get_current_bi_snapshot(text,text,text) to anon, authenticated;
grant execute on function public.publish_bi_snapshot(text,text,text,text,bigint,timestamptz,date,text,jsonb,jsonb) to anon, authenticated;
grant execute on function public.list_bi_publications(text,text,text,integer) to anon, authenticated;
