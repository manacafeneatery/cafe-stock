-- =====================================================================
-- Upgrade 005: Admin dapat mengatur HPP / harga beli secara manual (tercatat)
-- Jalankan di Supabase > SQL Editor SETELAH 004. Aman dijalankan berulang.
-- =====================================================================

create table if not exists public.cost_adjustments (
  id             uuid primary key default gen_random_uuid(),
  ingredient_id  uuid not null references public.ingredients(id) on delete cascade,
  old_avg        numeric not null,
  new_avg        numeric not null,
  old_last       numeric not null,
  new_last       numeric not null,
  note           text,
  created_by     uuid default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now()
);

alter table public.cost_adjustments enable row level security;
grant select on public.cost_adjustments to authenticated;
drop policy if exists "cost_adj_admin_read" on public.cost_adjustments;
create policy "cost_adj_admin_read" on public.cost_adjustments for select to authenticated using (public.is_admin());

-- Satu-satunya jalan mengubah biaya secara manual: fungsi ini (hanya Admin, selalu dicatat)
create or replace function public.set_ingredient_cost(
  p_ingredient uuid, p_avg_cost numeric, p_last_cost numeric, p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  cst public.ingredient_costs%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Hanya Admin yang boleh mengatur harga';
  end if;
  if p_avg_cost is null or p_last_cost is null or p_avg_cost < 0 or p_last_cost < 0 then
    raise exception 'Harga tidak valid';
  end if;
  if not exists (select 1 from public.ingredients where id = p_ingredient) then
    raise exception 'Bahan tidak ditemukan';
  end if;

  insert into public.ingredient_costs (ingredient_id) values (p_ingredient) on conflict do nothing;
  select * into cst from public.ingredient_costs where ingredient_id = p_ingredient for update;

  insert into public.cost_adjustments (ingredient_id, old_avg, new_avg, old_last, new_last, note)
  values (p_ingredient, cst.avg_cost, p_avg_cost, cst.last_cost, p_last_cost, nullif(trim(p_note), ''));

  update public.ingredient_costs
     set avg_cost = p_avg_cost, last_cost = p_last_cost
   where ingredient_id = p_ingredient;
end $$;

revoke execute on function public.set_ingredient_cost(uuid, numeric, numeric, text) from public;
grant  execute on function public.set_ingredient_cost(uuid, numeric, numeric, text) to authenticated;
