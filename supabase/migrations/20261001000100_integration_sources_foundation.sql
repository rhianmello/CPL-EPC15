-- EPC-15 — fundação relacional para integração Planejamento + EAP + Qualidade
-- Não altera o cálculo oficial de avanço físico. As fontes são versionadas e
-- relacionadas em tabelas próprias para auditoria.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists unaccent with schema extensions;

create table if not exists public.integration_data_imports (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null check (source_type in ('planning','eap','quality','relationship_rebuild')),
  file_name text not null,
  file_size bigint,
  data_base date,
  week_no integer,
  version_no bigint not null,
  import_hash text,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  row_count integer not null default 0,
  status text not null default 'draft' check (status in ('draft','validated','published','rejected','superseded','error')),
  validation_summary jsonb not null default '{}'::jsonb,
  unique (source_type, version_no)
);

create table if not exists public.integration_planning_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  import_id uuid not null references public.integration_data_imports(id) on delete restrict,
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);

create table if not exists public.integration_eap_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  import_id uuid not null references public.integration_data_imports(id) on delete restrict,
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);

create table if not exists public.integration_quality_publications (
  id uuid primary key default extensions.gen_random_uuid(),
  import_id uuid not null references public.integration_data_imports(id) on delete restrict,
  is_current boolean not null default false,
  published_at timestamptz not null default now()
);

create unique index if not exists integration_planning_one_current
  on public.integration_planning_publications(is_current) where is_current;
create unique index if not exists integration_eap_one_current
  on public.integration_eap_publications(is_current) where is_current;
create unique index if not exists integration_quality_one_current
  on public.integration_quality_publications(is_current) where is_current;

create table if not exists public.integration_planning_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_id uuid not null references public.integration_planning_publications(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  wbs_p6 text,
  level_no integer,
  entrega text,
  fase text,
  subfase text,
  agrupamento text,
  componente text,
  etapa text,
  criterio_medicao text,
  peso numeric,
  previsto_total numeric,
  quantidade_total_prevista numeric,
  unidade_medida text,
  valor_real_acumulado numeric,
  quantidade_total_acumulada numeric,
  previsto_percent numeric,
  realizado_percent numeric,
  desvio_percent numeric,
  raw_row jsonb not null default '{}'::jsonb,
  unique (publication_id, source_row)
);

create table if not exists public.integration_eap_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_id uuid not null references public.integration_eap_publications(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  activity_id text,
  wbs_p6 text,
  unidade text,
  activity_unit text,
  entrega text,
  fase text,
  subfase text,
  agrupamento text,
  componente text,
  etapa text,
  criterio_medicao text,
  relatorio_raw text,
  relatorio_normalized text,
  relatorio_unit text,
  tag text,
  raw_row jsonb not null default '{}'::jsonb,
  unique (publication_id, source_row)
);

