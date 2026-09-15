-- Allow an authenticated LearnHub customer to permanently delete only their own account.
-- learning_snapshots and content_reports are removed by their auth.users ON DELETE CASCADE.
begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_my_account() from public;
revoke all on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
