-- ============================================================
-- SETUP TABEL USER ACCESS — jalankan di Supabase SQL Editor
-- ============================================================
-- File ini TERPISAH dari supabase_setup.sql, jalankan SETELAH
-- supabase_setup.sql. Cara pakai sama: SQL Editor > New query >
-- copy-paste seluruh isi file ini > Run.
--
-- Tabel ini menyimpan ROLE (admin/user) dan AKSES TAB tiap user,
-- terpisah dari tabel pos_data supaya lebih jelas & mudah di-manage.

-- 1. Buat tabel user_access
create table if not exists user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  akses_tab text[] not null default '{}', -- contoh: {'kasir','dapur','meja'}
  dibuat_pada timestamptz default now(),
  diupdate_pada timestamptz default now()
);

-- 2. Aktifkan Row Level Security
alter table user_access enable row level security;

-- 3. Hapus policy lama jika ada (untuk re-run yang aman)
drop policy if exists "User login bisa baca semua akses" on user_access;
drop policy if exists "Hanya admin bisa insert" on user_access;
drop policy if exists "Hanya admin bisa update" on user_access;
drop policy if exists "Hanya admin bisa delete" on user_access;

-- 4. Semua user yang sudah login boleh BACA tabel ini (perlu untuk cek
--    role & akses tab miliknya sendiri saat login)
create policy "User login bisa baca semua akses"
  on user_access for select
  to authenticated
  using (true);

-- 5. Hanya admin yang boleh tambah/ubah/hapus baris user_access
create policy "Hanya admin bisa insert"
  on user_access for insert
  to authenticated
  with check (
    exists (
      select 1 from user_access ua
      where ua.user_id = auth.uid() and ua.role = 'admin'
    )
  );

create policy "Hanya admin bisa update"
  on user_access for update
  to authenticated
  using (
    exists (
      select 1 from user_access ua
      where ua.user_id = auth.uid() and ua.role = 'admin'
    )
  );

create policy "Hanya admin bisa delete"
  on user_access for delete
  to authenticated
  using (
    exists (
      select 1 from user_access ua
      where ua.user_id = auth.uid() and ua.role = 'admin'
    )
  );

-- 6. Aktifkan Realtime supaya perubahan akses langsung kerasa tanpa refresh
alter publication supabase_realtime add table user_access;

-- 7. PENTING — Daftarkan akun ADMIN PERTAMA secara manual.
--    Ganti EMAIL_ADMIN_KAMU di bawah dengan email akun yang SUDAH ADA
--    di Authentication > Users (akun yang kamu pakai login sekarang).
--    Tanpa langkah ini, tidak ada admin sama sekali dan menu Kelola User
--    tidak akan bisa dibuka oleh siapa pun.
insert into user_access (user_id, email, role, akses_tab)
select id, email, 'admin', array['kasir','dapur','meja','menu','laporan','rekonsiliasi','kelola_user']
from auth.users
where email = 'dwyulia241@gmail.com'
on conflict (user_id) do update set role = 'admin';