create table if not exists public.integration_quality_piles (
  id uuid primary key default extensions.gen_random_uuid(),
  publication_id uuid not null references public.integration_quality_publications(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_row integer not null,
  relatorio_raw text,
  relatorio_normalized text,
  relatorio_unit text,
  tag text,
  tag2 text,
  bloco text,
  unidade text,
  local text,
  data_execucao date,
  profundidade numeric,
  volume_concreto numeric,
  ficha_moldagem text,
  amostra text,
  resistencia_28d text,
  data_arrasamento date,
  pit_relatorio text,
  pit_status text,
  pce_relatorio text,
  pce_status text,
  projeto text,
  revisao text,
  sondagem text,
  rnc text,
  raw_row jsonb not null default '{}'::jsonb,
  unique (publication_id, source_row)
);

create table if not exists public.integration_aliases (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null check (source_type in ('eap_report','quality_report','activity_id','tag')),
  source_value_raw text not null,
  source_value_normalized text not null,
  corrected_value_raw text not null,
  corrected_value_normalized text not null,
  reason text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz not null default now(),
  unique (source_type, source_value_normalized, corrected_value_normalized)
);

create table if not exists public.integration_planning_eap_links (
  id uuid primary key default extensions.gen_random_uuid(),
  planning_publication_id uuid not null references public.integration_planning_publications(id) on delete cascade,
  eap_publication_id uuid not null references public.integration_eap_publications(id) on delete cascade,
  planning_row_id uuid references public.integration_planning_rows(id) on delete cascade,
  eap_row_id uuid not null references public.integration_eap_rows(id) on delete cascade,
  status text not null check (status in ('CONFIRMED','PROBABLE','AMBIGUOUS','UNMATCHED','MANUAL_ALIAS','SOURCE_ERROR')),
  confidence numeric,
  reason text not null,
  rule_used text not null,
  compared_keys jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

create table if not exists public.integration_eap_quality_links (
  id uuid primary key default extensions.gen_random_uuid(),
  eap_publication_id uuid not null references public.integration_eap_publications(id) on delete cascade,
  quality_publication_id uuid not null references public.integration_quality_publications(id) on delete cascade,
  eap_row_id uuid references public.integration_eap_rows(id) on delete cascade,
  quality_pile_id uuid not null references public.integration_quality_piles(id) on delete cascade,
  alias_id uuid references public.integration_aliases(id) on delete set null,
  status text not null check (status in ('CONFIRMED','PROBABLE','AMBIGUOUS','UNMATCHED','MANUAL_ALIAS','SOURCE_ERROR')),
  confidence numeric,
  reason text not null,
  rule_used text not null,
  compared_keys jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

create table if not exists public.integration_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  audit_type text not null,
  planning_publication_id uuid references public.integration_planning_publications(id) on delete set null,
  eap_publication_id uuid references public.integration_eap_publications(id) on delete set null,
  quality_publication_id uuid references public.integration_quality_publications(id) on delete set null,
  status text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_errors (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type text not null,
  publication_id uuid,
  source_file text,
  source_sheet text,
  source_row integer,
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  error_code text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists integration_imports_type_current_idx on public.integration_data_imports(source_type, imported_at desc);
create index if not exists integration_planning_wbs_idx on public.integration_planning_rows(publication_id, wbs_p6);
create index if not exists integration_planning_hierarchy_idx on public.integration_planning_rows(publication_id, entrega, fase, subfase, agrupamento, componente, etapa);
create index if not exists integration_eap_activity_idx on public.integration_eap_rows(publication_id, activity_id);
create index if not exists integration_eap_unit_idx on public.integration_eap_rows(publication_id, unidade);
create index if not exists integration_eap_report_idx on public.integration_eap_rows(publication_id, relatorio_normalized);
create index if not exists integration_eap_tag_idx on public.integration_eap_rows(publication_id, tag);
create index if not exists integration_quality_report_idx on public.integration_quality_piles(publication_id, relatorio_normalized);
create index if not exists integration_quality_unit_idx on public.integration_quality_piles(publication_id, unidade);
create index if not exists integration_quality_tag_idx on public.integration_quality_piles(publication_id, tag, tag2);
create index if not exists integration_alias_lookup_idx on public.integration_aliases(source_type, source_value_normalized) where status = 'active';
create index if not exists integration_eap_quality_status_idx on public.integration_eap_quality_links(status, decided_at desc);
create index if not exists integration_planning_eap_status_idx on public.integration_planning_eap_links(status, decided_at desc);

create or replace function public.integration_normalize_report(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    regexp_replace(
      upper(extensions.unaccent(coalesce(p_value,''))),
      '=0\s*$',
      '',
      'g'
    ),
    '[^A-Z0-9]',
    '',
    'g'
  );
$$;

alter table public.integration_data_imports enable row level security;
alter table public.integration_planning_publications enable row level security;
alter table public.integration_eap_publications enable row level security;
alter table public.integration_quality_publications enable row level security;
alter table public.integration_planning_rows enable row level security;
alter table public.integration_eap_rows enable row level security;
alter table public.integration_quality_piles enable row level security;
alter table public.integration_aliases enable row level security;
alter table public.integration_planning_eap_links enable row level security;
alter table public.integration_eap_quality_links enable row level security;
alter table public.integration_audit enable row level security;
alter table public.integration_errors enable row level security;

revoke all on public.integration_data_imports from anon, authenticated;
revoke all on public.integration_planning_publications from anon, authenticated;
revoke all on public.integration_eap_publications from anon, authenticated;
revoke all on public.integration_quality_publications from anon, authenticated;
revoke all on public.integration_planning_rows from anon, authenticated;
revoke all on public.integration_eap_rows from anon, authenticated;
revoke all on public.integration_quality_piles from anon, authenticated;
revoke all on public.integration_aliases from anon, authenticated;
revoke all on public.integration_planning_eap_links from anon, authenticated;
revoke all on public.integration_eap_quality_links from anon, authenticated;
revoke all on public.integration_audit from anon, authenticated;
revoke all on public.integration_errors from anon, authenticated;

revoke all on function public.integration_normalize_report(text) from public;
grant execute on function public.integration_normalize_report(text) to anon, authenticated;
