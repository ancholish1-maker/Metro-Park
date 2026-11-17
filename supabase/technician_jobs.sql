-- Metro Park: plotting teknisi (jalankan di Supabase SQL Editor setelah ditinjau)
create table if not exists public.technician_jobs (
  id uuid primary key default gen_random_uuid(),
  tech text not null check (length(trim(tech)) > 0),
  unit text,
  description text not null check (length(trim(description)) > 0),
  scheduled_time time,
  status text not null default 'On Progress'
    check (status in ('On Schedule','On Progress','Done')),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists technician_jobs_created_at_idx on public.technician_jobs(created_at desc);
alter table public.technician_jobs enable row level security;
-- Hanya pengguna aktif yang terdaftar sebagai admin/staff dapat membaca.
drop policy if exists "active team reads technician jobs" on public.technician_jobs;
create policy "active team reads technician jobs" on public.technician_jobs
for select to authenticated using (
  exists (select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true
      and p.role in ('admin','staff'))
);
-- Hanya admin aktif yang boleh mengubah data pekerjaan.
drop policy if exists "active admin inserts technician jobs" on public.technician_jobs;
create policy "active admin inserts technician jobs" on public.technician_jobs
for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
    and p.is_active = true and p.role = 'admin')
);
drop policy if exists "active admin updates technician jobs" on public.technician_jobs;
create policy "active admin updates technician jobs" on public.technician_jobs
for update to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
  and p.is_active = true and p.role = 'admin')
) with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
  and p.is_active = true and p.role = 'admin')
);
drop policy if exists "active admin deletes technician jobs" on public.technician_jobs;
create policy "active admin deletes technician jobs" on public.technician_jobs
for delete to authenticated using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid())
  and p.is_active = true and p.role = 'admin')
);
-- Tidak membuat trigger otomatis karena skema produksi belum diverifikasi.
