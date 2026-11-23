-- =====================================================================
-- Upgrade 009: Opname harian - catat SEMUA bahan yang dihitung (termasuk yang sesuai)
-- sehingga dapat diketahui bahan mana yang belum di-opname hari ini.
-- Jalankan di Supabase > SQL Editor SETELAH 008. Aman dijalankan berulang.
-- =====================================================================

-- Catatan setiap bahan yang dihitung dalam satu sesi opname
create table if not exists public.opname_checks (
  id              uuid primary key default gen_random_uuid(),
  batch_id        uuid not null,
  ingredient_id   uuid not null references public.ingredients(id) on delete cascade,
  system_stock    numeric,                       -- stok sistem saat disimpan
  physical_stock  numeric,                       -- stok fisik yang dihitung
  diff            numeric not null default 0,    -- fisik - sistem (0 = sesuai)
  note            text,
  created_by      uuid default auth.uid() references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists opname_checks_date_idx on public.opname_checks (created_at desc);
create index if not exists opname_checks_ing_idx  on public.opname_checks (ingredient_id, created_at desc);

alter table public.opname_checks enable row level security;
grant select on public.opname_checks to authenticated;
drop policy if exists "opname_checks_read" on public.opname_checks;
create policy "opname_checks_read" on public.opname_checks for select to authenticated using (public.is_member());

-- Pindahkan opname lama (yang ada selisihnya) ke tabel baru, hanya sekali
do $$
begin
  if not exists (select 1 from public.opname_checks) then
    insert into public.opname_checks (batch_id, ingredient_id, diff, note, created_by, created_at)
    select coalesce(m.batch_id, md5(coalesce(m.created_by::text, '-') || date_trunc('minute', m.created_at)::text)::uuid),
           m.ingredient_id,
           case when m.type = 'adjust_in' then m.quantity else -m.quantity end,
           m.note, m.created_by, m.created_at
      from public.stock_movements m
     where m.type in ('adjust_in', 'adjust_out');
  end if;
end $$;

-- Format angka ringkas untuk catatan (100.00 -> 100, 10.50 -> 10.5)
create or replace function public.fmt_num(n numeric)
returns text language sql immutable as $$
  select case when n is null then '0'
              else trim(trailing '.' from trim(trailing '0' from round(n, 2)::text)) end;
$$;

-- Simpan satu sesi opname: p_items = [{"ingredient_id": "...", "physical": 12.5}, ...]
-- Selisih dihitung di server terhadap stok sistem saat ini. Atomik.
create or replace function public.submit_opname(p_batch uuid, p_items jsonb, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare
  it     jsonb;
  ing    public.ingredients%rowtype;
  v_phys numeric;
  v_diff numeric;
  v_note text;
  n      integer := 0;
begin
  if not public.is_member() then
    raise exception 'Akses ditolak';
  end if;
  if p_batch is null then
    raise exception 'Penanda sesi opname kosong';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Tidak ada bahan yang dihitung';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_phys := (it->>'physical')::numeric;
    if v_phys is null or v_phys < 0 then
      raise exception 'Stok fisik tidak valid';
    end if;

    select * into ing from public.ingredients where id = (it->>'ingredient_id')::uuid for update;
    if not found then
      raise exception 'Bahan tidak ditemukan';
    end if;

    v_diff := v_phys - ing.current_stock;
    v_note := 'Opname: sistem ' || public.fmt_num(ing.current_stock) || ' → fisik ' || public.fmt_num(v_phys)
              || coalesce(' · ' || nullif(trim(p_note), ''), '');

    insert into public.opname_checks (batch_id, ingredient_id, system_stock, physical_stock, diff, note, created_by)
    values (p_batch, ing.id, ing.current_stock, v_phys, v_diff, v_note, auth.uid());

    if v_diff <> 0 then
      insert into public.stock_movements (ingredient_id, type, quantity, unit_cost, note, created_by, batch_id)
      values (ing.id, case when v_diff > 0 then 'adjust_in' else 'adjust_out' end, abs(v_diff), 0, v_note, auth.uid(), p_batch);
    end if;
    n := n + 1;
  end loop;

  return n;
end $$;

revoke execute on function public.submit_opname(uuid, jsonb, text) from public;
grant  execute on function public.submit_opname(uuid, jsonb, text) to authenticated;

-- Riwayat opname per sesi (sekarang termasuk bahan yang "sesuai")
create or replace function public.opname_history(p_limit integer default 15)
returns table (session_key text, performed_at timestamptz, user_name text, item_count integer, items jsonb)
language sql stable security definer set search_path = public as $$
  select s.batch_id::text,
         max(s.created_at),
         max(s.user_name),
         count(*)::integer,
         jsonb_agg(jsonb_build_object('name', s.name, 'unit', s.unit, 'diff', s.diff, 'note', s.note) order by s.name)
    from (
      select c.batch_id, c.created_at,
             coalesce(p.full_name, p.email, 'Tidak diketahui') as user_name,
             i.name, i.unit, c.diff, c.note
        from public.opname_checks c
        join public.ingredients i on i.id = c.ingredient_id
        left join public.profiles p on p.id = c.created_by
       where public.is_member()
    ) s
   group by s.batch_id
   order by max(s.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 15), 50));
$$;
revoke execute on function public.opname_history(integer) from public;
grant  execute on function public.opname_history(integer) to authenticated;

-- Bahan yang sudah dihitung sejak p_since (awal hari dari perangkat), terbaru per bahan
create or replace function public.opname_today(p_since timestamptz)
returns table (ingredient_id uuid, performed_at timestamptz, user_name text, physical numeric, diff numeric)
language sql stable security definer set search_path = public as $$
  select distinct on (c.ingredient_id)
         c.ingredient_id,
         c.created_at,
         coalesce(p.full_name, p.email, 'Tidak diketahui'),
         c.physical_stock,
         c.diff
    from public.opname_checks c
    left join public.profiles p on p.id = c.created_by
   where c.created_at >= p_since
     and public.is_member()
   order by c.ingredient_id, c.created_at desc;
$$;
revoke execute on function public.opname_today(timestamptz) from public;
grant  execute on function public.opname_today(timestamptz) to authenticated;
