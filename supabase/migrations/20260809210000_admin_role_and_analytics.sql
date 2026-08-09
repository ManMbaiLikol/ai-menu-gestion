-- =============================================================================
-- Rôle administrateur + fonctions de suivi de l'activité
--   1) Table `user_roles` + fonction `is_admin()` (SECURITY DEFINER pour éviter
--      la récursion RLS), avec garde-fou « il reste toujours un admin ».
--   2) Lecture élargie à l'admin sur les données restées privées
--      (ingrédients, historique des prix) et droits de modération sur les
--      contenus partagés (menus, plats, jonctions, plans).
--   3) Fonctions d'analyse réservées à l'admin : vue d'ensemble, activité par
--      utilisateur, évolution mensuelle, flux d'activité récente. Elles lisent
--      `auth.users` (non exposée à l'API), d'où SECURITY DEFINER + contrôle
--      explicite du rôle en début de fonction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Rôles
-- ---------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- SECURITY DEFINER : la fonction contourne la RLS de `user_roles`, ce qui évite
-- une récursion infinie quand les policies de cette table appellent is_admin().
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles r
     where r.user_id = uid and r.role = 'admin'
  );
$$;

revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated;

-- Empêche de se retrouver sans aucun administrateur (plus personne ne pourrait
-- alors en nommer un depuis l'application).
create or replace function public.prevent_last_admin_removal()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if OLD.role = 'admin'
     and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'Impossible de retirer le dernier administrateur'
      using errcode = '42501';
  end if;
  return OLD;
end;$$;

drop trigger if exists trg_prevent_last_admin_removal on public.user_roles;
create trigger trg_prevent_last_admin_removal
before delete on public.user_roles
for each row execute function public.prevent_last_admin_removal();

alter table public.user_roles enable row level security;

-- Chacun voit son propre rôle ; l'admin voit tout le monde.
drop policy if exists "user_roles_read" on public.user_roles;
create policy "user_roles_read" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Seul un admin peut nommer ou révoquer un admin.
drop policy if exists "user_roles_admin_write" on public.user_roles;
create policy "user_roles_admin_write" on public.user_roles
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2) Accès administrateur aux données
-- ---------------------------------------------------------------------------

-- Ingrédients : propriétaire, ingrédients d'un menu partagé, ou admin.
drop policy if exists "ingredients_read" on public.ingredients;
create policy "ingredients_read" on public.ingredients
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.is_admin()
    or exists (select 1 from public.menu_item_ingredients mii
                where mii.ingredient_id = ingredients.id)
  );

-- Historique des prix : la policy « own_price_history » (ALL) est éclatée pour
-- ouvrir la lecture à l'admin sans lui donner l'écriture.
drop policy if exists "own_price_history" on public.price_history;

drop policy if exists "price_history_read" on public.price_history;
create policy "price_history_read" on public.price_history
  for select to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "price_history_insert_own" on public.price_history;
create policy "price_history_insert_own" on public.price_history
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "price_history_update_own" on public.price_history;
create policy "price_history_update_own" on public.price_history
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "price_history_delete_own" on public.price_history;
create policy "price_history_delete_own" on public.price_history
  for delete to authenticated using (auth.uid() = user_id);

-- Modération : l'admin peut corriger ou supprimer n'importe quel contenu partagé.
drop policy if exists "menus_update_own" on public.menus;
create policy "menus_update_own" on public.menus
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "menus_delete_own" on public.menus;
create policy "menus_delete_own" on public.menus
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "menu_items_update_own" on public.menu_items;
create policy "menu_items_update_own" on public.menu_items
  for update to authenticated
  using (public.is_admin() or exists (select 1 from public.menus m
          where m.id = menu_items.menu_id and m.user_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.menus m
          where m.id = menu_items.menu_id and m.user_id = auth.uid()));

drop policy if exists "menu_items_delete_own" on public.menu_items;
create policy "menu_items_delete_own" on public.menu_items
  for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.menus m
          where m.id = menu_items.menu_id and m.user_id = auth.uid()));

drop policy if exists "mii_update_own" on public.menu_item_ingredients;
create policy "mii_update_own" on public.menu_item_ingredients
  for update to authenticated
  using (public.is_admin() or exists (select 1 from public.menu_items mi
           join public.menus m on m.id = mi.menu_id
          where mi.id = menu_item_ingredients.menu_item_id and m.user_id = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.menu_items mi
           join public.menus m on m.id = mi.menu_id
          where mi.id = menu_item_ingredients.menu_item_id and m.user_id = auth.uid()));

drop policy if exists "mii_delete_own" on public.menu_item_ingredients;
create policy "mii_delete_own" on public.menu_item_ingredients
  for delete to authenticated
  using (public.is_admin() or exists (select 1 from public.menu_items mi
           join public.menus m on m.id = mi.menu_id
          where mi.id = menu_item_ingredients.menu_item_id and m.user_id = auth.uid()));

drop policy if exists "plans_update_own" on public.monthly_menu_plans;
create policy "plans_update_own" on public.monthly_menu_plans
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists "plans_delete_own" on public.monthly_menu_plans;
create policy "plans_delete_own" on public.monthly_menu_plans
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Fonctions d'analyse (administrateur uniquement)
-- ---------------------------------------------------------------------------

