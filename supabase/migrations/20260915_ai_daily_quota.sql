-- Durable, per-account AI quota. API keys remain only in the application server.
begin;

create table if not exists public.ai_quota_policy (
  policy_key boolean primary key default true check (policy_key),
  per_user_request_limit integer not null default 100 check (per_user_request_limit > 0),
  per_user_output_token_limit integer not null default 100000 check (per_user_output_token_limit > 0),
  updated_at timestamptz not null default now()
);

insert into public.ai_quota_policy (policy_key)
values (true)
on conflict (policy_key) do nothing;

create table if not exists public.ai_usage_daily (
  owner_id uuid not null references auth.users (id) on delete cascade,
  usage_day date not null,
  requests integer not null default 0 check (requests >= 0),
  reserved_output_tokens integer not null default 0 check (reserved_output_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, usage_day)
);

alter table public.ai_quota_policy enable row level security;
alter table public.ai_quota_policy force row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.ai_usage_daily force row level security;

revoke all on table public.ai_quota_policy from public, anon, authenticated;
revoke all on table public.ai_usage_daily from public, anon, authenticated;

create or replace function public.reserve_ai_daily_usage(p_requested_tokens integer)
returns table (
  requests integer,
  reserved_output_tokens integer,
  request_limit integer,
  output_token_limit integer,
  usage_day date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quota public.ai_quota_policy%rowtype;
  current_day date := (now() at time zone 'utc')::date;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_requested_tokens is null or p_requested_tokens <= 0 then
    raise exception 'Requested token count must be positive';
  end if;

  select * into quota from public.ai_quota_policy where policy_key = true;
  if not found then
    raise exception 'AI quota policy is not configured';
  end if;

  return query
    insert into public.ai_usage_daily as usage (owner_id, usage_day, requests, reserved_output_tokens, updated_at)
    values (auth.uid(), current_day, 1, p_requested_tokens, now())
    on conflict (owner_id, usage_day) do update
      set requests = usage.requests + 1,
          reserved_output_tokens = usage.reserved_output_tokens + excluded.reserved_output_tokens,
          updated_at = now()
      where usage.requests < quota.per_user_request_limit
        and usage.reserved_output_tokens + excluded.reserved_output_tokens <= quota.per_user_output_token_limit
    returning usage.requests, usage.reserved_output_tokens, quota.per_user_request_limit, quota.per_user_output_token_limit, usage.usage_day;
end;
$$;

create or replace function public.get_ai_daily_usage()
returns table (
  requests integer,
  reserved_output_tokens integer,
  request_limit integer,
  output_token_limit integer,
  usage_day date
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(usage.requests, 0),
    coalesce(usage.reserved_output_tokens, 0),
    quota.per_user_request_limit,
    quota.per_user_output_token_limit,
    (now() at time zone 'utc')::date
  from public.ai_quota_policy quota
  left join public.ai_usage_daily usage
    on usage.owner_id = auth.uid()
   and usage.usage_day = (now() at time zone 'utc')::date
  where quota.policy_key = true
    and auth.uid() is not null;
$$;

revoke all on function public.reserve_ai_daily_usage(integer) from public, anon;
revoke all on function public.get_ai_daily_usage() from public, anon;
grant execute on function public.reserve_ai_daily_usage(integer) to authenticated;
grant execute on function public.get_ai_daily_usage() to authenticated;

commit;
