# Kasir Kafe — Aplikasi POS

Aplikasi kasir untuk kafe: menu, meja, transaksi, dan laporan penjualan.
Dilindungi login (email + kata sandi). Semua perangkat yang membuka website ini
akan melihat data yang sama secara real-time (lewat database Supabase).

Total waktu setup: kira-kira 25-35 menit, semua gratis.

---

## Gambaran Besar

```
Kode (GitHub) → Database (Supabase) → Hosting (Vercel) → Link untuk kasir
```

Kamu akan butuh 3 akun gratis: **GitHub**, **Supabase**, **Vercel**.

---

## LANGKAH 1 — Setup Database di Supabase

1. Buka **supabase.com** → klik **Start your project** → daftar/login (bisa pakai akun Google).
2. Klik **New project**.
   - Name: `kasir-kafe` (atau nama apa saja)
   - Database Password: buat password, **simpan baik-baik** (akan dipakai lagi)
   - Region: pilih yang paling dekat (misal Singapore)
   - Klik **Create new project** dan tunggu ± 1-2 menit sampai siap.
3. Setelah project siap, di sidebar kiri klik ikon **SQL Editor**.
4. Klik **New query**.
5. Buka file `supabase_setup.sql` yang sudah disediakan, **copy semua isinya**, paste ke editor tadi.
6. Klik **Run** (atau tombol ▶). Harus muncul "Success. No rows returned".
7. Sekarang ambil kunci API: di sidebar kiri klik ikon gear **Project Settings** → **API**.
   - Catat **Project URL** (contoh: `https://abcdefgh.supabase.co`)
   - Catat **anon public** key (deretan huruf panjang di bagian "Project API keys")

Simpan kedua nilai ini, akan dipakai di Langkah 3.

---

## LANGKAH 1B — Buat Akun Login untuk Kasir

Aplikasi ini mengharuskan login, jadi setiap kasir butuh akun (email + kata sandi).
Akun **tidak bisa didaftar sendiri** lewat halaman login — hanya admin (kamu) yang
bisa membuatkannya, lewat dashboard Supabase:

1. Di sidebar kiri Supabase, klik ikon **Authentication**.
2. Klik tab **Users** → klik **Add user** → **Create new user**.
3. Isi:
   - Email: misal `kasir1@kedaikamu.com` (boleh email asli atau buatan, asal valid formatnya)
   - Password: buat kata sandi awal untuk kasir tersebut
   - Centang **Auto Confirm User** (supaya tidak perlu konfirmasi email dulu)
4. Klik **Create user**.
5. Ulangi untuk setiap kasir yang butuh akun (misal `kasir2@kedaikamu.com`, dst).

Bagikan email + password awal ini ke masing-masing kasir. Mereka bisa memakai
tombol **Lupa kata sandi?** di halaman login untuk mengganti password sendiri
nanti (akan dikirim tautan reset ke email tersebut).

> **Catatan:** secara default, Supabase mengirim email reset password lewat
> server bawaan mereka yang ada batas kuotanya (cukup untuk testing/kafe kecil).
> Kalau perlu volume lebih besar, bisa dikonfigurasi SMTP sendiri nanti di
> **Authentication → Settings**.

---

## LANGKAH 2 — Upload Kode ke GitHub

1. Buka **github.com** → daftar/login.
2. Klik tombol **+** di kanan atas → **New repository**.
   - Repository name: `kasir-kafe`
   - Pilih **Private** (supaya kode tidak terlihat publik)
   - Klik **Create repository**
3. Di komputer kamu, download/extract folder project ini, lalu buka Terminal (Mac) atau Command Prompt/Git Bash (Windows) di dalam folder tersebut, jalankan:

```bash
git init
git add .
git commit -m "Setup awal kasir kafe"
git branch -M main
git remote add origin https://github.com/USERNAME-KAMU/kasir-kafe.git
git push -u origin main
```

   Ganti `USERNAME-KAMU` dengan username GitHub kamu. Saat diminta login, ikuti instruksi di layar (biasanya buka browser untuk konfirmasi).

> **Tidak punya Git terinstall?** Cara lebih mudah: di halaman repository GitHub yang baru dibuat, klik **uploading an existing file**, lalu drag semua file project (kecuali folder `node_modules` jika ada) ke sana, lalu klik **Commit changes**.

---

## LANGKAH 3 — Deploy ke Vercel

1. Buka **vercel.com** → daftar/login — **pilih "Continue with GitHub"** supaya otomatis terhubung.
2. Setelah masuk dashboard, klik **Add New...** → **Project**.
3. Cari repository `kasir-kafe` yang baru kamu push, klik **Import**.
4. Di halaman konfigurasi:
   - Framework Preset: otomatis terdeteksi sebagai **Vite** (kalau tidak, pilih manual)
   - Buka bagian **Environment Variables**, tambahkan dua baris:
     | Name | Value |
     |---|---|
     | `VITE_SUPABASE_URL` | (paste Project URL dari Langkah 1) |
     | `VITE_SUPABASE_ANON_KEY` | (paste anon public key dari Langkah 1) |
