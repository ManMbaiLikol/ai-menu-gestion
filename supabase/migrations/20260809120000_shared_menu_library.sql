-- =============================================================================
-- Bibliothèque de menus partagée
--   1) Table `profiles` : nom public du créateur (auth.users n'est pas lisible
--      par les autres utilisateurs).
--   2) Lecture ouverte à tous les utilisateurs connectés sur les menus
--      (menus / menu_items / menu_item_ingredients + ingrédients référencés).
--   3) Écriture (création / modification / suppression) réservée au créateur.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Profils publics
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Crée / met à jour le profil à partir des métadonnées d'inscription.
create or replace function public.sync_profile_from_auth()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, username)
  values (
    NEW.id,
    nullif(btrim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), ''),
    nullif(btrim(coalesce(NEW.raw_user_meta_data->>'username', '')), '')
  )
  on conflict (id) do update
     set full_name  = coalesce(excluded.full_name, public.profiles.full_name),
         username   = coalesce(excluded.username,  public.profiles.username),
         updated_at = now();
  return NEW;
end;$$;

drop trigger if exists trg_sync_profile on auth.users;
create trigger trg_sync_profile
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_profile_from_auth();

-- Reprise des comptes déjà existants
insert into public.profiles (id, full_name, username)
select u.id,
       nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
       nullif(btrim(coalesce(u.raw_user_meta_data->>'username', '')), '')
  from auth.users u
on conflict (id) do nothing;

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch
before update on public.profiles
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

-- Le nom du créateur doit être lisible par tous les utilisateurs connectés.
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
  for select to authenticated using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 2) Menus : lecture pour tous, écriture pour le créateur
-- ---------------------------------------------------------------------------

drop policy if exists "own_menus" on public.menus;

drop policy if exists "menus_read_all" on public.menus;
create policy "menus_read_all" on public.menus
  for select to authenticated using (true);

drop policy if exists "menus_insert_own" on public.menus;
create policy "menus_insert_own" on public.menus
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "menus_update_own" on public.menus;
create policy "menus_update_own" on public.menus
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "menus_delete_own" on public.menus;
create policy "menus_delete_own" on public.menus
  for delete to authenticated using (auth.uid() = user_id);

-- Plats : lecture pour tous, écriture dérivée du propriétaire du menu parent
drop policy if exists "own_menu_items" on public.menu_items;

drop policy if exists "menu_items_read_all" on public.menu_items;
create policy "menu_items_read_all" on public.menu_items
  for select to authenticated using (true);

drop policy if exists "menu_items_insert_own" on public.menu_items;
create policy "menu_items_insert_own" on public.menu_items
  for insert to authenticated
  with check (exists (select 1 from public.menus m
                       where m.id = menu_items.menu_id and m.user_id = auth.uid()));

drop policy if exists "menu_items_update_own" on public.menu_items;
create policy "menu_items_update_own" on public.menu_items
  for update to authenticated
  using (exists (select 1 from public.menus m
                  where m.id = menu_items.menu_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.menus m
                  where m.id = menu_items.menu_id and m.user_id = auth.uid()));

drop policy if exists "menu_items_delete_own" on public.menu_items;
create policy "menu_items_delete_own" on public.menu_items
  for delete to authenticated
  using (exists (select 1 from public.menus m
                  where m.id = menu_items.menu_id and m.user_id = auth.uid()));

-- Jonction ingrédients : lecture pour tous, écriture via menu_item -> menu
drop policy if exists "own_mii" on public.menu_item_ingredients;

drop policy if exists "mii_read_all" on public.menu_item_ingredients;
create policy "mii_read_all" on public.menu_item_ingredients
  for select to authenticated using (true);

drop policy if exists "mii_insert_own" on public.menu_item_ingredients;
create policy "mii_insert_own" on public.menu_item_ingredients
  for insert to authenticated
  with check (exists (select 1 from public.menu_items mi
                        join public.menus m on m.id = mi.menu_id
                       where mi.id = menu_item_ingredients.menu_item_id
                         and m.user_id = auth.uid()));

drop policy if exists "mii_update_own" on public.menu_item_ingredients;
create policy "mii_update_own" on public.menu_item_ingredients
  for update to authenticated
  using (exists (select 1 from public.menu_items mi
                   join public.menus m on m.id = mi.menu_id
                  where mi.id = menu_item_ingredients.menu_item_id
                    and m.user_id = auth.uid()))
  with check (exists (select 1 from public.menu_items mi
                   join public.menus m on m.id = mi.menu_id
                  where mi.id = menu_item_ingredients.menu_item_id
                    and m.user_id = auth.uid()));

drop policy if exists "mii_delete_own" on public.menu_item_ingredients;
create policy "mii_delete_own" on public.menu_item_ingredients
  for delete to authenticated
  using (exists (select 1 from public.menu_items mi
                   join public.menus m on m.id = mi.menu_id
                  where mi.id = menu_item_ingredients.menu_item_id
                    and m.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 3) Ingrédients : lecture de ses propres ingrédients + de ceux qui composent
--    un menu partagé (sinon les détails d'un menu d'un autre utilisateur
--    afficheraient des ingrédients vides). Écriture toujours réservée.
-- ---------------------------------------------------------------------------

drop policy if exists "own_ingredients" on public.ingredients;

drop policy if exists "ingredients_read" on public.ingredients;
create policy "ingredients_read" on public.ingredients
  for select to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.menu_item_ingredients mii
                where mii.ingredient_id = ingredients.id)
  );

drop policy if exists "ingredients_insert_own" on public.ingredients;
create policy "ingredients_insert_own" on public.ingredients
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "ingredients_update_own" on public.ingredients;
create policy "ingredients_update_own" on public.ingredients
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ingredients_delete_own" on public.ingredients;
create policy "ingredients_delete_own" on public.ingredients
  for delete to authenticated using (auth.uid() = user_id);
