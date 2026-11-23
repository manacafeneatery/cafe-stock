# Cafe Stock — aplikasi Android (React Native / Expo)

Versi 2: seluruh layar ditulis ulang dengan komponen native (Expo Router + React Native).
Memakai database Supabase yang sama dengan versi web, jadi data dan akun tetap sama.

## Fitur
Login Admin/Karyawan · Ringkasan stok (akan habis, fast moving, jarang keluar) · Penjualan (stok terpotong sesuai resep, batalkan)
· Entry stok · Opname + riwayat · Menu & Resep (HPP per porsi) · Bahan & HPP (kategori, stok minimum, atur harga)
· Karyawan (persetujuan akun) · Lonceng stok menipis.

## Menjalankan
1. `cd mobile` lalu `npm install --legacy-peer-deps`
2. Salin `.env.example` menjadi `.env`, isi `EXPO_PUBLIC_SUPABASE_URL` dan `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (anon/publishable key saja, jangan service_role).
3. `npx expo start`, pindai QR dengan **Expo Go** (HP dan komputer satu Wi-Fi).

## Membuat APK (EAS)
Variabel Supabase harus tersedia di server EAS (file `.env` tidak ikut diunggah):
```
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value <URL> --environment preview --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <KEY> --environment preview --visibility plaintext
npx eas-cli@latest build -p android --profile preview
```
Hasilnya tautan unduhan `.apk`. APK baru menimpa versi lama (package dan keystore sama).

## Catatan
- Database dan aturan akses (RLS) ada di folder `../supabase` (jalankan 002 sampai 008 di Supabase SQL Editor).
- Notifikasi push saat aplikasi tertutup belum ada; lonceng di header menampilkan stok menipis saat aplikasi dibuka.
