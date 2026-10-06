-- Portal EPC-15 — acesso persistente ao painel inicial e páginas protegidas.
-- A senha não é armazenada em texto puro; somente SHA-256 do valor configurado.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.portal_access (
  id smallint primary key default 1 check (id=1),
  username text not null,
  password_sha256 text not null,
  updated_at timestamptz not null default now()
);

insert into public.portal_access(id,username,password_sha256)
values (
  1,
  'admin',
  'ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f'
)
on conflict (id) do update
set username=excluded.username,
    password_sha256=excluded.password_sha256,
    updated_at=now();

create table if not exists public.portal_sessions (
  token_hash text primary key,
  username text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists portal_sessions_expires_idx
  on public.portal_sessions(expires_at);

alter table public.portal_access enable row level security;
alter table public.portal_sessions enable row level security;

revoke all on public.portal_access from anon,authenticated;
revoke all on public.portal_sessions from anon,authenticated;

create or replace function public.portal_login(
  p_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_ok boolean;
  v_token text;
  v_expires timestamptz;
begin
  delete from public.portal_sessions where expires_at <= now();

  select exists(
    select 1
    from public.portal_access a
    where a.id=1
      and lower(a.username)=lower(trim(coalesce(p_username,'')))
      and a.password_sha256=encode(extensions.digest(coalesce(p_password,''),'sha256'),'hex')
  ) into v_ok;

  if not v_ok then
    return jsonb_build_object('ok',false);
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_expires:=now()+interval '30 days';

  insert into public.portal_sessions(token_hash,username,expires_at)
  values (
    encode(extensions.digest(v_token,'sha256'),'hex'),
    trim(p_username),
    v_expires
  );

  return jsonb_build_object(
    'ok',true,
    'token',v_token,
    'username',trim(p_username),
    'expires_at',v_expires
  );
end;
$$;

create or replace function public.portal_session_valid(p_token text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_row public.portal_sessions%rowtype;
  v_hash text;
begin
  if coalesce(p_token,'')='' then
    return jsonb_build_object('ok',false);
  end if;

  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');

  select * into v_row
  from public.portal_sessions
  where token_hash=v_hash
    and expires_at>now()
  limit 1;

  if not found then
    delete from public.portal_sessions where token_hash=v_hash;
    return jsonb_build_object('ok',false);
  end if;

  update public.portal_sessions
  set last_seen_at=now(),
      expires_at=now()+interval '30 days'
  where token_hash=v_hash
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,
    'username',v_row.username,
    'expires_at',v_row.expires_at
  );
end;
$$;

create or replace function public.portal_logout(p_token text)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_hash text;
begin
  if coalesce(p_token,'')='' then return true; end if;
  v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
  delete from public.portal_sessions where token_hash=v_hash;
  return true;
end;
$$;

revoke all on function public.portal_login(text,text) from public,authenticated;
revoke all on function public.portal_session_valid(text) from public,authenticated;
revoke all on function public.portal_logout(text) from public,authenticated;

grant execute on function public.portal_login(text,text) to anon;
grant execute on function public.portal_session_valid(text) to anon;
grant execute on function public.portal_logout(text) to anon;
