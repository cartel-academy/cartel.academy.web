-- FX Cartel Academy — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a
-- fresh project. Replaces the Google Sheets "Students"/"Leads"/"Bookmarks"
-- tabs and all of apps-script-backend.gs's custom OTP/password/session code
-- with Supabase Auth (email OTP + password, session tokens, password reset
-- all handled natively) plus three tables and two RPCs.

-- ---- STUDENTS ----
-- One row per enrollment. `user_id` is null until the student completes
-- their first portal login (see link_account() below), at which point it's
-- linked to their Supabase Auth account. Mobile and email are both unique,
-- matching the checkout dedupe rule carried over from the old backend.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  student_code text unique not null,
  order_id text not null,
  name text not null default '',
  phone text unique not null,
  email text unique not null,
  course text not null default '',
  amount numeric not null default 0,
  vat numeric not null default 0,
  total numeric not null default 0,
  payment_method text not null default 'Paymob',
  paymob_ref text not null default '',
  payment_status text not null default 'Pending', -- 'Pending' | 'Paid'
  valid_until timestamptz,
  paid_at timestamptz,
  enrolled_on timestamptz not null default now(),
  status text not null default 'Active',
  address text not null default '',
  dob date,
  lat numeric,
  lng numeric,
  profile_complete boolean not null default false,
  is_superuser boolean not null default false,
  created_at timestamptz not null default now()
);

create index students_email_idx on public.students (lower(email));
create index students_phone_idx on public.students (phone);

-- Existing projects: run this once against an already-deployed database
-- (new projects get the column for free from the create table above).
-- alter table public.students add column if not exists is_superuser boolean not null default false;

alter table public.students enable row level security;

-- A logged-in student can read their own row and update only the profile
-- fields the portal's "complete your profile" form is allowed to touch.
-- Everything else (course, payment, validity, order) is only ever written
-- by the checkout/webhook Edge Functions using the service role key, which
-- bypasses RLS entirely — so no INSERT/DELETE grant exists for anon/
-- authenticated at all.
create policy "students select own row"
  on public.students for select
  to authenticated
  using (user_id = auth.uid());

create policy "students update own profile fields"
  on public.students for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select on public.students to authenticated;
grant update (address, dob, profile_complete) on public.students to authenticated;
-- is_superuser is deliberately excluded from the column list above — Postgres
-- enforces column-level UPDATE grants independently of the RLS policy, so
-- even though "students update own profile fields" lets a student update
-- their own row, they have no privilege to touch this specific column no
-- matter what a client sends (devtools, curl, a crafted REST call — RLS
-- alone wouldn't stop those, but this grant list does). There is
-- intentionally no RPC, Edge Function, or UI path that ever sets it either.
-- The only way to grant superuser is a one-time manual UPDATE run directly
-- in the Supabase SQL editor (service_role / the Postgres owner role bypass
-- both RLS and this grant list):
--   update public.students set is_superuser = true where lower(email) = 'cbsharan@gmail.com';
-- As of this schema, cbsharan@gmail.com is the only superuser.

-- ---- LEADS (contact form / "Get our newsletter") ----
-- Only the `contact` Edge Function ever reads/writes this table (via the
-- service role key), so no RLS policies grant anon/authenticated any
-- access — this keeps other visitors' contact details from being
-- readable by anyone with the public anon key.
create table public.leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  message text not null default '',
  source text not null default 'Website form',
  status text not null default 'New',
  flags int not null default 1
);

alter table public.leads enable row level security;
-- (No policies = no access for anon/authenticated; service role bypasses RLS.)

-- ---- BOOKMARKS (portal progress) ----
-- Denormalized user_id (rather than joining through students) keeps the
-- RLS policy a simple equality check.
create table public.bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  course text not null,
  topic_id text not null,
  topic_name text not null default '',
  marked_learned boolean not null default true,
  last_page integer,
  updated_on timestamptz not null default now(),
  unique (user_id, course, topic_id)
);

-- Existing projects: run this once against an already-deployed database
-- (new projects get the column for free from the create table above).
-- alter table public.bookmarks add column if not exists last_page integer;

alter table public.bookmarks enable row level security;

create policy "bookmarks select own"
  on public.bookmarks for select
  to authenticated
  using (user_id = auth.uid());

create policy "bookmarks upsert own"
  on public.bookmarks for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "bookmarks update own"
  on public.bookmarks for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.bookmarks to authenticated;

-- ---- RPC: check_enrollment ----
-- Anon-callable (runs before login/signup). Returns only booleans — never
-- the row itself — so it can't be used to enumerate student data. This is
-- the direct replacement for the old checkStudent() error-code logic; the
-- frontend decides which gate screen to show from these booleans instead
-- of a single ok/error response.
create or replace function public.check_enrollment(p_email text)
returns table (enrolled boolean, paid boolean, valid boolean, account_linked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.students%rowtype;
begin
  select * into r from public.students where lower(email) = lower(trim(p_email)) limit 1;
  if not found then
    return query select false, false, false, false;
    return;
  end if;
  return query select
    true,
    r.payment_status = 'Paid',
    (r.valid_until is not null and r.valid_until > now()),
    (r.user_id is not null);
end;
$$;

grant execute on function public.check_enrollment(text) to anon, authenticated;

-- ---- RPC: link_account ----
-- Called once, right after a student verifies their email OTP for the
-- first time (i.e. once they hold a valid Supabase Auth session). Links
-- that auth user to their existing students row by matching the verified
-- session's own email — a student can only ever link the row matching
-- their own authenticated email, never anyone else's.
create or replace function public.link_account()
returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.students%rowtype;
  caller_email text := auth.jwt() ->> 'email';
begin
  if caller_email is null then
    raise exception 'not authenticated';
  end if;

  update public.students
    set user_id = auth.uid()
    where lower(email) = lower(caller_email)
      and (user_id is null or user_id = auth.uid())
    returning * into r;

  if not found then
    raise exception 'no matching enrollment for this email';
  end if;
  return r;
end;
$$;

grant execute on function public.link_account() to authenticated;