-- Indicateurs globaux de l'application.
create or replace function public.admin_overview()
returns table (
  users_total       bigint,
  users_active_30d  bigint,
  users_new_30d     bigint,
  menus_total       bigint,
  plans_total       bigint,
  ingredients_total bigint,
  price_updates     bigint,
  avg_menu_cost     numeric,
  avg_inflation     numeric
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  select (select count(*) from auth.users),
         (select count(*) from auth.users u where u.last_sign_in_at > now() - interval '30 days'),
         (select count(*) from auth.users u where u.created_at > now() - interval '30 days'),
         (select count(*) from public.menus),
         (select count(*) from public.monthly_menu_plans),
         (select count(*) from public.ingredients),
         (select count(*) from public.price_history),
         (select coalesce(round(avg(m.total_cost)), 0) from public.menus m where m.total_cost > 0),
         (select coalesce(round(avg(h.inflation_rate)::numeric, 2), 0) from public.price_history h);
end;$$;

-- Activité détaillée compte par compte.
create or replace function public.admin_user_activity()
returns table (
  id              uuid,
  email           text,
  full_name       text,
  username        text,
  signed_up_at    timestamptz,
  last_sign_in_at timestamptz,
  menus_count     bigint,
  plans_count     bigint,
  ingredients_count bigint,
  price_updates   bigint,
  last_activity   timestamptz,
  admin_flag      boolean
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         p.full_name,
         p.username,
         u.created_at,
         u.last_sign_in_at,
         (select count(*) from public.menus x where x.user_id = u.id),
         (select count(*) from public.monthly_menu_plans x where x.user_id = u.id),
         (select count(*) from public.ingredients x where x.user_id = u.id),
         (select count(*) from public.price_history x where x.user_id = u.id),
         greatest(
           (select max(x.created_at) from public.menus x where x.user_id = u.id),
           (select max(x.created_at) from public.monthly_menu_plans x where x.user_id = u.id),
           (select max(x.created_at) from public.price_history x where x.user_id = u.id),
           u.last_sign_in_at
         ),
         public.is_admin(u.id)
    from auth.users u
    left join public.profiles p on p.id = u.id
   order by u.created_at;
end;$$;

-- Évolution mois par mois, reconstituée depuis les dates de création
-- existantes : l'historique est donc complet dès la première ouverture.
create or replace function public.admin_monthly_activity(p_months int default 12)
returns table (
  bucket        date,
  signups       bigint,
  menus         bigint,
  plans         bigint,
  price_updates bigint
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  with serie as (
    select generate_series(
             date_trunc('month', now()) - make_interval(months => greatest(p_months, 1) - 1),
             date_trunc('month', now()),
             interval '1 month'
           )::date as bucket
  )
  select s.bucket,
         (select count(*) from auth.users u
           where date_trunc('month', u.created_at)::date = s.bucket),
         (select count(*) from public.menus x
           where date_trunc('month', x.created_at)::date = s.bucket),
         (select count(*) from public.monthly_menu_plans x
           where date_trunc('month', x.created_at)::date = s.bucket),
         (select count(*) from public.price_history x
           where date_trunc('month', x.created_at)::date = s.bucket)
    from serie s
   order by s.bucket;
end;$$;

-- Fil chronologique des dernières actions, toutes tables confondues.
create or replace function public.admin_activity_feed(p_limit int default 40)
returns table (
  occurred_at timestamptz,
  kind        text,
  label       text,
  actor_id    uuid,
  actor_name  text
)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Reserve aux administrateurs' using errcode = '42501';
  end if;

  return query
  select * from (
    select u.created_at,
           'inscription'::text,
           coalesce(p.full_name, p.username, u.email)::text,
           u.id,
           coalesce(p.full_name, p.username, 'Utilisateur')::text
      from auth.users u left join public.profiles p on p.id = u.id

    union all
    select m.created_at, 'menu'::text, m.name::text, m.user_id,
           coalesce(p.full_name, p.username, 'Utilisateur')::text
      from public.menus m left join public.profiles p on p.id = m.user_id

    union all
    select pl.created_at, 'plan'::text,
           ('Plan ' || pl.month || '/' || pl.year || ' - '
             || round(pl.total_estimated_cost) || ' FCFA')::text,
           pl.user_id,
           coalesce(p.full_name, p.username, 'Utilisateur')::text
      from public.monthly_menu_plans pl left join public.profiles p on p.id = pl.user_id

    union all
    select h.created_at, 'prix'::text,
           (coalesce(i.name, 'Ingredient') || ' - ' || round(h.price) || ' FCFA')::text,
           h.user_id,
           coalesce(p.full_name, p.username, 'Utilisateur')::text
      from public.price_history h
      left join public.ingredients i on i.id = h.ingredient_id
      left join public.profiles p on p.id = h.user_id
  ) t
  order by 1 desc
  limit greatest(p_limit, 1);
end;$$;

revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_user_activity() from public, anon;
revoke all on function public.admin_monthly_activity(int) from public, anon;
revoke all on function public.admin_activity_feed(int) from public, anon;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_user_activity() to authenticated;
grant execute on function public.admin_monthly_activity(int) to authenticated;
grant execute on function public.admin_activity_feed(int) to authenticated;

-- Hygiène : fonction de trigger exposée en RPC sans raison (signalée par le
-- linter Supabase). Un appel direct échoue de toute façon, mais autant fermer.
revoke all on function public.sync_profile_from_auth() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Administrateur initial (identifié par son adresse, pas par un UUID)
-- ---------------------------------------------------------------------------

insert into public.user_roles (user_id, role)
select u.id, 'admin' from auth.users u
 where u.email = 'kamerdesignstyle@gmail.com'
on conflict do nothing;
