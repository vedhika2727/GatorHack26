-- Run this once in your Supabase project's SQL editor.
-- One table holds each person's check-ins and scan reports as JSON.
-- Row-level security makes every row visible only to the account that owns it.
create table if not exists public.records (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('checkin', 'scan')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.records enable row level security;
create policy "own records: read"   on public.records for select using (auth.uid() = user_id);
create policy "own records: insert" on public.records for insert with check (auth.uid() = user_id);
create policy "own records: update" on public.records for update using (auth.uid() = user_id);
create policy "own records: delete" on public.records for delete using (auth.uid() = user_id);
