-- FIX for db/premium_lock.sql: the insert policy on fitness_test_results called is_premium(),
-- but signed-in users have no EXECUTE permission on that helper, so EVERY save failed
-- (also for Premium users). The policy now checks the user's own user_premium row directly
-- (users are allowed to read their own row there). Safe to run more than once.

drop policy if exists fitness_test_results_insert_premium on public.fitness_test_results;
create policy fitness_test_results_insert_premium on public.fitness_test_results
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_premium p
      where p.user_id = auth.uid()
        and (p.lifetime or p.premium_until > now())
    )
  );

-- Check afterwards (as yourself in the app): saving a Fitness Test should work again.
--   select polname, pg_get_expr(polwithcheck, polrelid) from pg_policy
--   where polrelid = 'public.fitness_test_results'::regclass and polcmd = 'a';
