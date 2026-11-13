-- ============================================================
-- Al-Madina Earnings — supabase.sql
-- Run this in Supabase: Dashboard -> SQL Editor -> New query
-- Paste this file, press Run. Do it once.
--
-- SAFE VERSION ONLY:
-- No deposit tables. No paid plans. No guaranteed daily percent.
-- Users earn ONLY per approved task. Referral = 5% of task earnings.
-- Withdrawal has NO minimum. Admin pays manually.
-- ============================================================

-- ---------- 1. PROFILES ----------
-- One row per user. Supabase Auth owns the email + password.
-- `id` must match auth.users.id (the login account).
-- `is_admin` is FALSE by default. See the admin rule below.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  referral_code text unique,          -- e.g. AME-AB12, given at sign-up
  referred_by uuid references public.profiles(id),  -- who invited this user, or NULL
  is_admin boolean not null default false,
  balance_rs numeric not null default 0,           -- money available to withdraw
  task_earnings_rs numeric not null default 0,
  referral_earnings_rs numeric not null default 0,
  total_withdrawn_rs numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 2. TASKS ----------
-- The 30-day plan: 30 days x 3 tasks = 90 rows.
-- reward_rs is a SNAPSHOT at creation time. If the admin later
-- changes rates in `settings`, new approvals should use the new
-- rate (see app.js — it reads settings at approval time).
-- For a beginner: the DO block below creates all 90 rows for you,
-- rotating through the 5 channels. You do not need to type 90 rows.
create table if not exists public.tasks (
  id text primary key,                -- T1 ... T90
  day_number int not null check (day_number between 1 and 30),
  platform text not null,             -- TikTok / YouTube / Instagram / Facebook
  channel_name text not null,         -- e.g. @not_your_ibrar
  channel_url text not null,
  action text not null check (action in ('Follow', 'Like', 'Comment')),
  reward_rs numeric not null,
  created_at timestamptz not null default now()
);

-- Seed the 90 tasks. Safe to run again: ON CONFLICT DO NOTHING
-- means existing rows are kept and not duplicated.
-- Channel order rotates: TikTok 1, TikTok 2, YouTube, Instagram, Facebook.
do $$
declare
  channels text[][] := array[
    ['TikTok', '@not_your_ibrar', 'https://www.tiktok.com/@not_your_ibrar'],
    ['TikTok', '@you_know_zakir', 'https://www.tiktok.com/@you_know_zakir'],
    ['YouTube', '@oyeah-b8m', 'https://youtube.com/@oyeah-b8m'],
    ['Instagram', '@zakir_romi', 'https://www.instagram.com/zakir_romi'],
    ['Facebook', 'Facebook channel', 'https://www.facebook.com/share/1EzUtZgzFa/']
  ];
  actions text[] := array['Follow', 'Like', 'Comment'];
  rewards numeric[] := array[10, 5, 10]; -- Follow 10, Like 5, Comment 10 (examples)
  d int; s int; n int := 0;
  ch text[]; act text; rew numeric;
begin
  for d in 1..30 loop
    for s in 0..2 loop
      n := n + 1;
      ch := channels[((d * 3 + s) % 5) + 1];
      act := actions[((d + s) % 3) + 1];
      rew := case act when 'Follow' then 10 when 'Like' then 5 else 10 end;
      insert into public.tasks (id, day_number, platform, channel_name, channel_url, action, reward_rs)
      values ('T' || n, d, ch[1], ch[2], ch[3], act, rew)
      on conflict (id) do nothing;
    end loop;
  end loop;
end $$;

-- ---------- 3. TASK SUBMISSIONS ----------
-- One row every time a user presses "Mark done".
-- CONDITION: status starts as 'pending'. Money is paid ONLY
-- when an admin changes it to 'approved' (see the app logic).
-- A user must not be paid twice for the same task:
-- the unique key (user_id, task_id) blocks a second row.
create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id text not null references public.tasks(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reward_rs numeric not null,          -- reward at submission time
  created_at timestamptz not null default now(),
  unique (user_id, task_id)
);

-- ---------- 4. WITHDRAWALS ----------
-- CONDITION: no minimum. Any amount above Rs 0 is allowed,
-- as long as amount_rs <= the user's balance at request time.
-- The app takes the money out of the balance when the request
-- is created (a "hold"). If admin rejects it, the app refunds it.
-- `status` is 'pending' until admin marks it 'paid' or 'rejected'.
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_rs numeric not null check (amount_rs > 0),
  phone text not null,
  bank_account text not null,          -- bank name + account, given by the USER
  status text not null default 'pending' check (status in ('pending', 'paid', 'rejected')),
  created_at timestamptz not null default now()
);

-- ---------- 5. REFERRALS (read from profiles, no separate money table) ----------
-- We do NOT need a separate money table for referrals.
-- A referral is simply: profiles.referred_by points at the inviter.
-- The bonus is calculated at approval time:
--   bonus = task reward x referral_percent / 100
--   e.g. 5% of Rs 10 = Rs 0.50
-- This table is a simple audit log, so an admin can see who invited whom.
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null references public.profiles(id),
  bonus_rs numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (referred_id)
);

-- ---------- 6. SETTINGS ----------
-- One row (id = 1). Only admins may change it.
-- These are EXAMPLE rates. Change them to match what the
-- company actually pays per follow / like / comment.
create table if not exists public.settings (
  id int primary key,
  follow_rs numeric not null default 10,
  like_rs numeric not null default 5,
  comment_rs numeric not null default 10,
  referral_percent numeric not null default 5,  -- 5%
  updated_at timestamptz not null default now()
);
insert into public.settings (id, follow_rs, like_rs, comment_rs, referral_percent)
values (1, 10, 5, 10, 5)
on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — READ THIS BEFORE GOING LIVE
-- ============================================================
-- RLS is OFF by default in the SQL above. That is fine for
-- learning, but NOT safe for real users: anyone with the anon
-- key could read or change any row.
--
-- Before real users join, turn RLS ON and add policies.
-- A safe starting point (paste after the tables above):
--
--   alter table public.profiles enable row level security;
--   alter table public.tasks enable row level security;
--   alter table public.task_submissions enable row level security;
--   alter table public.withdrawals enable row level security;
--   alter table public.referrals enable row level security;
--   alter table public.settings enable row level security;
--
-- Then add policies such as:
--   * Everyone can READ tasks and settings.
--   * A user can READ/INSERT only their OWN submissions and withdrawals.
--   * Only admins can UPDATE submissions/withdrawals and settings.
--     (Check is_admin via a helper: auth.uid() in profiles where is_admin = true.)
--   * Only the first user may claim admin — enforce this in the app
--     AND by checking "no admin exists yet" before allowing it.
--
-- Supabase docs: https://supabase.com/docs/guides/auth/row-level-security
-- If RLS feels confusing, keep the site in demo mode until someone
-- who knows Supabase helps you add these policies. Do NOT collect
-- real money or real bank details without RLS + real Auth.
-- ============================================================

-- Quick checks after running (optional, for learning):
-- select count(*) from public.tasks;            -- should be 90
-- select * from public.tasks where day_number = 1; -- should be 3 rows
-- select * from public.settings;                -- should be 1 row: 10 / 5 / 10 / 5%
