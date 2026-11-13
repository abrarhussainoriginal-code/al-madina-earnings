# Al-Madina Earnings — Netlify-ready codebase (safe version)

Free to join. Earn only per completed task, after admin approval.
No deposit system. No paid plans. No guaranteed daily percent.

> **Read this first:** this folder is the *code* for the site, so you
> can read it and understand it before anything is uploaded or
> pushed to GitHub. Nothing in this folder has been uploaded yet.

## What is in this folder?

| File | What it is | Open it first? |
|---|---|---|
| `index.html` | The whole site: Home, Sign up, Login, Dashboard / Tasks, Wallet, Referrals, Withdraw, Admin. | **Yes — start here.** It is the page you see. |
| `styles.css` | The look: green / white theme, cards, buttons, mobile layout. | If you want to change colours or sizes. |
| `app.js` | All the logic in plain JavaScript, with comments. | **Second.** This is where the rules live. |
| `supabase.sql` | The database: tables + the 30-day task plan + settings. Run once in Supabase. | When you set up Supabase. |
| `netlify.toml` | Netlify settings: publish this folder, no build step. | You do not need to edit it. |
| `README.md` | This guide. | You are reading it. |

## How the code works — file by file

### 1. `index.html` — what you see

One page with sections called "views". Only one view is shown at a time.
The top menu switches views: Home, Tasks, Wallet, Referrals, Withdraw, Admin.

- **Home** explains the deal and lists the 5 channels.
- **Sign up** asks for name, email, password, and an optional referral code.
- **Login** asks for email + password.
- **Tasks** shows Day 1–30 (pick a day), 3 tasks a day, each with
  Open channel + Mark done.
- **Wallet** shows balance, total earned, total withdrawn, and history.
- **Referrals** shows your code, how many friends joined, and earnings.
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
- Rewards are **examples**. Change them in Admin to match what the
  company actually pays you.

**Channels + task plan**
- `CHANNELS` is the exact 5 channels you gave:
  TikTok `@not_your_ibrar`, TikTok `@you_know_zakir`,
  YouTube `@oyeah-b8m`, Instagram `@zakir_romi`, Facebook share link.
- `generateTasks()` makes 30 days × 3 tasks = 90 tasks, rotating
  channels so no day repeats the same channel 3 times.

**The key conditions — where the safety rules live:**

1. **Task approval before pay** — in `submitTask()` and `approveTask()`
   - `submitTask()` only creates a row with `status: "pending"`.
     It pays **nothing**.
   - `approveTask()` is the **only** place task money is created.
     It adds the reward to the user's balance + task earnings.
   - `rejectTask()` pays nothing.

2. **One submission per task** — in `submitTask()`
   - If a row already exists for that user + that task, the second
     press is blocked. You cannot be paid twice for one task.

3. **Referral 5%** — in `approveTask()`, right after paying the earner
   - If the earner was referred by someone, the referrer gets
     `reward × 5 / 100`. Example: 5% of Rs 10 = Rs 0.50.
   - It is paid from **task earnings only**, never from a deposit,
     because there is no deposit.

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

6. **Supabase vs local demo** — in `initSupabase()` and `store`
   - If `SUPABASE_URL` + `SUPABASE_ANON_KEY` are filled in, the app
     uses Supabase Auth and writes submissions / withdrawals to
     Supabase tables too.
   - If they are empty, everything is saved in `localStorage` in
     **this browser only**. That is demo mode — see "What will NOT
     work without Supabase" below.

## How to set up Supabase (free)

You only need this if you want real users on different phones to
share one set of accounts. Skip it for now if you just want to read
the code and try it on your own computer.

1. Go to https://supabase.com → create a free project.
2. In the project, open **SQL Editor → New query**.
3. Copy all of `supabase.sql` into it and press **Run**.
   - Check: `select count(*) from public.tasks;` should return **90**.
   - Check: `select * from public.settings;` should show 10 / 5 / 10 / 5%.
4. In Supabase go to **Settings → API**. Copy the **Project URL**
   and the **anon / public key** (never the service key).
5. Open `app.js`, paste them into `CONFIG`:
   ```js
   SUPABASE_URL: "https://your-project.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGciOi...",
   ```
6. **Before real users:** read the Row Level Security (RLS) notes
   at the bottom of `supabase.sql`. RLS is off by default in this
   file for learning. Do not collect real bank details without
   RLS + real Auth. If RLS feels confusing, keep the site in demo
   mode until someone who knows Supabase helps you.

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

With Supabase set up (and RLS added), accounts and data are shared,
and the admin can see and approve real users.

## What is NOT in this code — on purpose

- No deposit system. Users never pay to join or to get tasks.
- No paid plans. No Rs 500 / 2,500 / 5,000 / 10,000 / 25,000 plans.
- No guaranteed daily percent. No 20%, no 15% per day.
- No screenshot payment upload. No bank account numbers are in
  this code. The only bank field is the one a *user types in*
  when they request a withdrawal, so the admin knows where to send it.
- No real passwords or API keys. Supabase keys are placeholders.
- No code has been pushed to GitHub or deployed to Netlify yet.
  You asked to see the code first — this folder is that step.
