-- =====================================================================
-- Upgrade 011: Admin dapat menggabungkan bahan dobel
-- Stok, riwayat, resep, dan harga bahan sumber dipindah ke bahan tujuan,
-- lalu bahan sumber dihapus. Satu transaksi: gagal = tidak ada yang berubah.
-- Jalankan di Supabase > SQL Editor SETELAH 010. Aman dijalankan berulang.
-- =====================================================================

create or replace function public.merge_ingredients(p_source uuid, p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  src    public.ingredients%rowtype;
  tgt    public.ingredients%rowtype;
  cs     public.ingredient_costs%rowtype;
  ct     public.ingredient_costs%rowtype;
  v_avg  numeric;
  v_last numeric;
begin
  if not public.is_admin() then
    raise exception 'Hanya Admin yang boleh menggabungkan bahan';
  end if;
  if p_source = p_target then
    raise exception 'Pilih dua bahan yang berbeda';
  end if;

  -- Kunci kedua baris dengan urutan tetap agar tidak saling menunggu
  perform 1 from public.ingredients where id in (p_source, p_target) order by id for update;
  select * into src from public.ingredients where id = p_source;
  if not found then
    raise exception 'Bahan yang digabungkan tidak ditemukan';
  end if;
  select * into tgt from public.ingredients where id = p_target;
  if not found then
    raise exception 'Bahan tujuan tidak ditemukan';
  end if;
  if lower(trim(src.unit)) <> lower(trim(tgt.unit)) then
    raise exception 'Satuan berbeda (% dan %), tidak bisa digabungkan', src.unit, tgt.unit;
  end if;

  insert into public.ingredient_costs (ingredient_id) values (p_source), (p_target) on conflict do nothing;
  select * into cs from public.ingredient_costs where ingredient_id = p_source for update;
  select * into ct from public.ingredient_costs where ingredient_id = p_target for update;

  -- HPP: rata-rata tertimbang menurut stok. Harga 0 dianggap belum diisi.
  v_avg := case
    when ct.avg_cost = 0 then cs.avg_cost
    when cs.avg_cost = 0 then ct.avg_cost
    when src.current_stock + tgt.current_stock > 0
      then (src.current_stock * cs.avg_cost + tgt.current_stock * ct.avg_cost)
           / (src.current_stock + tgt.current_stock)
    else ct.avg_cost
  end;
  v_last := case when ct.last_cost > 0 then ct.last_cost else cs.last_cost end;

  -- Resep: bila satu menu memakai keduanya, jumlahnya dijumlahkan
  update public.recipe_items t
     set quantity = t.quantity + s.quantity
    from public.recipe_items s
   where t.ingredient_id = p_target and s.ingredient_id = p_source and s.menu_id = t.menu_id;
  delete from public.recipe_items s
   where s.ingredient_id = p_source
     and exists (select 1 from public.recipe_items t where t.menu_id = s.menu_id and t.ingredient_id = p_target);
  update public.recipe_items set ingredient_id = p_target where ingredient_id = p_source;

  -- Riwayat dipindah (trigger stok hanya berjalan saat insert, jadi stok tidak terhitung dua kali)
  update public.stock_movements  set ingredient_id = p_target where ingredient_id = p_source;
  update public.opname_checks    set ingredient_id = p_target where ingredient_id = p_source;
  update public.cost_adjustments set ingredient_id = p_target where ingredient_id = p_source;

  -- Jejak penggabungan di riwayat penyesuaian harga
  insert into public.cost_adjustments (ingredient_id, old_avg, new_avg, old_last, new_last, note)
  values (p_target, ct.avg_cost, v_avg, ct.last_cost, v_last, 'Gabungan dari bahan "' || src.name || '"');

  update public.ingredient_costs set avg_cost = v_avg, last_cost = v_last where ingredient_id = p_target;
  update public.ingredients
     set current_stock = tgt.current_stock + src.current_stock,
         min_stock     = greatest(tgt.min_stock, src.min_stock),
         category_id   = coalesce(tgt.category_id, src.category_id),
         is_active     = tgt.is_active or src.is_active
   where id = p_target;

  delete from public.ingredients where id = p_source;
end $$;

revoke execute on function public.merge_ingredients(uuid, uuid) from public;
grant  execute on function public.merge_ingredients(uuid, uuid) to authenticated;
