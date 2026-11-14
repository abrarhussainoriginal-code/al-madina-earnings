-- ============================================================
-- Al-Madina Earnings — supabase.sql
-- Run this in Supabase: Dashboard -> SQL Editor -> New query
-- Safe to rerun to apply schema updates and refresh the task catalog.
--
-- SCHOOL PROJECT SIMULATION ONLY:
-- Demo balance requests do not process or verify real payments.
-- All balances and plan rewards are fictional.
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

alter table public.profiles
  add column if not exists plan_request_id text,
  add column if not exists active_plan_id text,
  add column if not exists plan_started_at timestamptz,
  add column if not exists plan_expires_at timestamptz;

-- ---------- 2. TASKS ----------
-- The 80-day plan: 80 days x 3 tasks = 240 rows.
-- reward_rs is a SNAPSHOT at creation time. If the admin later
-- changes rates in `settings`, new approvals should use the new
-- rate (see app.js — it reads settings at approval time).
-- For a beginner: the DO block below creates all 240 rows for you,
-- rotating through the 5 channels. You do not need to type 240 rows.
create table if not exists public.tasks (
  id text primary key,                -- T1 ... T240
  day_number int not null check (day_number between 1 and 80),
  platform text not null,             -- TikTok / YouTube / Instagram / Facebook
  channel_name text not null,         -- e.g. @totabhai326
  channel_url text not null,
  action text not null check (action in ('Follow', 'Like', 'Comment')),
  reward_rs numeric not null,
  created_at timestamptz not null default now()
);

-- Update existing installations as well as fresh databases.
alter table public.tasks drop constraint if exists tasks_day_number_check;
alter table public.tasks add constraint tasks_day_number_check check (day_number between 1 and 80);

-- Seed the 240 tasks. Re-running refreshes task channel data without duplicates.
-- Channel order rotates: TikTok 1, TikTok 2, YouTube, Instagram, Facebook.
do $$
declare
  channels text[][] := array[
    ['TikTok', '@totabhai326', 'https://www.tiktok.com/@totabhai326?_r=1&_t=ZS-9BOKPxsHV7R'],
    ['TikTok', '@abdulrehman65357', 'https://www.tiktok.com/@abdulrehman65357?_r=1&_t=ZS-9BOKW7PBZcS'],
    ['YouTube', '@oyeah-b8m', 'https://youtube.com/@oyeah-b8m?si=CM3ErIiYUYRVJiOM'],
    ['Instagram', '@mr_abdulrehman_150', 'https://www.instagram.com/mr_abdulrehman_150?vrfl=eDM0M2FkcjFubWM2'],
    ['Facebook', 'Facebook channel', 'https://www.facebook.com/share/1LxQBJLsBL/']
  ];
  actions text[] := array['Follow', 'Like', 'Comment'];
  rewards numeric[] := array[10, 5, 10]; -- Follow 10, Like 5, Comment 10 (examples)
  d int; s int; n int := 0;
  channel_index int; act text; rew numeric;
begin
  for d in 1..80 loop
    for s in 0..2 loop
      n := n + 1;
      channel_index := ((d * 3 + s) % 5) + 1;
      act := actions[((d + s) % 3) + 1];
      rew := case act when 'Follow' then 10 when 'Like' then 5 else 10 end;
      insert into public.tasks (id, day_number, platform, channel_name, channel_url, action, reward_rs)
      values ('T' || n, d, channels[channel_index][1], channels[channel_index][2], channels[channel_index][3], act, rew)
      on conflict (id) do update set
        platform = excluded.platform,
        channel_name = excluded.channel_name,
        channel_url = excluded.channel_url;
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

-- ---------- 7. PLAN CATALOG AND SIMULATION LEDGER ----------
create table if not exists public.plan_catalog (
  id text primary key,
  price_rs numeric not null check (price_rs > 0),
  daily_reward_rs numeric not null check (daily_reward_rs >= 0),
  duration_days int not null check (duration_days > 0)
);

