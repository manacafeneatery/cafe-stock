-- =====================================================================
-- Upgrade 002: Kategori bahan (tabel tersendiri)
-- Jalankan di Supabase > SQL Editor. Aman dijalankan berulang kali.
-- =====================================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.ingredients
  add column if not exists category_id uuid references public.categories(id) on delete set null;

-- Pindahkan kategori teks lama ke tabel baru
insert into public.categories (name)
select distinct trim(category) from public.ingredients
where category is not null and trim(category) <> ''
on conflict (name) do nothing;

update public.ingredients i
   set category_id = c.id
  from public.categories c
 where i.category_id is null and lower(c.name) = lower(trim(i.category));

-- Izin & RLS
grant select, insert, update, delete on public.categories to authenticated;
alter table public.categories enable row level security;

drop policy if exists "categories_read"  on public.categories;
drop policy if exists "categories_admin" on public.categories;
create policy "categories_read"  on public.categories for select to authenticated using (true);
create policy "categories_admin" on public.categories for all    to authenticated
  using (public.is_admin()) with check (public.is_admin());
