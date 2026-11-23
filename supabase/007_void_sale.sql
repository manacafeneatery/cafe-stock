-- =====================================================================
-- Upgrade 007: Admin dapat membatalkan penjualan (stok dikembalikan)
-- Jalankan di Supabase > SQL Editor SETELAH 006. Aman dijalankan berulang.
-- =====================================================================

-- Penanda pembatalan pada penjualan
alter table public.sales add column if not exists voided_at  timestamptz;
alter table public.sales add column if not exists voided_by  uuid references auth.users(id);
alter table public.sales add column if not exists void_reason text;

-- Tautan transaksi stok -> penjualan (agar pembatalan mengembalikan jumlah yang persis sama)
alter table public.stock_movements add column if not exists sale_id uuid references public.sales(id) on delete set null;
create index if not exists stock_movements_sale_idx on public.stock_movements (sale_id);

-- Tipe transaksi baru: void_in (stok kembali karena penjualan dibatalkan)
alter table public.stock_movements drop constraint if exists stock_movements_type_check;
alter table public.stock_movements
  add constraint stock_movements_type_check check (type in ('in','out','waste','adjust_in','adjust_out','void_in'));

-- Trigger stok: void_in diperlakukan seperti penambahan stok tanpa mengubah HPP
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
  elsif new.type in ('adjust_in', 'void_in') then
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

-- record_sale: tautkan setiap pemotongan stok ke penjualannya
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

    insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, note, created_by, sale_id)
    values (r.ingredient_id, 'out', r.quantity * p_qty, 0, 'Penjualan: ' || m.name || ' x' || p_qty, auth.uid(), v_sale);
  end loop;

  insert into public.sale_costs (sale_id, cogs) values (v_sale, v_cogs);
  return v_sale;
end $$;

revoke execute on function public.record_sale(uuid, integer, text) from public;
grant  execute on function public.record_sale(uuid, integer, text) to authenticated;

-- void_sale: khusus Admin. Mengembalikan stok sesuai yang dulu terpotong.
create or replace function public.void_sale(p_sale uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.sales%rowtype;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Hanya Admin yang boleh membatalkan penjualan';
  end if;

  select * into s from public.sales where id = p_sale for update;
  if not found then
    raise exception 'Penjualan tidak ditemukan';
  end if;
  if s.voided_at is not null then
    raise exception 'Penjualan ini sudah dibatalkan';
  end if;

  if exists (select 1 from public.stock_movements where sale_id = s.id and type = 'out') then
    -- Penjualan baru: kembalikan jumlah yang persis terpotong
    for r in select ingredient_id, sum(quantity) as qty
               from public.stock_movements where sale_id = s.id and type = 'out'
              group by ingredient_id loop
      insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, note, created_by, sale_id)
      values (r.ingredient_id, 'void_in', r.qty, 0, 'Pembatalan penjualan: ' || s.menu_name || ' x' || s.quantity, auth.uid(), s.id);
    end loop;
  elsif s.menu_id is not null then
    -- Penjualan lama (sebelum ada tautan): pakai resep saat ini sebagai perkiraan
    for r in select ingredient_id, quantity from public.recipe_items where menu_id = s.menu_id loop
      insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, note, created_by, sale_id)
      values (r.ingredient_id, 'void_in', r.quantity * s.quantity, 0, 'Pembatalan penjualan: ' || s.menu_name || ' x' || s.quantity, auth.uid(), s.id);
    end loop;
  end if;

  update public.sales
     set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(trim(p_reason), '')
   where id = s.id;
end $$;

revoke execute on function public.void_sale(uuid, text) from public;
grant  execute on function public.void_sale(uuid, text) to authenticated;
