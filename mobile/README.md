# Cafe Stock — aplikasi Android (Expo)

Versi 1: aplikasi Expo yang membungkus situs Cafe Stock (WebView) sehingga tampil layar penuh
seperti aplikasi, lengkap dengan ikon, splash screen, dan tombol Kembali Android.
Alamat situs diatur di `App.tsx` (`APP_URL`).

## Coba cepat di HP (tanpa APK)
1. Pasang **Expo Go** dari Play Store.
2. `cd mobile` lalu `npm install` (sekali saja).
3. `npx expo start`, pindai QR dengan Expo Go. HP dan komputer harus satu Wi-Fi.

## Membuat APK
Perlu akun Expo gratis di https://expo.dev/signup.

```
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build -p android --profile preview
```
Setelah build selesai (sekitar 10–20 menit), EAS memberi tautan untuk mengunduh `.apk`.
Buka tautan itu di HP, unduh, lalu pasang (izinkan "Install dari sumber tidak dikenal" bila diminta).

## Catatan
- Aplikasi memerlukan internet; saat offline tampil layar "Tidak ada koneksi" dengan tombol Coba lagi.
- Perubahan pada situs (git push) otomatis tampil di aplikasi tanpa membuat APK baru.
- Notifikasi browser (lonceng) belum berfungsi di dalam WebView; daftar stok menipis tetap tampil di aplikasi.
