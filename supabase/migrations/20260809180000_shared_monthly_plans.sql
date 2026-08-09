-- =============================================================================
-- Plans mensuels partagés
--   Lecture ouverte à tous les utilisateurs connectés, écriture (création /
--   modification / suppression) strictement réservée à l'auteur du plan.
--   Remplace la policy « own_plans » (ALL) qui masquait aussi la lecture.
-- =============================================================================

drop policy if exists "own_plans" on public.monthly_menu_plans;

drop policy if exists "plans_read_all" on public.monthly_menu_plans;
create policy "plans_read_all" on public.monthly_menu_plans
  for select to authenticated using (true);

drop policy if exists "plans_insert_own" on public.monthly_menu_plans;
create policy "plans_insert_own" on public.monthly_menu_plans
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "plans_update_own" on public.monthly_menu_plans;
create policy "plans_update_own" on public.monthly_menu_plans
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "plans_delete_own" on public.monthly_menu_plans;
create policy "plans_delete_own" on public.monthly_menu_plans
  for delete to authenticated using (auth.uid() = user_id);
