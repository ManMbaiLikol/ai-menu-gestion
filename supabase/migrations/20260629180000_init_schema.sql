-- =============================================================================
-- AI Menu Gestion — schéma initial (reflète la base réellement déployée)
-- Tables + FK ingrédients (jonction) + triggers de recalcul auto des coûts
-- + inflation réelle + RLS par utilisateur + bucket storage.
-- Les fonctions ont un search_path figé (durcissement sécurité).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

-- Table de référence des ingrédients & de leur prix courant (par utilisateur)
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Autres',
  unit text not null default 'kg',
  current_price numeric(12,2) not null default 0,
  currency text not null default 'FCFA',
  market_location text default 'Cameroun',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

-- Un menu (un plat / une préparation)
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cuisine_type text not null default 'camerounaise',
  serving_size int not null default 4,
  meal_type text not null default 'déjeuner',
  dietary_tags text[] not null default '{}',
  preparation_time int not null default 30,
  total_cost numeric(12,2) not null default 0,
  image_url text,
  is_analyzed_from_image boolean not null default false,
  created_at timestamptz not null default now()
);

-- Items composant un menu
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.menus(id) on delete cascade,
  dish_name text not null,
  meal_type text not null default 'déjeuner',
  preparation_time int not null default 30,
  estimated_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Jonction menu_item <-> ingredient (FK plutôt que JSONB libre)
create table if not exists public.menu_item_ingredients (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  quantity numeric(12,3) not null default 0,
  unit text not null default 'kg',
  line_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (menu_item_id, ingredient_id)
);

-- Historique des prix par ingrédient (inflation réelle)
create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  price numeric(12,2) not null,
  date_recorded date not null default current_date,
  inflation_rate numeric(8,3) not null default 0,
  created_at timestamptz not null default now()
);

-- Plans mensuels générés
create table if not exists public.monthly_menu_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month int not null,
  year int not null,
  budget_min numeric(12,2) not null default 0,
  budget_max numeric(12,2) not null default 0,
  serving_size int not null default 4,
  dietary_restrictions text[] not null default '{}',
  menu_data jsonb not null default '{}'::jsonb,
  total_estimated_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_menus_user on public.menus(user_id);
create index if not exists idx_menu_items_menu on public.menu_items(menu_id);
create index if not exists idx_mii_item on public.menu_item_ingredients(menu_item_id);
create index if not exists idx_mii_ingredient on public.menu_item_ingredients(ingredient_id);
create index if not exists idx_ingredients_user on public.ingredients(user_id);
create index if not exists idx_price_history_ingredient on public.price_history(ingredient_id);
create index if not exists idx_plans_user on public.monthly_menu_plans(user_id);

-- ---------------------------------------------------------------------------
-- 2) Fonctions & triggers (recalcul auto des coûts + inflation)
--    search_path figé sur chaque fonction (durcissement).
-- ---------------------------------------------------------------------------

-- line_cost = quantity * ingredient.current_price
create or replace function public.set_line_cost()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  select coalesce(i.current_price, 0) * NEW.quantity
    into NEW.line_cost
    from public.ingredients i
    where i.id = NEW.ingredient_id;
  if NEW.line_cost is null then
    NEW.line_cost := 0;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_set_line_cost on public.menu_item_ingredients;
create trigger trg_set_line_cost
before insert or update of quantity, ingredient_id
on public.menu_item_ingredients
for each row execute function public.set_line_cost();

-- Recalcule estimated_cost d'un menu_item puis le total du menu parent
create or replace function public.recompute_menu_item(p_item uuid)
returns void language plpgsql
set search_path = public, pg_temp
as $$
declare v_menu uuid;
begin
  update public.menu_items mi
     set estimated_cost = coalesce((
       select sum(line_cost) from public.menu_item_ingredients
       where menu_item_id = p_item), 0)
   where mi.id = p_item
   returning mi.menu_id into v_menu;

  if v_menu is not null then
    update public.menus m
       set total_cost = coalesce((
         select sum(estimated_cost) from public.menu_items
         where menu_id = v_menu), 0)
     where m.id = v_menu;
  end if;
end;$$;

