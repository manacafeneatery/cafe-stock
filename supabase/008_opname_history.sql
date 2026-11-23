-- =====================================================================
-- Upgrade 008: Riwayat opname per sesi + nama pelaksana
-- Jalankan di Supabase > SQL Editor SETELAH 007. Aman dijalankan berulang.
-- =====================================================================

-- Penanda satu sesi opname (semua baris yang disimpan bersamaan)
alter table public.stock_movements add column if not exists batch_id uuid;

-- Riwayat opname terkelompok per sesi. Bisa dibaca semua anggota (admin/karyawan).
-- Memakai fungsi agar nama pelaksana dapat tampil tanpa membuka tabel profil.
create or replace function public.opname_history(p_limit integer default 15)
returns table (session_key text, performed_at timestamptz, user_name text, item_count integer, items jsonb)
language sql stable security definer set search_path = public as $$
  select s.key,
         max(s.created_at),
         max(s.user_name),
         count(*)::integer,
         jsonb_agg(jsonb_build_object('name', s.name, 'unit', s.unit, 'diff', s.diff, 'note', s.note) order by s.name)
    from (
      select coalesce(m.batch_id::text,
                      coalesce(m.created_by::text, '-') || '-' || to_char(date_trunc('minute', m.created_at), 'YYYYMMDDHH24MI')) as key,
             m.created_at,
             coalesce(p.full_name, p.email, 'Tidak diketahui') as user_name,
             i.name, i.unit,
             case when m.type = 'adjust_in' then m.quantity else -m.quantity end as diff,
             m.note
        from public.stock_movements m
        join public.ingredients i on i.id = m.ingredient_id
        left join public.profiles p on p.id = m.created_by
       where m.type in ('adjust_in', 'adjust_out')
         and public.is_member()
    ) s
   group by s.key
   order by max(s.created_at) desc
   limit greatest(1, least(coalesce(p_limit, 15), 50));
$$;

revoke execute on function public.opname_history(integer) from public;
grant  execute on function public.opname_history(integer) to authenticated;
