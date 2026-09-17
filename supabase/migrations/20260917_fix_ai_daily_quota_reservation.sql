-- Fix the existing production quota function's ambiguous usage_day reference.
-- Run this once in the LearnHub Supabase SQL Editor, then future deployments
-- can use the corrected 20260915_ai_daily_quota.sql definition.
begin;

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
    on conflict on constraint ai_usage_daily_pkey do update
      set requests = usage.requests + 1,
          reserved_output_tokens = usage.reserved_output_tokens + excluded.reserved_output_tokens,
          updated_at = now()
      where usage.requests < quota.per_user_request_limit
        and usage.reserved_output_tokens + excluded.reserved_output_tokens <= quota.per_user_output_token_limit
    returning usage.requests, usage.reserved_output_tokens, quota.per_user_request_limit, quota.per_user_output_token_limit, usage.usage_day;
end;
$$;

revoke all on function public.reserve_ai_daily_usage(integer) from public, anon;
grant execute on function public.reserve_ai_daily_usage(integer) to authenticated;

commit;