insert into public.plan_catalog (id, price_rs, daily_reward_rs, duration_days) values
  ('plan-390', 390, 60, 80),
  ('plan-870', 870, 145, 80),
  ('plan-1890', 1890, 315, 80),
  ('plan-3660', 3660, 610, 80),
  ('plan-7260', 7260, 1210, 80),
  ('plan-14850', 14850, 2475, 80),
  ('plan-32820', 32820, 5470, 80),
  ('plan-62940', 62940, 10490, 80),
  ('plan-136560', 136560, 22760, 80),
  ('plan-280830', 280830, 46805, 80)
on conflict (id) do update set
  price_rs = excluded.price_rs,
  daily_reward_rs = excluded.daily_reward_rs,
  duration_days = excluded.duration_days;

create table if not exists public.demo_balance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_rs numeric not null check (amount_rs > 0 and amount_rs = trunc(amount_rs)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);
create unique index if not exists one_pending_demo_balance_request_per_user
  on public.demo_balance_requests (user_id) where status = 'pending';

create table if not exists public.balance_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  amount_rs numeric not null,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_task_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_started_at timestamptz not null,
  day_number int not null check (day_number between 1 and 80),
  amount_rs numeric not null check (amount_rs >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, plan_started_at, day_number)
);

-- Create a profile for each Supabase Auth account and connect referral codes.
create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  new_referral_code text;
  referrer_id uuid;
begin
  loop
    new_referral_code := 'AME-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    exit when not exists (select 1 from public.profiles where referral_code = new_referral_code);
  end loop;

  select id into referrer_id
  from public.profiles
  where referral_code = upper(nullif(new.raw_user_meta_data ->> 'referral_code', ''));

  insert into public.profiles (id, full_name, email, referral_code, referred_by)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    new_referral_code,
    referrer_id
  );
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_auth_user();

-- Backfill profiles for accounts that existed before this trigger was installed.
insert into public.profiles (id, full_name, email, referral_code)
select
  auth_user.id,
  coalesce(nullif(auth_user.raw_user_meta_data ->> 'full_name', ''), split_part(auth_user.email, '@', 1)),
  auth_user.email,
  'AME-' || upper(substr(md5(auth_user.id::text), 1, 8))
from auth.users auth_user
on conflict (id) do nothing;

-- ---------- 8. SERVER-SIDE OPERATIONS ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;

create or replace function public.admin_exists()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (select 1 from public.profiles where is_admin);
$$;

create or replace function public.get_my_referred_friends()
returns table (id uuid, full_name text, email text, task_earnings_rs numeric)
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select friend.id, friend.full_name, friend.email, friend.task_earnings_rs
  from public.profiles friend
  where friend.referred_by = auth.uid();
$$;