-- Après changement sur la jonction, recalcule le(s) menu_item concerné(s)
create or replace function public.on_junction_change()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if (TG_OP = 'DELETE') then
    perform public.recompute_menu_item(OLD.menu_item_id);
    return OLD;
  else
    perform public.recompute_menu_item(NEW.menu_item_id);
    if (TG_OP = 'UPDATE' and OLD.menu_item_id <> NEW.menu_item_id) then
      perform public.recompute_menu_item(OLD.menu_item_id);
    end if;
    return NEW;
  end if;
end;$$;

drop trigger if exists trg_junction_recompute on public.menu_item_ingredients;
create trigger trg_junction_recompute
after insert or update or delete on public.menu_item_ingredients
for each row execute function public.on_junction_change();

-- Quand le prix d'un ingrédient change : rafraîchit les line_cost + recalcule
create or replace function public.on_ingredient_price_change()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  if NEW.current_price is distinct from OLD.current_price then
    update public.menu_item_ingredients
       set line_cost = quantity * NEW.current_price
     where ingredient_id = NEW.id;

    perform public.recompute_menu_item(s.menu_item_id)
      from (select distinct menu_item_id
              from public.menu_item_ingredients
             where ingredient_id = NEW.id) s;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_ingredient_price on public.ingredients;
create trigger trg_ingredient_price
after update of current_price on public.ingredients
for each row execute function public.on_ingredient_price_change();

-- updated_at automatique sur ingredients
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;$$;

drop trigger if exists trg_ingredients_touch on public.ingredients;
create trigger trg_ingredients_touch
before update on public.ingredients
for each row execute function public.touch_updated_at();

-- Inflation réelle calculée à chaque nouvelle ligne d'historique
create or replace function public.set_inflation_rate()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
declare prev numeric;
begin
  select price into prev
    from public.price_history
   where ingredient_id = NEW.ingredient_id
     and date_recorded <= NEW.date_recorded
   order by date_recorded desc, created_at desc
   limit 1;

  if prev is not null and prev <> 0 then
    NEW.inflation_rate := round(((NEW.price - prev) / prev) * 100, 3);
  else
    NEW.inflation_rate := 0;
  end if;
  return NEW;
end;$$;

drop trigger if exists trg_inflation on public.price_history;
create trigger trg_inflation
before insert on public.price_history
for each row execute function public.set_inflation_rate();

-- ---------------------------------------------------------------------------
-- 3) RLS (isolation par utilisateur)
-- ---------------------------------------------------------------------------

alter table public.ingredients           enable row level security;
alter table public.menus                 enable row level security;
alter table public.menu_items            enable row level security;
alter table public.menu_item_ingredients enable row level security;
alter table public.price_history         enable row level security;
alter table public.monthly_menu_plans    enable row level security;

drop policy if exists "own_ingredients" on public.ingredients;
create policy "own_ingredients" on public.ingredients
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_menus" on public.menus;
create policy "own_menus" on public.menus
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_price_history" on public.price_history;
create policy "own_price_history" on public.price_history
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own_plans" on public.monthly_menu_plans;
create policy "own_plans" on public.monthly_menu_plans
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- menu_items : propriété dérivée du menu parent
drop policy if exists "own_menu_items" on public.menu_items;
create policy "own_menu_items" on public.menu_items
  for all to authenticated
  using (exists (select 1 from public.menus m
                  where m.id = menu_items.menu_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.menus m
                  where m.id = menu_items.menu_id and m.user_id = auth.uid()));

-- menu_item_ingredients : propriété dérivée via menu_item -> menu
drop policy if exists "own_mii" on public.menu_item_ingredients;
create policy "own_mii" on public.menu_item_ingredients
  for all to authenticated
  using (exists (select 1 from public.menu_items mi
                   join public.menus m on m.id = mi.menu_id
                  where mi.id = menu_item_ingredients.menu_item_id
                    and m.user_id = auth.uid()))
  with check (exists (select 1 from public.menu_items mi
                   join public.menus m on m.id = mi.menu_id
                  where mi.id = menu_item_ingredients.menu_item_id
                    and m.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4) Storage : bucket des images de plats
--    Bucket public (servi par URL). Pas de policy SELECT large (pas de listing).
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

drop policy if exists "menu_images_insert" on storage.objects;
create policy "menu_images_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-images');

drop policy if exists "menu_images_update" on storage.objects;
create policy "menu_images_update" on storage.objects
  for update to authenticated using (bucket_id = 'menu-images');

drop policy if exists "menu_images_delete" on storage.objects;
create policy "menu_images_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'menu-images');
