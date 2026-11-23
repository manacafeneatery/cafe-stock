-- =====================================================================
-- Upgrade 004: keamanan
--  1) Akun baru berstatus 'pending' sampai disetujui Admin
--  2) HPP & harga beli hanya bisa dibaca Admin (tabel ingredient_costs)
--  3) Seluruh data hanya untuk anggota (admin/staff) yang sudah disetujui
-- Jalankan di Supabase > SQL Editor SETELAH 003. Aman dijalankan berulang.
-- =====================================================================

-- ---------- 1) Peran 'pending' + email di profil ----------
alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','staff','pending'));
alter table public.profiles alter column role set default 'pending';

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','staff'));
$$;
grant execute on function public.is_member() to authenticated;

-- User pertama = admin; berikutnya = pending (menunggu persetujuan admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  );
  return new;
end $$;

-- ---------- 2) Biaya dipisah ke tabel khusus admin ----------
create table if not exists public.ingredient_costs (
  ingredient_id uuid primary key references public.ingredients(id) on delete cascade,
  avg_cost      numeric not null default 0 check (avg_cost >= 0),   -- HPP per unit (rata-rata tertimbang)
  last_cost     numeric not null default 0 check (last_cost >= 0)   -- harga beli terakhir per unit
);

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'ingredients' and column_name = 'avg_cost') then
    insert into public.ingredient_costs (ingredient_id, avg_cost, last_cost)
    select id, avg_cost, last_cost from public.ingredients
    on conflict (ingredient_id) do nothing;
  end if;
end $$;

insert into public.ingredient_costs (ingredient_id)
select id from public.ingredients on conflict (ingredient_id) do nothing;

create or replace function public.create_cost_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ingredient_costs (ingredient_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists after_ingredient_insert on public.ingredients;
create trigger after_ingredient_insert after insert on public.ingredients
  for each row execute function public.create_cost_row();

-- Trigger stok memakai tabel biaya
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ing public.ingredients%rowtype;
  cst public.ingredient_costs%rowtype;
  new_stock numeric;
begin
  select * into ing from public.ingredients where id = new.ingredient_id for update;
  if not found then
    raise exception 'Bahan tidak ditemukan';
  end if;
  insert into public.ingredient_costs (ingredient_id) values (ing.id) on conflict do nothing;
  select * into cst from public.ingredient_costs where ingredient_id = ing.id for update;

  if new.type = 'in' then
    new_stock := ing.current_stock + new.quantity;
    update public.ingredient_costs
       set avg_cost = case when new_stock > 0
                           then (ing.current_stock * cst.avg_cost + new.quantity * new.unit_cost) / new_stock
                           else cst.avg_cost end,
           last_cost = new.unit_cost
     where ingredient_id = ing.id;
    update public.ingredients set current_stock = new_stock where id = ing.id;
  elsif new.type = 'adjust_in' then
    new.unit_cost := cst.avg_cost;
    update public.ingredients set current_stock = current_stock + new.quantity where id = ing.id;
  else  -- out, waste, adjust_out
    if new.quantity > ing.current_stock then
      raise exception 'Stok % tidak cukup (tersisa % %)', ing.name, ing.current_stock, ing.unit;
    end if;
    new.unit_cost := cst.avg_cost;
    update public.ingredients set current_stock = current_stock - new.quantity where id = ing.id;
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;

-- Kolom biaya lama di tabel bahan dihapus (sudah dipindah)
alter table public.ingredients drop column if exists avg_cost;
alter table public.ingredients drop column if exists last_cost;

-- ---------- 3) Kebijakan akses (RLS) ----------
alter table public.ingredient_costs enable row level security;
grant select on public.ingredient_costs to authenticated;
drop policy if exists "costs_admin_read" on public.ingredient_costs;
create policy "costs_admin_read" on public.ingredient_costs for select to authenticated using (public.is_admin());

-- Profil: tiap orang hanya melihat dirinya; admin melihat & mengubah semua
drop policy if exists "profiles_read"  on public.profiles;
drop policy if exists "profiles_admin" on public.profiles;
create policy "profiles_read"  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles_admin" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Data operasional: hanya anggota yang sudah disetujui
drop policy if exists "ingredients_read" on public.ingredients;
create policy "ingredients_read" on public.ingredients for select to authenticated using (public.is_member());

drop policy if exists "categories_read" on public.categories;
create policy "categories_read" on public.categories for select to authenticated using (public.is_member());

drop policy if exists "movements_read"   on public.stock_movements;
drop policy if exists "movements_insert" on public.stock_movements;
create policy "movements_read"   on public.stock_movements for select to authenticated using (public.is_member());
create policy "movements_insert" on public.stock_movements for insert to authenticated
  with check (created_by = auth.uid() and public.is_member());

-- Menu & resep: hanya admin
drop policy if exists "menus_read"  on public.menus;
drop policy if exists "recipe_read" on public.recipe_items;

-- Kolom unit_cost (biaya) di riwayat tidak boleh dibaca lewat API
revoke select on public.stock_movements from authenticated;
grant select (id, ingredient_id, type, quantity, note, created_by, created_at) on public.stock_movements to authenticated;
grant insert on public.stock_movements to authenticated;