create or replace function public.maybe_activate_selected_plan(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  account public.profiles%rowtype;
  selected_plan public.plan_catalog%rowtype;
  started_at timestamptz;
begin
  select * into account from public.profiles where id = p_user_id for update;
  if not found or account.plan_request_id is null then return false; end if;
  if account.active_plan_id is not null and account.plan_expires_at > now() then return false; end if;

  select * into selected_plan from public.plan_catalog where id = account.plan_request_id;
  if not found or account.balance_rs < selected_plan.price_rs then return false; end if;

  started_at := now();
  update public.profiles set
    balance_rs = balance_rs - selected_plan.price_rs,
    active_plan_id = selected_plan.id,
    plan_started_at = started_at,
    plan_expires_at = started_at + make_interval(days => selected_plan.duration_days),
    plan_request_id = null
  where id = p_user_id;

  insert into public.balance_history (user_id, description, amount_rs)
  values (p_user_id, 'Plan activated: ' || selected_plan.id || ' (fictional balance)', -selected_plan.price_rs);
  return true;
end;
$$;

create or replace function public.select_plan(p_plan_id text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  account public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into account from public.profiles where id = auth.uid() for update;
  if not found then raise exception 'Profile not found'; end if;
  if account.active_plan_id is not null and account.plan_expires_at > now() then
    raise exception 'An active plan already exists';
  end if;
  if not exists (select 1 from public.plan_catalog where id = p_plan_id) then
    raise exception 'Unknown plan';
  end if;
  update public.profiles set plan_request_id = p_plan_id where id = auth.uid();
  return public.maybe_activate_selected_plan(auth.uid());
end;
$$;

create or replace function public.request_demo_balance(p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_amount <= 0 or p_amount <> trunc(p_amount) then raise exception 'Enter a positive whole-number demo amount'; end if;
  insert into public.demo_balance_requests (user_id, amount_rs)
  values (auth.uid(), p_amount)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.review_demo_balance(p_request_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare request_row public.demo_balance_requests%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into request_row from public.demo_balance_requests where id = p_request_id and status = 'pending' for update;
  if not found then raise exception 'Pending request not found'; end if;

  update public.demo_balance_requests set
    status = case when p_approve then 'approved' else 'rejected' end,
    reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_request_id;

  if p_approve then
    update public.profiles set balance_rs = balance_rs + request_row.amount_rs where id = request_row.user_id;
    insert into public.balance_history (user_id, description, amount_rs)
    values (request_row.user_id, 'Demo balance request accepted (fictional)', request_row.amount_rs);
    perform public.maybe_activate_selected_plan(request_row.user_id);
  end if;
end;
$$;

create or replace function public.submit_task(p_task_id text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  account public.profiles%rowtype;
  task_row public.tasks%rowtype;
  plan_days int;
  task_reward numeric;
  submission_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into account from public.profiles where id = auth.uid() for update;
  if not found or account.active_plan_id is null or account.plan_expires_at is null or account.plan_expires_at <= now() then
    raise exception 'An active plan is required';
  end if;
  select * into task_row from public.tasks where id = p_task_id;
  if not found then raise exception 'Task not found'; end if;
  select duration_days into plan_days from public.plan_catalog where id = account.active_plan_id;
  if plan_days is null then plan_days := 30; end if;
  if task_row.day_number > plan_days or task_row.day_number > floor(extract(epoch from (
    now() - coalesce(account.plan_started_at, account.plan_expires_at - make_interval(days => plan_days))
  )) / 86400) + 1 then
    raise exception 'Task day is locked';
  end if;

  select case task_row.action
    when 'Follow' then follow_rs when 'Like' then like_rs else comment_rs end
  into task_reward from public.settings where id = 1;

  if exists (select 1 from public.plan_catalog where id = account.active_plan_id) then
    task_reward := 0;
  end if;
  insert into public.task_submissions (user_id, task_id, status, reward_rs)
  values (auth.uid(), task_row.id, 'pending', coalesce(task_reward, task_row.reward_rs))
  returning id into submission_id;
  return submission_id;
end;
$$;

create or replace function public.review_task(p_submission_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  submission public.task_submissions%rowtype;
  account public.profiles%rowtype;
  task_day int;
  plan_reward numeric;
  approved_count int;
  task_count int;
  payout numeric;
  referrer_id uuid;
  referrer_reward numeric;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into submission from public.task_submissions where id = p_submission_id and status = 'pending' for update;
  if not found then raise exception 'Pending submission not found'; end if;
  update public.task_submissions set status = case when p_approve then 'approved' else 'rejected' end where id = p_submission_id;
  if not p_approve then return; end if;

  select * into account from public.profiles where id = submission.user_id for update;
  select day_number into task_day from public.tasks where id = submission.task_id;
  select daily_reward_rs into plan_reward from public.plan_catalog where id = account.active_plan_id;

  if plan_reward is not null then
    select count(*) into task_count from public.tasks where day_number = task_day;
    select count(*) into approved_count from public.task_submissions sub
      join public.tasks task on task.id = sub.task_id
      where sub.user_id = account.id and task.day_number = task_day and sub.status = 'approved';
    if approved_count < task_count or account.plan_started_at is null then return; end if;
    insert into public.daily_task_payouts (user_id, plan_started_at, day_number, amount_rs)
    values (account.id, account.plan_started_at, task_day, plan_reward)
    on conflict (user_id, plan_started_at, day_number) do nothing;
    if not found then return; end if;
    payout := plan_reward;
  else
    payout := submission.reward_rs;
  end if;

  update public.profiles set
    balance_rs = balance_rs + payout,
    task_earnings_rs = task_earnings_rs + payout
  where id = account.id;
  insert into public.balance_history (user_id, description, amount_rs)
  values (account.id, 'Approved task reward, day ' || task_day, payout);

  referrer_id := account.referred_by;
  if referrer_id is not null then
    select round(payout * referral_percent / 100, 2) into referrer_reward from public.settings where id = 1;
    update public.profiles set
      balance_rs = balance_rs + coalesce(referrer_reward, 0),
      referral_earnings_rs = referral_earnings_rs + coalesce(referrer_reward, 0)
    where id = referrer_id;
    if coalesce(referrer_reward, 0) > 0 then
      insert into public.referrals (referrer_id, referred_id, bonus_rs)
      values (referrer_id, account.id, referrer_reward)
      on conflict (referred_id) do update set bonus_rs = public.referrals.bonus_rs + excluded.bonus_rs;
      insert into public.balance_history (user_id, description, amount_rs)
      values (referrer_id, 'Referral simulation reward from ' || account.full_name, referrer_reward);
      perform public.maybe_activate_selected_plan(referrer_id);
    end if;
  end if;
  perform public.maybe_activate_selected_plan(account.id);
end;
$$;

create or replace function public.request_withdrawal(p_amount numeric, p_phone text, p_bank_account text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare request_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_amount <= 0 or nullif(trim(p_phone), '') is null or nullif(trim(p_bank_account), '') is null then
    raise exception 'Enter a positive amount, phone, and bank account';
  end if;
  update public.profiles set balance_rs = balance_rs - p_amount
  where id = auth.uid() and balance_rs >= p_amount;
  if not found then raise exception 'Insufficient balance'; end if;
  insert into public.withdrawals (user_id, amount_rs, phone, bank_account, status)
  values (auth.uid(), p_amount, trim(p_phone), trim(p_bank_account), 'pending')
  returning id into request_id;
  insert into public.balance_history (user_id, description, amount_rs)
  values (auth.uid(), 'Withdrawal requested (held)', -p_amount);
  return request_id;
end;
$$;

create or replace function public.review_withdrawal(p_withdrawal_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare withdrawal_row public.withdrawals%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('paid', 'rejected') then raise exception 'Decision must be paid or rejected'; end if;
  select * into withdrawal_row from public.withdrawals where id = p_withdrawal_id and status = 'pending' for update;
  if not found then raise exception 'Pending withdrawal not found'; end if;
  update public.withdrawals set status = p_decision where id = p_withdrawal_id;
  if p_decision = 'rejected' then
    update public.profiles set balance_rs = balance_rs + withdrawal_row.amount_rs where id = withdrawal_row.user_id;
    insert into public.balance_history (user_id, description, amount_rs)
    values (withdrawal_row.user_id, 'Rejected withdrawal refunded', withdrawal_row.amount_rs);
  else
    update public.profiles set total_withdrawn_rs = total_withdrawn_rs + withdrawal_row.amount_rs where id = withdrawal_row.user_id;
    insert into public.balance_history (user_id, description, amount_rs)
    values (withdrawal_row.user_id, 'Withdrawal marked paid', -withdrawal_row.amount_rs);
  end if;
end;
$$;

create or replace function public.claim_first_admin()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtext('al-madina-first-admin'));
  if exists (select 1 from public.profiles where is_admin) then raise exception 'An admin already exists'; end if;
  update public.profiles set is_admin = true where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

create or replace function public.promote_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  update public.profiles set is_admin = true where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;

create or replace function public.update_settings(p_follow numeric, p_like numeric, p_comment numeric, p_referral numeric)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_follow < 0 or p_like < 0 or p_comment < 0 or p_referral < 0 or p_referral > 100 then
    raise exception 'Settings values are outside allowed ranges';
  end if;
  update public.settings set follow_rs = p_follow, like_rs = p_like,
    comment_rs = p_comment, referral_percent = p_referral, updated_at = now()
  where id = 1;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY AND GRANTS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_submissions enable row level security;
alter table public.withdrawals enable row level security;
alter table public.referrals enable row level security;
alter table public.settings enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.demo_balance_requests enable row level security;
alter table public.balance_history enable row level security;
alter table public.daily_task_payouts enable row level security;

grant usage on schema public to authenticated;
revoke all on public.profiles, public.tasks, public.task_submissions, public.withdrawals,
  public.referrals, public.settings, public.plan_catalog, public.demo_balance_requests,
  public.balance_history, public.daily_task_payouts from anon, authenticated;
grant select on public.profiles, public.tasks, public.task_submissions, public.withdrawals,
  public.referrals, public.settings, public.plan_catalog, public.demo_balance_requests,
  public.balance_history, public.daily_task_payouts to authenticated;

drop policy if exists profiles_read_own_or_admin on public.profiles;
create policy profiles_read_own_or_admin on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists tasks_read_authenticated on public.tasks;
create policy tasks_read_authenticated on public.tasks
  for select to authenticated using (auth.uid() is not null);

drop policy if exists task_submissions_read_own_or_admin on public.task_submissions;
create policy task_submissions_read_own_or_admin on public.task_submissions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists withdrawals_read_own_or_admin on public.withdrawals;
create policy withdrawals_read_own_or_admin on public.withdrawals
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists referrals_read_participant_or_admin on public.referrals;
create policy referrals_read_participant_or_admin on public.referrals
  for select to authenticated using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

drop policy if exists settings_read_authenticated on public.settings;
create policy settings_read_authenticated on public.settings
  for select to authenticated using (auth.uid() is not null);

drop policy if exists plan_catalog_read_authenticated on public.plan_catalog;
create policy plan_catalog_read_authenticated on public.plan_catalog
  for select to authenticated using (auth.uid() is not null);

drop policy if exists demo_balance_requests_read_own_or_admin on public.demo_balance_requests;
create policy demo_balance_requests_read_own_or_admin on public.demo_balance_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists balance_history_read_own_or_admin on public.balance_history;
create policy balance_history_read_own_or_admin on public.balance_history
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists daily_task_payouts_read_own_or_admin on public.daily_task_payouts;
create policy daily_task_payouts_read_own_or_admin on public.daily_task_payouts
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

revoke all on function public.create_profile_for_auth_user() from public, anon, authenticated;
revoke all on function public.maybe_activate_selected_plan(uuid) from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_exists() from public, anon;
revoke all on function public.get_my_referred_friends() from public, anon;
revoke all on function public.select_plan(text) from public, anon;
revoke all on function public.request_demo_balance(numeric) from public, anon;
revoke all on function public.review_demo_balance(uuid, boolean) from public, anon;
revoke all on function public.submit_task(text) from public, anon;
revoke all on function public.review_task(uuid, boolean) from public, anon;
revoke all on function public.request_withdrawal(numeric, text, text) from public, anon;
revoke all on function public.review_withdrawal(uuid, text) from public, anon;
revoke all on function public.claim_first_admin() from public, anon;
revoke all on function public.promote_user(uuid) from public, anon;
revoke all on function public.update_settings(numeric, numeric, numeric, numeric) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_exists() to authenticated;
grant execute on function public.get_my_referred_friends() to authenticated;
grant execute on function public.select_plan(text) to authenticated;
grant execute on function public.request_demo_balance(numeric) to authenticated;
grant execute on function public.review_demo_balance(uuid, boolean) to authenticated;
grant execute on function public.submit_task(text) to authenticated;
grant execute on function public.review_task(uuid, boolean) to authenticated;
grant execute on function public.request_withdrawal(numeric, text, text) to authenticated;
grant execute on function public.review_withdrawal(uuid, text) to authenticated;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.promote_user(uuid) to authenticated;
grant execute on function public.update_settings(numeric, numeric, numeric, numeric) to authenticated;

-- Supabase docs: https://supabase.com/docs/guides/database/postgres/row-level-security

-- Quick checks after running (optional, for learning):
-- select count(*) from public.tasks;            -- should be 240
-- select * from public.tasks where day_number = 1; -- should be 3 rows
-- select * from public.settings;                -- should be 1 row: 10 / 5 / 10 / 5%
