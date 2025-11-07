-- Supabase initialization script for the meat traceability MVP.
-- Run this in the Supabase SQL Editor to create the public.events table
-- used by the application.

create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default timezone('utc', now()),
  org_id text not null,
  operator text not null,
  step text not null,
  qr text not null,
  weight_kg numeric,
  note text
);

create index if not exists events_org_created_idx
  on public.events (org_id, created_at desc);

create index if not exists events_qr_idx
  on public.events (qr);

alter table public.events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'events' and schemaname = 'public' and polname = 'Allow anon select'
  ) then
    create policy "Allow anon select" on public.events
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'events' and schemaname = 'public' and polname = 'Allow anon insert'
  ) then
    create policy "Allow anon insert" on public.events
      for insert with check (true);
  end if;
end;
$$;
