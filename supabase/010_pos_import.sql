-- =====================================================================
-- Upgrade 010: Impor laporan penjualan kasir (Ideku "Analitik Item")
-- Stok terpotong sesuai resep memakai fungsi record_sale yang sudah ada.
-- Jalankan di Supabase > SQL Editor SETELAH 009. Aman dijalankan berulang.
-- =====================================================================

-- Pemetaan item kasir -> menu di aplikasi (dikelola Admin)
create table if not exists public.pos_item_map (
  pos_key     text primary key,                 -- Kode Item kasir, atau "name:<nama>" bila tidak ada kode
  pos_name    text not null,
  menu_id     uuid references public.menus(id) on delete cascade,
  ignored     boolean not null default false,   -- true = item bukan menu / tidak mengurangi stok
  created_at  timestamptz not null default now(),
  check (ignored or menu_id is not null)
);

-- Catatan jumlah yang sudah diimpor per hari & item (untuk mencegah pemotongan ganda)
create table if not exists public.pos_imports (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null,
  pos_key       text not null,
  pos_name      text,
  qty_total     numeric not null default 0,     -- total kumulatif yang sudah diimpor untuk hari itu
  imported_by   uuid default auth.uid() references auth.users(id),
  updated_at    timestamptz not null default now(),
  unique (business_date, pos_key)
);

alter table public.pos_item_map enable row level security;
alter table public.pos_imports  enable row level security;
grant select, insert, update, delete on public.pos_item_map to authenticated;
grant select on public.pos_imports to authenticated;

drop policy if exists "pos_map_read"   on public.pos_item_map;
drop policy if exists "pos_map_admin"  on public.pos_item_map;
drop policy if exists "pos_imports_read" on public.pos_imports;
create policy "pos_map_read"     on public.pos_item_map for select to authenticated using (public.is_member());
create policy "pos_map_admin"    on public.pos_item_map for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "pos_imports_read" on public.pos_imports  for select to authenticated using (public.is_member());

-- Impor satu hari penjualan. p_items = [{"key": "A19", "name": "AYAM GEPREK LARGE", "qty": 9}, ...]
-- Memotong stok hanya sebesar SELISIH dari yang sudah diimpor hari itu, sehingga laporan
-- yang sama tidak memotong dua kali dan impor beberapa kali sehari tetap benar.
-- Hasil per item: imported | unchanged | lower | unmapped | ignored | error
create or replace function public.import_pos_sales(p_date date, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it       jsonb;
  m        public.pos_item_map%rowtype;
  lg       public.pos_imports%rowtype;
  v_key    text;
  v_name   text;
  v_qty    numeric;
  v_delta  numeric;
  v_left   integer;
  v_chunk  integer;
  v_status text;
  v_msg    text;
  v_done   numeric;
  res      jsonb := '[]'::jsonb;
begin
  if not public.is_member() then
    raise exception 'Akses ditolak';
  end if;
  if p_date is null or p_date > current_date + 1 then
    raise exception 'Tanggal laporan tidak valid';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Data laporan kosong';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_key    := it->>'key';
    v_name   := coalesce(it->>'name', v_key);
    v_qty    := coalesce((it->>'qty')::numeric, 0);
    v_status := null; v_msg := null; v_done := 0;

    select * into m from public.pos_item_map where pos_key = v_key;

    if not found then
      v_status := 'unmapped';
    elsif m.ignored then
      v_status := 'ignored';
    elsif v_qty < 0 or v_qty <> trunc(v_qty) then
      v_status := 'error'; v_msg := 'Jumlah tidak valid';
    else
      select * into lg from public.pos_imports where business_date = p_date and pos_key = v_key;
      v_delta := v_qty - coalesce(lg.qty_total, 0);

      if v_delta = 0 then
        v_status := 'unchanged';
      elsif v_delta < 0 then
        v_status := 'lower';
        v_msg := 'Jumlah di laporan (' || v_qty || ') lebih kecil dari yang sudah diimpor (' || lg.qty_total || '). Stok tidak diubah.';
      else
        begin
          v_left := v_delta::integer;
          while v_left > 0 loop
            v_chunk := least(v_left, 1000);
            perform public.record_sale(m.menu_id, v_chunk, 'Impor kasir ' || to_char(p_date, 'DD/MM/YY') || ' · ' || v_name);
            v_left := v_left - v_chunk;
          end loop;

          insert into public.pos_imports (business_date, pos_key, pos_name, qty_total)
          values (p_date, v_key, v_name, v_qty)
          on conflict (business_date, pos_key)
          do update set qty_total = excluded.qty_total, pos_name = excluded.pos_name,
                        updated_at = now(), imported_by = auth.uid();

          v_status := 'imported'; v_done := v_delta;
        exception when others then
          -- seluruh pemotongan item ini dibatalkan; item lain tetap diproses
          v_status := 'error'; v_msg := sqlerrm;
        end;
      end if;
    end if;

    res := res || jsonb_build_object('key', v_key, 'name', v_name, 'status', v_status, 'qty', v_done, 'message', v_msg);
  end loop;

  return res;
end $$;

revoke execute on function public.import_pos_sales(date, jsonb) from public;
grant  execute on function public.import_pos_sales(date, jsonb) to authenticated;
