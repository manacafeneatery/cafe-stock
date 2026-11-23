-- =====================================================================
-- Upgrade 006: Penjualan menu -> stok bahan terpotong otomatis sesuai resep
-- Jalankan di Supabase > SQL Editor SETELAH 005. Aman dijalankan berulang.
-- =====================================================================

-- Anggota (admin/karyawan) boleh melihat daftar menu & harga jual untuk berjualan.
-- Resep (recipe_items) tetap khusus Admin.
drop policy if exists "menus_read" on public.menus;
create policy "menus_read" on public.menus for select to authenticated using (public.is_member());

create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  menu_id     uuid references public.menus(id) on delete set null,
  menu_name   text not null,                                 -- salinan nama saat dijual
  quantity    integer not null check (quantity > 0),
  unit_price  numeric not null default 0 check (unit_price >= 0),  -- harga jual saat itu
  note        text,
  created_by  uuid default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists sales_date_idx on public.sales (created_at desc);

-- HPP (modal) per penjualan: khusus Admin
create table if not exists public.sale_costs (
  sale_id  uuid primary key references public.sales(id) on delete cascade,
  cogs     numeric not null default 0 check (cogs >= 0)      -- total HPP penjualan
);

alter table public.sales      enable row level security;
alter table public.sale_costs enable row level security;
grant select on public.sales      to authenticated;
grant select on public.sale_costs to authenticated;

drop policy if exists "sales_read"      on public.sales;
drop policy if exists "sale_costs_read" on public.sale_costs;
create policy "sales_read"      on public.sales      for select to authenticated using (public.is_member());
create policy "sale_costs_read" on public.sale_costs for select to authenticated using (public.is_admin());

-- Satu-satunya jalan mencatat penjualan. Atomik: jika satu bahan kurang, semuanya dibatalkan.
create or replace function public.record_sale(p_menu uuid, p_qty integer, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m          public.menus%rowtype;
  r          record;
  v_sale     uuid;
  v_cost     numeric;
  v_cogs     numeric := 0;
begin
  if not public.is_member() then
    raise exception 'Akses ditolak';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 1000 then
    raise exception 'Jumlah harus antara 1 dan 1000';
  end if;

  select * into m from public.menus where id = p_menu and is_active;
  if not found then
    raise exception 'Menu tidak ditemukan atau tidak aktif';
  end if;
  if not exists (select 1 from public.recipe_items where menu_id = m.id) then
    raise exception 'Menu "%" belum punya resep. Minta Admin mengisinya dulu.', m.name;
  end if;

  insert into public.sales (menu_id, menu_name, quantity, unit_price, note, created_by)
  values (m.id, m.name, p_qty, m.price, nullif(trim(p_note), ''), auth.uid())
  returning id into v_sale;

  for r in select ingredient_id, quantity from public.recipe_items where menu_id = m.id loop
    select coalesce(avg_cost, 0) into v_cost from public.ingredient_costs where ingredient_id = r.ingredient_id;
    v_cogs := v_cogs + coalesce(v_cost, 0) * r.quantity * p_qty;

    -- Trigger apply_stock_movement mengurangi stok & menolak jika stok kurang
    insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, note, created_by)
    values (r.ingredient_id, 'out', r.quantity * p_qty, 0, 'Penjualan: ' || m.name || ' x' || p_qty, auth.uid());
  end loop;

  insert into public.sale_costs (sale_id, cogs) values (v_sale, v_cogs);
  return v_sale;
end $$;

revoke execute on function public.record_sale(uuid, integer, text) from public;
grant  execute on function public.record_sale(uuid, integer, text) to authenticated;
