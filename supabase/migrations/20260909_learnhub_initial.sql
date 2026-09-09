-- LearnHub initial user-scoped persistence. Additive and safe to re-run.
begin;

create table if not exists public.learning_snapshots (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  snapshot jsonb not null check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot ? 'schema'
    and snapshot->>'schema' = 'learnhub.learning-backup'
    and snapshot ? 'version'
    and snapshot->'version' = '1'::jsonb
    and snapshot ? 'data'
    and jsonb_typeof(snapshot->'data') = 'object'
    and octet_length(snapshot::text) <= 8000000
  ),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('wrong_answer', 'inaccurate', 'unclear', 'rendering', 'other')),
  description text not null check (char_length(description) between 1 and 4000),
  course_id text,
  lesson_id text,
  step_id text,
  created_at timestamptz not null default now()
);

alter table public.learning_snapshots enable row level security;
alter table public.learning_snapshots force row level security;
alter table public.content_reports enable row level security;
alter table public.content_reports force row level security;

drop policy if exists learning_snapshots_select_own on public.learning_snapshots;
create policy learning_snapshots_select_own
  on public.learning_snapshots for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists learning_snapshots_insert_own on public.learning_snapshots;
create policy learning_snapshots_insert_own
  on public.learning_snapshots for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists learning_snapshots_update_own on public.learning_snapshots;
create policy learning_snapshots_update_own
  on public.learning_snapshots for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own
  on public.content_reports for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists content_reports_insert_own on public.content_reports;
create policy content_reports_insert_own
  on public.content_reports for insert to authenticated
  with check (owner_id = auth.uid());

revoke all on table public.learning_snapshots from public;
revoke all on table public.learning_snapshots from anon;
revoke all on table public.learning_snapshots from authenticated;
revoke all on table public.content_reports from public;
revoke all on table public.content_reports from anon;
revoke all on table public.content_reports from authenticated;
grant select, insert, update on table public.learning_snapshots to authenticated;
grant select, insert on table public.content_reports to authenticated;

create or replace function public.put_learning_snapshot(
  p_snapshot jsonb,
  p_expected_revision integer
)
returns table (revision integer, updated_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if p_expected_revision is null then
    return query
      insert into public.learning_snapshots (owner_id, snapshot, revision, updated_at)
      values (auth.uid(), p_snapshot, 1, now())
      on conflict (owner_id) do nothing
      returning public.learning_snapshots.revision, public.learning_snapshots.updated_at;
  else
    return query
      update public.learning_snapshots as ls
         set snapshot = p_snapshot,
             revision = ls.revision + 1,
             updated_at = now()
       where ls.owner_id = auth.uid()
         and ls.revision = p_expected_revision
      returning ls.revision, ls.updated_at;
  end if;
end;
$$;

revoke all on function public.put_learning_snapshot(jsonb, integer) from public;
revoke all on function public.put_learning_snapshot(jsonb, integer) from anon;
grant execute on function public.put_learning_snapshot(jsonb, integer) to authenticated;

commit;
