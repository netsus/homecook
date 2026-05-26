-- Admin Foundation: read-only internal operations visibility.
-- Tables are intentionally service-role only. Runtime admin identity comes
-- exclusively from public.admin_members; no environment allowlist is used.

create table if not exists public.admin_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint admin_members_role_check check (role in ('viewer')),
  constraint admin_members_user_unique unique (user_id)
);

create unique index if not exists idx_admin_members_user_id
  on public.admin_members (user_id);

alter table public.admin_members enable row level security;

revoke all on public.admin_members from anon, authenticated;
grant all privileges on public.admin_members to service_role;

create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info',
  source text not null,
  actor_user_id uuid,
  target_user_id uuid,
  request_path text,
  http_status integer,
  error_code text,
  message_summary text,
  metadata_json jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_events_severity_check
    check (severity in ('info', 'warn', 'error', 'critical'))
);

create index if not exists idx_operational_events_type
  on public.operational_events (event_type);

create index if not exists idx_operational_events_severity
  on public.operational_events (severity);

create index if not exists idx_operational_events_created_at
  on public.operational_events (created_at desc);

create index if not exists idx_operational_events_source
  on public.operational_events (source);

alter table public.operational_events enable row level security;

revoke all on public.operational_events from anon, authenticated;
grant all privileges on public.operational_events to service_role;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text,
  target_id text,
  request_path text not null,
  result text not null default 'success',
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_result_check
    check (result in ('success', 'failure', 'forbidden'))
);

create index if not exists idx_admin_audit_logs_actor
  on public.admin_audit_logs (actor_admin_user_id);

create index if not exists idx_admin_audit_logs_action
  on public.admin_audit_logs (action);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs (created_at desc);

create index if not exists idx_admin_audit_logs_target_type
  on public.admin_audit_logs (target_type);

alter table public.admin_audit_logs enable row level security;

revoke all on public.admin_audit_logs from anon, authenticated;
grant all privileges on public.admin_audit_logs to service_role;

-- First-admin bootstrap is an operator-owned SQL/service-role action.
-- Replace the UUID with the OAuth user's auth.users.id:
-- insert into public.admin_members (user_id, role) values ('<operator-uuid>', 'viewer')
-- on conflict (user_id) do nothing;
