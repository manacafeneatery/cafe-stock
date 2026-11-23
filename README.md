# ☕ Cafe Stock

Aplikasi monitoring stok bahan kafe harian (React + Vite + TypeScript + Supabase). Tampilan responsif: sidebar di desktop, bottom-nav di HP.

## Fitur
- **Login Admin & Karyawan** (Supabase Auth). Akun pertama yang mendaftar otomatis menjadi Admin.
- **Entry stok**: bahan masuk (dengan harga beli), terpakai, rusak/waste. Stok & HPP terupdate otomatis via trigger database.
- **Ketersediaan bahan** (30 hari terakhir): *Akan habis*, *Fast moving*, *Jarang keluar*. Aturan di `src/lib/analytics.ts`.
- **HPP per bahan**: rata-rata tertimbang (weighted average) dari setiap pembelian. Halaman Bahan & HPP hanya untuk Admin.

## Setup
1. Supabase → **SQL Editor** → jalankan isi `supabase/schema.sql`.
2. Supabase → Authentication → Providers → Email: matikan *Confirm email* agar pendaftaran langsung bisa dipakai (opsional).
3. Salin `.env.example` ke `.env`, isi URL & anon key (Project Settings → API).
4. `npm install` lalu `npm run dev`.
5. Daftar akun pertama (otomatis Admin), lalu karyawan lain mendaftar dari halaman login.

## Aturan klasifikasi
| Kategori | Kondisi |
|---|---|
| Akan habis | stok ≤ stok minimum, atau sisa ≤ 3 hari pemakaian |
| Fast moving | ≥ 60% dari (stok + pemakaian) terpakai dalam 30 hari |
| Jarang keluar | tidak ada pemakaian, atau ≤ 15% terpakai |

> Catatan keamanan: hanya anon key yang dipakai di frontend; akses dilindungi Row Level Security. Jangan pernah memasukkan `service_role` key ke aplikasi ini.
