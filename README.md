# Al-Madina Earnings — Netlify-ready codebase (safe version)

Account creation is free. Ten 80-day activity plans are available;
a selected plan activates automatically when the fictional balance covers
its price, which is deducted at activation. This demo does not
collect or verify payments. All plan rewards and balances are fictional
classroom-simulation values; no real money is paid.

> **Read this first:** this folder is the *code* for the site, so you
> can read it and understand it before anything is uploaded or
> pushed to GitHub. Nothing in this folder has been uploaded yet.

## What is in this folder?

| File | What it is | Open it first? |
|---|---|---|
| `index.html` | The whole site: Home, Sign up, Login, Dashboard / Tasks, Wallet, Deposit, Referrals, Withdraw, Admin. | **Yes — start here.** It is the page you see. |
| `styles.css` | The look: green / white theme, cards, buttons, mobile layout. | If you want to change colours or sizes. |
| `app.js` | All the logic in plain JavaScript, with comments. | **Second.** This is where the rules live. |
| `supabase.sql` | The database: tables + the 80-day task plan + settings. Run in Supabase. | When you set up Supabase. |
| `netlify.toml` | Netlify settings: publish this folder, no build step. | You do not need to edit it. |
| `README.md` | This guide. | You are reading it. |

## How the code works — file by file

### 1. `index.html` — what you see

One page with sections called "views". Only one view is shown at a time.
The top menu switches views: Home, Tasks, Plans, Wallet, Referrals, Withdraw, Admin.

- **Home** explains the deal and lists the 5 channels.
- **Sign up** asks for name, email, password, and an optional referral code.
  Referral links prefill the code automatically.
- **Login** asks for email + password.
- **Plans** offers these 80-day classroom-simulation tiers:
  Rs 390 (Rs 60/day), Rs 870 (Rs 145/day), Rs 1,890 (Rs 315/day),
  Rs 3,660 (Rs 610/day), Rs 7,260 (Rs 1,210/day), Rs 14,850 (Rs 2,475/day),
  Rs 32,820 (Rs 5,470/day), Rs 62,940 (Rs 10,490/day),
  Rs 136,560 (Rs 22,760/day), and Rs 280,830 (Rs 46,805/day).
  Tasks are approved automatically when marked done. A daily simulation reward
  is credited once after all three tasks for that day are done. Plans activate
  automatically when the fictional balance covers their price; the price is
  deducted. Each plan shows total simulated rewards, calculated in Supabase as
  `daily reward × plan days`. The demo does not handle payments.
- **Tasks** stays locked without an active plan. Once activated, it
  shows Day 1–80, 3 tasks a day, each with Open channel + Mark done; marking
  a task done approves it automatically.
- **Wallet** shows balance, total earned, total withdrawn, and history.
- **Deposit** submits a fictional balance request for admin accept/reject review.
  Accepting adds simulated balance only; no real payment is processed. These
  requests are stored in the current browser and are not shared across devices.
- **Referrals** provides a shareable signup link and code, and shows how many
  friends joined and earnings.
- **Withdraw** asks for amount, phone number, and bank account.
- **Admin** is hidden unless you are an admin.

### 2. `styles.css` — what it looks like

Plain CSS, no framework. Green (`#0a7a3d`) is the main colour,
white cards, rounded corners. On a phone the menu wraps and the
cards stack in one column. Change `--green` at the top to change
the theme.

### 3. `app.js` — what it does (the important file)

Read it top to bottom. The sections are numbered in comments.

**CONFIG (top of the file)**
```js
SUPABASE_URL: "",
SUPABASE_ANON_KEY: "",
REWARDS: { Follow: 10, Like: 5, Comment: 10 },
REFERRAL_PERCENT: 5,
```
- Leave the Supabase fields empty for local demo mode.
- Fill them in only after you create a Supabase project (below).
- These per-action rates apply only to legacy plans. New plans use the
  fictional daily rewards listed in `PLANS`; all three tasks must be marked done.

**Channels + task plan**
- All 80-day tasks use the TikTok profile `@zoya.sheikh772`.
- `generateTasks()` makes 80 days × 3 tasks = 240 tasks, rotating
  Follow, Like, and Comment actions on that profile.
- Re-run `supabase.sql` in Supabase to update the stored task catalog and enable automatic task approval.
- Day 1 opens when a plan is activated; each following task day unlocks
  24 hours later. Existing active plans use their expiry to infer the start.
  New plan rewards are fictional classroom-simulation amounts and are credited
  once per day only after all three tasks for that day are marked done. No real
  money is paid by this project.

**The key conditions — where the safety rules live:**

1. **Automatic task approval and simulated rewards** — in `submitTask()` and `approveTask()`
   - `submitTask()` approves the task immediately when the user marks it done.
   - New-plan rewards are credited once per day, after all three tasks are done.
   - Existing pending tasks can still be approved or rejected by an admin.

2. **One submission per task** — in `submitTask()`
   - If a row already exists for that user + that task, the second
     press is blocked. You cannot be paid twice for one task.

3. **Referral 5%** — in `approveTask()`, after crediting the earner
   - If the earner was referred by someone, the referrer gets
     `credited reward × 5 / 100`.
   - It is based on simulated task rewards only; demo balance requests do not
     create referral bonuses.

