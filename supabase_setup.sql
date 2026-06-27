-- ============================================================
-- SETUP DATABASE KASIR KAFE — jalankan di Supabase SQL Editor
-- ============================================================
-- Cara pakai: buka project Supabase kamu > menu "SQL Editor" > New query
-- > copy-paste seluruh isi file ini > klik "Run".
--
-- Versi ini mewajibkan LOGIN: hanya user yang sudah login (lewat
-- Supabase Auth) yang bisa membaca/menulis data. Pengunjung yang
-- belum login (anon) tidak bisa akses apa pun.

-- 1. Buat tabel penyimpanan data POS (menu, meja, transaksi)
create table if not exists pos_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- 2. Aktifkan Row Level Security
alter table pos_data enable row level security;

-- 3. Hapus policy lama jika sebelumnya pernah menjalankan versi tanpa login
drop policy if exists "Izinkan baca untuk semua" on pos_data;
drop policy if exists "Izinkan tulis untuk semua" on pos_data;
drop policy if exists "Izinkan update untuk semua" on pos_data;

-- 4. Izinkan akses HANYA untuk user yang sudah login (authenticated)
create policy "Hanya user login: baca"
  on pos_data for select
  to authenticated
  using (true);

create policy "Hanya user login: tulis"
  on pos_data for insert
  to authenticated
  with check (true);

create policy "Hanya user login: update"
  on pos_data for update
  to authenticated
  using (true);

-- 5. Aktifkan Realtime untuk tabel ini (supaya semua perangkat auto-sync)
alter publication supabase_realtime add table pos_data;