5. Klik **Deploy**. Tunggu ± 1-2 menit.
6. Setelah selesai, Vercel akan kasih link seperti `kasir-kafe-xxxx.vercel.app` — **ini link yang dibuka kasir** dari laptop/tablet/HP manapun.

---

## Setelah Deploy

- Buka link Vercel itu dari semua perangkat kasir (laptop, tablet, HP) — bisa juga di-bookmark atau dipasang sebagai shortcut di homescreen tablet.
- Setiap perangkat akan diminta **login** (email + kata sandi) — pakai akun yang dibuat di Langkah 1B.
- Setelah login, semua perangkat otomatis sinkron: transaksi, status meja, dan menu yang diubah di satu perangkat langsung muncul di perangkat lain (lewat Supabase Realtime).
- Tidak perlu instalasi apapun di tablet/HP — cukup browser (Chrome/Safari).
- Sesi login akan tetap tersimpan di browser tersebut sampai kasir menekan tombol **Keluar**.

### Update aplikasi di kemudian hari
Kalau nanti minta saya menambah/ubah fitur lagi, saya akan update file `src/App.jsx`. Supaya perubahan itu sampai ke kasir:
```bash
git add .
git commit -m "Update fitur"
git push
```
Vercel akan otomatis re-deploy beberapa detik setelah kamu push.

### Menambah atau menghapus akun kasir
Buka **Authentication → Users** di dashboard Supabase kapan saja untuk menambah
akun kasir baru, menghapus akun yang sudah tidak dipakai, atau mereset password
seseorang secara manual.

### Setup Printer Struk (Thermal 58mm/80mm)

Aplikasi ini otomatis mencetak struk setelah pembayaran berhasil (lewat dialog
print bawaan browser), dan ada tombol cetak ulang di tab **Laporan** untuk
setiap transaksi. Supaya hasilnya rapi di printer thermal:

1. Pasang & install driver printer thermal kamu seperti biasa di komputer kasir
   (ikuti petunjuk dari penjual/merk printer).
2. Saat aplikasi pertama kali mencoba print, browser akan menampilkan dialog
   print. Di dialog itu:
   - **Destination/Printer**: pilih nama printer thermal kamu
   - **Paper size**: pilih ukuran custom 80mm (lebar) jika tersedia, atau
     pilih opsi paper size yang sesuai dengan kertas struk kamu (58mm/80mm)
   - **Margins**: pilih **None** atau **Minimum**
   - Klik **Print**
3. Browser modern (Chrome, Edge) akan **mengingat pilihan ini** untuk
   percetakan selanjutnya, jadi setelah di-setting sekali, struk berikutnya
   akan otomatis terkirim ke printer yang sama tanpa perlu atur ulang.
4. Kalau struk yang keluar terpotong atau terlalu kecil/besar, sesuaikan lagi
   ukuran paper size di dialog print sampai pas dengan kertas struk kamu.

> **Catatan:** kalau komputer kasir belum punya printer thermal terpasang,
> dialog print akan tetap muncul dengan opsi **"Save as PDF"** — bisa dipakai
> untuk sementara cek tampilan struknya sebelum printer fisik terpasang.

---

## Soal Keamanan

Aplikasi ini sekarang **mewajibkan login** lewat Supabase Auth:
- Hanya akun yang sudah dibuatkan admin (kamu) di dashboard Supabase yang bisa masuk — tidak ada pendaftaran bebas.
- Data di database (`pos_data`) dilindungi Row Level Security: hanya user yang sudah login (`authenticated`) yang bisa membaca atau menulis. Pengunjung yang belum login tidak bisa mengakses data apa pun, bahkan lewat API langsung.
- Kata sandi disimpan dan di-hash oleh Supabase, kode aplikasi ini tidak pernah menyimpan kata sandi secara mentah.
- Kasir bisa mereset kata sandinya sendiri lewat tombol **Lupa kata sandi?**.

Satu hal yang tetap perlu kamu jaga: jangan bagikan kredensial **Database Password**
atau **service_role key** (bukan yang `anon public`) ke siapa pun — itu kunci admin
penuh ke database, beda dengan anon key yang memang aman untuk dipakai di browser.

---

## Biaya

Semua gratis untuk skala 1 kafe:
- **Vercel Free** — cukup untuk traffic kafe kecil-menengah
- **Supabase Free** — cukup untuk ribuan transaksi/bulan
- Kalau nanti kafe berkembang jadi multi-cabang dengan traffic besar, baru perlu upgrade paket berbayar (masih jauh dari kebutuhan 1 kafe).