4. **Withdrawal, no minimum** — in `handleWithdraw()`
   - Any amount above Rs 0 is allowed, as long as `amount <= balance`.
   - The amount is taken out of the balance **at request time**
     (a hold), so it cannot be requested twice.
   - `payWithdrawal()` marks it paid. `rejectWithdrawal()` **refunds**
     the amount back to the balance.

5. **Admin — first user claims, then promotes friends** — in `renderAdmin()`, `claimAdmin()`, `promoteUser()`
   - `claimAdmin()` only works if **no admin exists yet**.
     The first account to sign up should be yours.
   - After that, only an existing admin can press "Make admin"
     on another user. A stranger cannot make themselves admin.
   - Admins can approve / reject tasks, mark withdrawals paid /
     reject + refund, and change reward rates + referral percent
     in Settings.

6. **Plans and task access** — in `requestPlan()`, `activateRequestedPlan()`,
   `getActivePlan()`, and `submitTask()`
  - A user selects a plan; it activates automatically when the fictional
    balance covers its price, which is deducted from the balance.
   - Task rendering and task submission both require an active plan.
  - This is a classroom simulation, not payment processing or verification.
    User records are local in demo mode.

7. **Supabase vs local demo** — in `initSupabase()`, `refreshSupabaseData()`,
   and the database RPC functions
   - If `SUPABASE_URL` + `SUPABASE_ANON_KEY` are filled in, auth profiles,
     tasks, submissions, balances, plans, demo balance requests, withdrawals,
     referrals, settings, and balance history are stored in Supabase.
   - If they are empty, everything is saved in `localStorage` in
     **this browser only**. That is demo mode — see "What will NOT
     work without Supabase" below.

## How to set up Supabase (free)

Use this to share the school-project simulation across browsers/devices.
All balances and requests remain fictional; this project does not process
real payments.

1. Go to https://supabase.com → create a free project.
2. In the project, open **SQL Editor → New query**.
3. Copy all of `supabase.sql` into it and press **Run**. It creates or updates
  the tables, auth profile trigger, server-side RPC functions, RLS policies,
  and the 240 task rows. It is designed to be rerun for schema updates.
  - Check: `select count(*) from public.tasks;` should return **240**.
  - Check: `select count(*) from public.plan_catalog;` should return **10**.
  - The script enables RLS and only exposes safe read access; balance-changing
    actions use the validated RPC functions.
4. In Supabase go to **Settings → API**. Copy the **Project URL**
   and the **anon / public key** (never the service key).
5. Open `app.js`, paste the Project URL and the **public anon/publishable key**
  into `CONFIG`:
   ```js
   SUPABASE_URL: "https://your-project.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
6. Open the app and create your first account. Sign in, open **Admin**, and
  claim the first-admin role. Then use another browser/account to test signup,
  demo balance requests, admin review, task approval, and shared wallet data.
7. The Supabase public key is intended for browser use only with these RLS
  policies. Never use the `service_role` or secret key in `app.js` or GitHub.
8. Existing accounts/data in browser `localStorage` are not copied into Supabase.
  Users must sign up again with Supabase Auth; old browser data remains local.

## How to deploy to Netlify

### Option A — Drag and drop (easiest, no GitHub needed)

1. Open https://app.netlify.com/drop (log in / create a free account).
2. Drag **this whole folder** (`al-madina-earnings-code`) onto the page.
3. Netlify gives you a link like `https://al-madina-earnings.netlify.app`.
4. To update it later, drag the folder again, or use Option B.

`netlify.toml` in this folder tells Netlify: publish this folder,
no build command needed.

### Option B — Connect GitHub (so updates deploy automatically)

1. Create a new **empty** GitHub repository, e.g. `al-madina-earnings`.
   Do not push any bank details, passwords, or real Supabase keys.
2. Upload / push the files in this folder to that repository.
3. In Netlify: **Add new site → Import an existing project → GitHub**
   → pick the repository.
4. Build settings: **Publish directory: `.`** (a dot — this folder),
   **Build command: (leave empty)**.
5. Press Deploy. Every future push to GitHub will re-deploy automatically.

## What will NOT work without Supabase?

In local demo mode (Supabase fields empty):

- ❌ Accounts do **not** travel between devices. An account made
  on your phone will not exist on a friend's phone.
- ❌ The admin **cannot see** other users' tasks or withdrawals,
  because each browser has its own separate `localStorage`.
- ❌ If a user clears browser data, their demo account is gone.
- ✅ Everything else works for learning: sign up, tasks, approval
  flow (open two accounts in the same browser to test admin),
  wallet, referrals, withdrawal requests.

With Supabase configured, supported simulation accounts and records are shared,
and the admin can review task, demo balance, and withdrawal requests.

## What is NOT in this code — on purpose

- No real deposit processing or verification. The Deposit page only creates
  local fictional balance requests for classroom demonstration; it does not
  accept money or upload payment proof.
- No guaranteed earnings from a plan or daily percentage.
- No guaranteed daily percent. No 20%, no 15% per day.
- No screenshot payment upload. No recipient bank account numbers
  are in this code. The only bank field is the one a *user types in*
  when they request a withdrawal, so the admin knows where to send it.
- No real passwords or API keys. Supabase keys are placeholders.
- No code has been pushed to GitHub or deployed to Netlify yet.
  You asked to see the code first — this folder is that step.
