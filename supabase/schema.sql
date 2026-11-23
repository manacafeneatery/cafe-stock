-- =====================================================================
-- Cafe Stock Monitor - skema database Supabase
-- Jalankan seluruh file ini di Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabel ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin','staff')),
  created_at  timestamptz not null default now()
);

create table if not exists public.ingredients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  unit           text not null,                       -- gram, ml, pcs, dll
  category       text,
  min_stock      numeric not null default 0 check (min_stock >= 0),
  current_stock  numeric not null default 0 check (current_stock >= 0),
  avg_cost       numeric not null default 0 check (avg_cost >= 0), -- HPP per unit (rata-rata tertimbang)
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade,
  type           text not null check (type in ('in','out','waste')),
  quantity       numeric not null check (quantity > 0),
  unit_cost      numeric not null default 0 check (unit_cost >= 0), -- harga per unit
  note           text,
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists stock_movements_ing_date_idx
  on public.stock_movements (ingredient_id, created_at desc);
create index if not exists stock_movements_date_idx
  on public.stock_movements (created_at desc);

-- ---------- Helper ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- Profil otomatis saat user mendaftar ----------
-- User pertama yang mendaftar otomatis menjadi ADMIN, selanjutnya KARYAWAN.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'staff' else 'admin' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Update stok & HPP otomatis ----------
-- Masuk : stok bertambah, HPP = rata-rata tertimbang (weighted average)
-- Keluar / Waste : stok berkurang, nilai dicatat sesuai HPP saat itu
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
           current_stock = new_stock
     where id = ing.id;
  else
    if new.quantity > ing.current_stock then
      raise exception 'Stok % tidak cukup (tersisa % %)', ing.name, ing.current_stock, ing.unit;
    end if;
    new.unit_cost := ing.avg_cost;
    update public.ingredients set current_stock = current_stock - new.quantity where id = ing.id;
  end if;

  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;

drop trigger if exists before_stock_movement on public.stock_movements;
create trigger before_stock_movement
  before insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- ---------- Izin akses tabel (diperlukan di Supabase versi baru) ----------
-- Row Level Security di bawah tetap membatasi siapa boleh apa.
grant usage on schema public to authenticated;
grant select, update                 on public.profiles        to authenticated;
grant select, insert, update, delete on public.ingredients     to authenticated;
grant select, insert                 on public.stock_movements to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles        enable row level security;
alter table public.ingredients     enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_admin"  on public.profiles;
create policy "profiles_read"  on public.profiles for select to authenticated using (true);
create policy "profiles_admin" on public.profiles for update to authenticated using (public.is_admin());

drop policy if exists "ingredients_read"  on public.ingredients;
drop policy if exists "ingredients_admin" on public.ingredients;
create policy "ingredients_read"  on public.ingredients for select to authenticated using (true);
create policy "ingredients_admin" on public.ingredients for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "movements_read"   on public.stock_movements;
drop policy if exists "movements_insert" on public.stock_movements;
create policy "movements_read"   on public.stock_movements for select to authenticated using (true);
create policy "movements_insert" on public.stock_movements for insert to authenticated
  with check (created_by = auth.uid());

-- ---------- Pemulihan: buat profil untuk akun yang sudah terdaftar sebelum skema ini dijalankan ----------
-- Akun tertua otomatis menjadi ADMIN jika belum ada admin.
insert into public.profiles (id, full_name, role)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       case when not exists (select 1 from public.profiles where role = 'admin')
                 and u.created_at = (select min(created_at) from auth.users)
            then 'admin' else 'staff' end
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- ---------- Data contoh (opsional, hapus jika tidak perlu) ----------
insert into public.ingredients (name, unit, category, min_stock) values
  ('Biji Kopi Arabica', 'gram', 'Kopi', 2000),
  ('Susu Fresh Milk',   'ml',   'Dairy', 5000),
  ('Gula Pasir',        'gram', 'Pemanis', 1000),
  ('Sirup Vanilla',     'ml',   'Sirup', 500),
  ('Cup Plastik 16oz',  'pcs',  'Kemasan', 100),
  ('Matcha Powder',     'gram', 'Teh', 200)
on conflict (name) do nothing;
