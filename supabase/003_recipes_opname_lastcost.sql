-- =====================================================================
-- Upgrade 003: harga beli terakhir, menu & resep (HPP per porsi), stok opname
-- Jalankan di Supabase > SQL Editor SETELAH 002_categories.sql. Aman dijalankan berulang.
-- =====================================================================

-- 1) Harga beli terakhir per bahan
alter table public.ingredients add column if not exists last_cost numeric not null default 0 check (last_cost >= 0);

update public.ingredients i
   set last_cost = coalesce((
     select m.unit_cost from public.stock_movements m
      where m.ingredient_id = i.id and m.type = 'in'
      order by m.created_at desc limit 1), i.avg_cost);

-- 2) Tipe transaksi baru untuk stok opname (penyesuaian)
alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements
  add constraint stock_movements_type_check check (type in ('in','out','waste','adjust_in','adjust_out'));

-- 3) Trigger stok diperbarui: simpan last_cost + dukung opname
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ing public.ingredients%rowtype;
  new_stock numeric;
begin
  select * into ing from public.ingredients where id = new.ingredient_id for update;
  if not found then
    raise exception 'Bahan tidak ditemukan';
  end if;

  if new.type = 'in' then
    new_stock := ing.current_stock + new.quantity;
    update public.ingredients
       set avg_cost = case when new_stock > 0
                           then (ing.current_stock * ing.avg_cost + new.quantity * new.unit_cost) / new_stock
                           else ing.avg_cost end,
           last_cost = new.unit_cost,
           current_stock = new_stock
     where id = ing.id;
  elsif new.type = 'adjust_in' then
    new.unit_cost := ing.avg_cost;
    update public.ingredients set current_stock = current_stock + new.quantity where id = ing.id;
  else  -- out, waste, adjust_out
    if new.quantity > ing.current_stock then
      raise exception 'Stok % tidak cukup (tersisa % %)', ing.name, ing.current_stock, ing.unit;
    end if;
    new.unit_cost := ing.avg_cost;
    update public.ingredients set current_stock = current_stock - new.quantity where id = ing.id;
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;

-- 4) Menu & resep
create table if not exists public.menus (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  price       numeric not null default 0 check (price >= 0),   -- harga jual
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id             uuid primary key default gen_random_uuid(),
  menu_id        uuid not null references public.menus(id) on delete cascade,
  ingredient_id  uuid not null references public.ingredients(id) on delete restrict,
  quantity       numeric not null check (quantity > 0),       -- jumlah per 1 porsi
  unique (menu_id, ingredient_id)
);

grant select, insert, update, delete on public.menus        to authenticated;
grant select, insert, update, delete on public.recipe_items to authenticated;
alter table public.menus        enable row level security;
alter table public.recipe_items enable row level security;

drop policy if exists "menus_read"   on public.menus;
drop policy if exists "menus_admin"  on public.menus;
drop policy if exists "recipe_read"  on public.recipe_items;
drop policy if exists "recipe_admin" on public.recipe_items;
create policy "menus_read"   on public.menus        for select to authenticated using (true);
create policy "menus_admin"  on public.menus        for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "recipe_read"  on public.recipe_items for select to authenticated using (true);
create policy "recipe_admin" on public.recipe_items for all    to authenticated using (public.is_admin()) with check (public.is_admin());
