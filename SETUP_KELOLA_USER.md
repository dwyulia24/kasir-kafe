# Panduan Setup — Fitur Kelola User (Role & Akses Tab)

Fitur ini menambahkan menu **Kelola User** (khusus admin) untuk membuat akun
kasir baru langsung dari aplikasi, mengatur role (Admin/User), dan akses tab
mana saja yang boleh dibuka tiap user.

Karena membuat/menghapus akun login butuh kunci rahasia Supabase yang **tidak
boleh** ada di kode browser, fitur ini memakai **Supabase Edge Function** —
mini-server yang jalan aman di sisi Supabase. Setup ini perlu dilakukan
**sekali saja**, lewat Terminal.

---

## Langkah 1 — Jalankan SQL tabel user_access

1. Buka **SQL Editor** di dashboard Supabase
2. Copy seluruh isi file `supabase_user_access.sql`
3. **PENTING**: sebelum klik Run, cari baris paling bawah yang bertuliskan
   `where email = 'EMAIL_ADMIN_KAMU'` — ganti `EMAIL_ADMIN_KAMU` dengan email
   akun yang **sudah ada** dan kamu pakai untuk login sekarang (ini akan
   jadi admin pertama)
4. Klik **Run**

Tanpa langkah ini, tidak ada admin sama sekali dan menu Kelola User tidak
akan terlihat oleh siapa pun.

---

## Langkah 2 — Install Supabase CLI (sekali saja di komputer kamu)

Di Terminal:
```bash
npm install -g supabase
```

Kalau muncul error permission, coba:
```bash
sudo npm install -g supabase
```

Cek berhasil:
```bash
supabase --version
```

---

## Langkah 3 — Login Supabase CLI & hubungkan ke project

```bash
supabase login
```
Ini akan membuka browser untuk konfirmasi login — ikuti instruksinya.

Lalu, dari folder project (`kasir-kafe-yulia`):
```bash
cd ~/Downloads/kasir-kafe-yulia
supabase link --project-ref XXXXXXXXXXXX
```

Ganti `XXXXXXXXXXXX` dengan **Project Reference ID** kamu — cara lihat:
buka dashboard Supabase → **Project Settings** → **General** → cari
"Reference ID" (deretan huruf-angka pendek, beda dari Project URL).

---

## Langkah 4 — Deploy kedua Edge Function

```bash
supabase functions deploy create-user
supabase functions deploy delete-user
```

Tunggu sampai masing-masing selesai (biasanya beberapa puluh detik).

---

## Langkah 5 — Cek hasil deploy

Buka dashboard Supabase → sidebar kiri → **Edge Functions**. Harus terlihat
dua function: `create-user` dan `delete-user`, statusnya aktif.

---

## Langkah 6 — Push kode aplikasi seperti biasa

```bash
git add .
git commit -m "Tambah fitur kelola user dengan role dan akses tab"
git push
```

Tunggu Vercel re-deploy, lalu hard refresh browser. Login dengan akun yang
sudah kamu daftarkan sebagai admin di Langkah 1 — menu **Kelola User** baru
akan muncul di sidebar.

---

## Cara Pakai Setelah Setup

- **Tambah User**: klik tombol "Tambah User" di menu Kelola User → isi email,
  password awal, pilih role. Kalau role **User**, centang tab mana saja yang
  boleh diakses. Kalau role **Admin**, otomatis akses semua tab.
- **Edit Akses**: klik ikon perisai di baris user manapun untuk ubah role
  atau akses tabnya kapan saja.
- **Hapus User**: klik ikon tempat sampah (tidak bisa menghapus akun sendiri).

## Catatan Keamanan

- Hanya akun dengan role **admin** di tabel `user_access` yang bisa memanggil
  function `create-user` dan `delete-user` — dicek otomatis di sisi server,
  bukan cuma disembunyikan di tampilan.
- Akun yang login tapi **belum terdaftar** di `user_access` sama sekali
  (misal akun lama dari sebelum fitur ini ada) untuk sementara diberi akses
  ke **semua tab**, supaya tidak ada yang ter-lockout tiba-tiba. Admin bisa
  langsung menyesuaikan aksesnya lewat menu Kelola User begitu sempat.
