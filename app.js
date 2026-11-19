/* ============================================================
   Al-Madina Earnings — app.js
   Plain JavaScript, written for a beginner to read.
   Read it top to bottom: CONFIG first, then data, then logic.

  DEMO PLAN ACCESS — the rules baked into this code:
  1. Account creation is free. The app does not process deposits.
  2. Each selected plan activates automatically when simulated balance covers its price.
  3. No guaranteed daily percent. No 20%, no 15%.
  4. A task is approved automatically when the user marks it done.
  5. Referral = 5% of what referred friends earn from TASKS.
  6. Withdrawal has NO minimum (any amount above Rs 0).
      Admin pays manually and marks it paid.
   ============================================================ */

/* ---------- 1. CONFIG — change these here, nowhere else ---------- */
const CONFIG = {
  // Supabase — leave empty for LOCAL DEMO MODE.
  // To use a real shared database, create a free Supabase project,
  // run supabase.sql in its SQL Editor, then paste the values here:
  SUPABASE_URL: "https://kozwmakhosoafstqebte.supabase.co",       // e.g. "https://xyzcompany.supabase.co"
  SUPABASE_ANON_KEY: "sb_publishable_QfriDRpQjoSoJzTjUREsDQ_zVNf5cYW",  // e.g. "eyJhbGciOi..." — the PUBLIC anon key only, never a service key

  // Legacy-plan task rewards. New plans use their simulated daily reward.
  REWARDS: { Follow: 10, Like: 5, Comment: 10 }, // in PKR (Rs)

  // Referral bonus: percent of a referred friend's TASK earnings.
  REFERRAL_PERCENT: 5, // 5%

  DAYS: 80,        // shared task schedule lasts 80 days
  TASKS_PER_DAY: 3 // 3 tasks every day
};
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- 2. AVAILABLE 80-DAY ACTIVITY PLANS ---------- */
let PLANS = [
  [390, 60], [870, 145], [1890, 315], [3660, 610], [7260, 1210],
  [14850, 2475], [32820, 5470], [62940, 10490], [136560, 22760], [280830, 46805]
].map(([amount, dailyReward]) => ({
  id: "plan-" + amount,
  amount,
  dailyReward,
  days: 80
}));
const LEGACY_PLANS = [500, 2500, 5000, 10000, 25000].map(amount => ({
  id: "plan-" + amount,
  amount,
  days: 30
}));
function findPlan(planId) {
  return PLANS.find(plan => plan.id === planId) || LEGACY_PLANS.find(plan => plan.id === planId) || null;
}

/* ---------- 3. TASK PROFILE ---------- */
const TASK_PROFILE = {
  platform: "TikTok",
  name: "@zoya.sheikh772",
  url: "https://www.tiktok.com/@zoya.sheikh772?_r=1&_t=ZS-9BSEi9RJtDR"
};
const CHANNELS = [TASK_PROFILE];

// The three actions rotate. Every task is one of these.
const ACTIONS = ["Follow", "Like", "Comment"];

/* ---------- 4. TASK PLAN — 80 days × 3 tasks, one TikTok profile ----------
   Reward comes from CONFIG.REWARDS, so changing it in Admin
   changes what future approvals pay. */
function generateTasks() {
  const tasks = [];
  let n = 0;
  for (let day = 1; day <= CONFIG.DAYS; day++) {
    for (let slot = 0; slot < CONFIG.TASKS_PER_DAY; slot++) {
      const channel = CHANNELS[(day * CONFIG.TASKS_PER_DAY + slot) % CHANNELS.length];
      const action = ACTIONS[(day + slot) % ACTIONS.length];
      n++;
      tasks.push({
        id: "T" + n,
        day: day,
        platform: channel.platform,
        channel: channel.name,
        url: channel.url,
        action: action,
        reward: CONFIG.REWARDS[action] // Rs 10 / 5 / 10 by default
      });
    }
  }
  return tasks;
}
let ALL_TASKS = generateTasks();

/* ---------- 4. SUPABASE (optional) ----------
   If CONFIG has a URL + key, we create a Supabase client.
   If not, useSupabase stays false and everything below uses
   localStorage (demo mode). Nothing breaks either way. */
let supabaseClient = null;
let useSupabase = false;
const remoteCache = {
  users: [], planActivations: [], submissions: [], withdrawals: [], depositRequests: [],
  history: [], dailyTaskPayouts: [], settings: null, adminExists: null
};
const remoteCacheKeys = new Set([
  "users", "submissions", "withdrawals", "depositRequests",
  "history", "dailyTaskPayouts", "settings"
]);
function initSupabase() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    useSupabase = true;
    console.log("Supabase mode: ON");
  } else {
    console.log("Local demo mode: Supabase not configured. See README.md.");
  }
}

function mapSupabaseProfile(row) {
  return {
    id: row.id, name: row.full_name, email: row.email,
    referralCode: row.referral_code, referredBy: row.referred_by,
    planRequestId: row.plan_request_id, activePlanId: row.active_plan_id,
    planStartedAt: row.plan_started_at, planExpiresAt: row.plan_expires_at,
    planActivations: [],
    isAdmin: row.is_admin, balance: Number(row.balance_rs),
    taskEarnings: Number(row.task_earnings_rs), referralEarnings: Number(row.referral_earnings_rs),
    totalWithdrawn: Number(row.total_withdrawn_rs)
  };
}

async function refreshSupabaseData() {
  if (!useSupabase || !currentUser) return;
  const [profiles, activations, tasks, submissions, withdrawals, deposits, history, payouts, settings, plans, adminStatus] = await Promise.all([
    supabaseClient.from("profiles").select("*"),
    supabaseClient.from("plan_activations").select("id,user_id,plan_id,started_at,expires_at"),
    supabaseClient.from("tasks").select("id,day_number,platform,channel_name,channel_url,action,reward_rs").order("day_number").order("id"),
    supabaseClient.from("task_submissions").select("id,user_id,task_id,status,reward_rs,created_at"),
    supabaseClient.from("withdrawals").select("id,user_id,amount_rs,phone,bank_account,status,created_at"),
    supabaseClient.from("demo_balance_requests").select("id,user_id,amount_rs,status,created_at"),
    supabaseClient.from("balance_history").select("id,user_id,description,amount_rs,created_at"),
    supabaseClient.from("daily_task_payouts").select("user_id,plan_started_at,plan_activation_id,day_number"),
    supabaseClient.from("settings").select("follow_rs,like_rs,comment_rs,referral_percent").eq("id", 1).maybeSingle(),
    supabaseClient.from("plan_catalog").select("*").order("price_rs"),
    supabaseClient.rpc("admin_exists")
  ]);
  const failed = [profiles, activations, tasks, submissions, withdrawals, deposits, history, payouts, settings, plans, adminStatus].find(result => result.error);
  if (failed?.error) throw failed.error;

  remoteCache.users = profiles.data.map(mapSupabaseProfile);
  remoteCache.planActivations = activations.data.map(row => ({
    id: row.id, userId: row.user_id, planId: row.plan_id,
    startedAt: row.started_at, expiresAt: row.expires_at
  }));
  remoteCache.users.forEach(user => {
    user.planActivations = remoteCache.planActivations.filter(activation => activation.userId === user.id);
  });
  remoteCache.adminExists = adminStatus.data;
  if (plans.data.length) {
    PLANS = plans.data.map(plan => ({
      id: plan.id, amount: Number(plan.price_rs),
      dailyReward: Number(plan.daily_reward_rs), days: plan.duration_days,
      totalReward: plan.total_reward_rs == null ? undefined : Number(plan.total_reward_rs)
    }));
  }
  ALL_TASKS = tasks.data.map(task => ({
    id: task.id, day: task.day_number,
    channel: TASK_PROFILE.name,
    platform: TASK_PROFILE.platform,
    url: TASK_PROFILE.url,
    action: task.action, reward: Number(task.reward_rs)
  }));
  const taskById = new Map(ALL_TASKS.map(task => [task.id, task]));
  const userById = new Map(remoteCache.users.map(user => [user.id, user]));
  remoteCache.submissions = submissions.data.map(row => {
    const task = taskById.get(row.task_id) || {};
    return {
      id: row.id, userId: row.user_id, userName: userById.get(row.user_id)?.name || "User",
      taskId: row.task_id, day: task.day, platform: task.platform, channel: task.channel,
      action: task.action, reward: Number(row.reward_rs), status: row.status, createdAt: row.created_at
    };
  });
  remoteCache.withdrawals = withdrawals.data.map(row => ({
    id: row.id, userId: row.user_id, userName: userById.get(row.user_id)?.name || "User",
    amount: Number(row.amount_rs), phone: row.phone, bank: row.bank_account,
    status: row.status, createdAt: row.created_at
  }));
  remoteCache.depositRequests = deposits.data.map(row => ({
    id: row.id, userId: row.user_id, userName: userById.get(row.user_id)?.name || "User",
    amount: Number(row.amount_rs), status: row.status, createdAt: row.created_at
  }));
  remoteCache.history = history.data.map(row => ({
    id: row.id, userId: row.user_id, text: row.description,
    amount: Number(row.amount_rs), createdAt: row.created_at
  }));
  remoteCache.dailyTaskPayouts = payouts.data.map(row =>
    [row.user_id, row.plan_activation_id || row.plan_started_at, row.day_number].join(":")
  );
  if (settings.data) {
    remoteCache.settings = {
      rewards: { Follow: Number(settings.data.follow_rs), Like: Number(settings.data.like_rs), Comment: Number(settings.data.comment_rs) },
      referralPercent: Number(settings.data.referral_percent)
    };
  }
  currentUser = remoteCache.users.find(user => user.id === currentUser.id) || currentUser;
  sessionStorage.setItem("ame_session", JSON.stringify(currentUser));
  updateStats();
}

/* ---------- 5. LOCAL STORAGE (demo mode) ----------
   Keys are prefixed "ame_" so they do not clash with other sites.
   WARNING: localStorage lives in ONE browser only. Two phones do
   NOT share it. That is why Supabase is needed for real users.
   Passwords here are hashed with a tiny demo hash — NEVER use
   this in production. In Supabase mode, Supabase Auth handles
   passwords securely and we do not store them at all. */
const store = {
  get(key, fallback) {
    if (useSupabase && remoteCacheKeys.has(key)) return remoteCache[key] ?? fallback;
    try { return JSON.parse(localStorage.getItem("ame_" + key)) ?? fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    if (useSupabase && remoteCacheKeys.has(key)) { remoteCache[key] = value; return; }
    localStorage.setItem("ame_" + key, JSON.stringify(value));
  }
};
// Tiny demo hash — for learning only, not real security.
function demoHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return "h" + h; }
function makeReferralCode(name) {
  const clean = (name || "USER").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "USER";
  return "AME-" + clean + Math.floor(100 + Math.random() * 900);
}

// Current logged-in user (kept in memory + sessionStorage).
let currentUser = JSON.parse(sessionStorage.getItem("ame_session") || "null");
let taskUnlockTimer = null;

/* ---------- 6. HELPERS ---------- */
function rs(n) { return "Rs " + Number(n || 0).toLocaleString("en-PK"); }
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function getUsers() { return store.get("users", []); }
function saveUsers(u) { store.set("users", u); }
function getSubmissions() { return store.get("submissions", []); }
function saveSubmissions(s) { store.set("submissions", s); }
function getWithdrawals() { return store.get("withdrawals", []); }
function saveWithdrawals(w) { store.set("withdrawals", w); }
function getDepositRequests() { return store.get("depositRequests", []); }
function saveDepositRequests(requests) { store.set("depositRequests", requests); }
function getHistory() { return store.get("history", []); }
function saveHistory(h) { store.set("history", h); }
function getSettings() {
  // Settings live in localStorage in demo mode. In Supabase mode
  // they come from the `settings` table — see supabase.sql.
  return store.get("settings", { rewards: CONFIG.REWARDS, referralPercent: CONFIG.REFERRAL_PERCENT });
}
function saveSettingsLocal(s) { store.set("settings", s); }

/* ---------- 7. VIEWS — show one section, hide the rest ---------- */
async function showView(name) {
  if (name !== "tasks" && taskUnlockTimer !== null) {
    clearTimeout(taskUnlockTimer);
    taskUnlockTimer = null;
  }
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  const el = $("view-" + name);
  if (el) el.style.display = "block";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  let refreshError = null;
  if (useSupabase && currentUser) {
    try { await refreshSupabaseData(); }
    catch (error) {
      refreshError = error;
      const message = $("adminMsg");
      if (message) message.textContent = "Could not refresh shared data: " + error.message;
      console.error("Could not refresh Supabase app data:", error);
    }
  }
  if (name === "tasks") renderTasks();
  if (name === "plans") renderPlans();
  if (name === "wallet") renderWallet();
  if (name === "referrals") renderReferrals();
  if (name === "deposit") renderDeposit();
  if (name === "withdraw") renderWithdraw();
  if (name === "admin") renderAdmin();
  if (name === "admin" && currentUser?.isAdmin && refreshError) {
    $("adminMsg").textContent = "Could not refresh shared data: " + refreshError.message;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- 8. AUTH — sign up / login / logout ----------
   CONDITION: email must be new on sign-up, and must exist on login.
   CONDITION: if a referral code is given, it must match an existing
   user's code, otherwise sign-up is refused with a clear message. */
async function handleSignup() {
  const name = $("signupName").value.trim();
  const email = $("signupEmail").value.trim().toLowerCase();
  const password = $("signupPassword").value;
  const refCode = $("signupReferral").value.trim().toUpperCase();
  const msg = $("signupMsg");

  if (!name || !email || !password) { msg.textContent = "Please fill in name, email and password."; return; }

  // --- Supabase mode: use Supabase Auth (secure passwords) ---
  if (useSupabase) {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password, options: { data: { full_name: name, referral_code: refCode || null } }
    });
    if (error) { msg.textContent = error.message; return; }
    msg.textContent = "Account created. Please check your email if asked, then login.";
    showView("login");
    return;
  }

  // --- Local demo mode ---
  const users = getUsers();
  if (users.find(u => u.email === email)) { msg.textContent = "An account with this email already exists. Try login."; return; }

  let referredBy = null;
  if (refCode) {
    const referrer = users.find(u => u.referralCode === refCode);
    if (!referrer) { msg.textContent = "That referral code does not exist. Check it or leave it blank."; return; }
    referredBy = referrer.id;
  }

  const user = {
    id: "U" + Date.now(),
    name, email,
    passwordHash: demoHash(password), // demo only — see warning above
    referralCode: makeReferralCode(name),
    referredBy: referredBy,
    planRequestId: null, activePlanId: null, planStartedAt: null, planExpiresAt: null,
    planActivations: [],
    isAdmin: false,
    balance: 0, taskEarnings: 0, referralEarnings: 0, totalWithdrawn: 0,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  saveUsers(users);
  loginAs(user);
  msg.textContent = "Welcome, " + name + "! Your referral code is " + user.referralCode;
}

async function handleLogin() {
  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;
  const msg = $("loginMsg");

  if (useSupabase) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { msg.textContent = error.message; return; }
    currentUser = { id: data.user.id };
    try {
      await refreshSupabaseData();
      loginAs(currentUser);
    } catch (loadError) {
      msg.textContent = "Signed in, but profile data could not be loaded: " + loadError.message;
    }
    return;
  }

  const user = getUsers().find(u => u.email === email);
  if (!user || user.passwordHash !== demoHash(password)) {
    msg.textContent = "Wrong email or password.";
    return;
  }
  loginAs(user);
}

function loginAs(user) {
  currentUser = user;
  sessionStorage.setItem("ame_session", JSON.stringify(user));
  refreshAuthUI();
  showView("plans");
}

function logout() {
  currentUser = null;
  sessionStorage.removeItem("ame_session");
  if (useSupabase) supabaseClient.auth.signOut();
  refreshAuthUI();
  showView("home");
}

function refreshAuthUI() {
  const loggedIn = !!currentUser;
  $("loginBtn").style.display = loggedIn ? "none" : "";
  $("signupBtn").style.display = loggedIn ? "none" : "";
  $("logoutBtn").style.display = loggedIn ? "" : "none";
  $("helloUser").textContent = loggedIn ? ("Hi, " + currentUser.name) : "";
  $("headerBalance").style.display = loggedIn ? "" : "none";
  // In local demo mode, let the first user reach the claim-admin screen.
  const canClaimFirstAdmin = loggedIn && (useSupabase
    ? remoteCache.adminExists === false
    : !getUsers().some(user => user.isAdmin));
  $("adminNavBtn").style.display = (loggedIn && (currentUser.isAdmin || canClaimFirstAdmin)) ? "" : "none";
  if (loggedIn) updateStats();
}

function updateStats() {
  if (!currentUser) return;
  const fresh = getUsers().find(u => u.id === currentUser.id) || currentUser;
  currentUser = fresh;
  const approved = getSubmissions().filter(s => s.userId === fresh.id && s.status === "approved").length;
  if ($("headerBalanceAmount")) $("headerBalanceAmount").textContent = rs(fresh.balance);
  if ($("statBalance")) $("statBalance").textContent = rs(fresh.balance);
  if ($("statTaskEarnings")) $("statTaskEarnings").textContent = rs(fresh.taskEarnings);
  if ($("statRefEarnings")) $("statRefEarnings").textContent = rs(fresh.referralEarnings);
  if ($("statApproved")) $("statApproved").textContent = approved;
}

/* ---------- 9. TASKS ----------
   CONDITION: you must be logged in to submit.
   CONDITION: one submission per task per user. Pressing "Mark done"
   twice does NOT pay twice — the second press is blocked.
   Marking a task done approves it immediately. */
function renderTasks() {
  const workspace = $("taskWorkspace");
  const notice = $("taskAccessNotice");
  const activePlans = getActivePlans(currentUser);
  if (!activePlans.length) {
    workspace.style.display = "none";
    notice.style.display = "block";
    notice.innerHTML = currentUser
      ? "<p>Choose an 80-day plan. Each plan activates when your simulated balance covers its price.</p><button class='btn btn-primary' onclick=\"showView('plans')\">View plans</button>"
      : "<p>Log in and get an active plan to access tasks.</p><button class='btn btn-primary' onclick=\"showView('login')\">Login</button>";
    return;
  }
  notice.style.display = "none";
  workspace.style.display = "block";
  const taskDays = getTaskScheduleDays(currentUser);
  const unlockedDay = getUnlockedTaskDay(currentUser);

  const sel = $("daySelect");
  if (sel.options.length !== taskDays) {
    sel.innerHTML = "";
    for (let d = 1; d <= taskDays; d++) {
      const o = document.createElement("option");
      o.value = d; o.textContent = "Day " + d;
      sel.appendChild(o);
    }
  }
  Array.from(sel.options).forEach(option => {
    const optionDay = Number(option.value);
    option.disabled = optionDay > unlockedDay;
    option.textContent = option.disabled ? "Day " + optionDay + " (Locked)" : "Day " + optionDay;
  });
  const selectedDay = Number(sel.value || 1);
  const day = selectedDay <= unlockedDay ? selectedDay : unlockedDay;
  sel.value = String(day);

  const unlockNotice = $("taskUnlockNotice");
  if (unlockedDay < taskDays) {
    const nextUnlockAt = getTaskStartTime(currentUser) + unlockedDay * DAY_MS;
    unlockNotice.textContent = "Day " + (unlockedDay + 1) + " unlocks at " + new Date(nextUnlockAt).toLocaleString() + ".";
    clearTimeout(taskUnlockTimer);
    const userId = currentUser.id;
    taskUnlockTimer = setTimeout(() => {
      taskUnlockTimer = null;
      if (currentUser?.id === userId && $("view-tasks").style.display !== "none") renderTasks();
    }, Math.max(nextUnlockAt - Date.now() + 50, 0));
  } else {
    unlockNotice.textContent = "All task days are unlocked.";
    clearTimeout(taskUnlockTimer);
    taskUnlockTimer = null;
  }

  const settings = getSettings();
  const list = $("taskList");
  const subs = getSubmissions();
  list.innerHTML = "";

  ALL_TASKS.filter(t => t.day === day).forEach(task => {
    // Use the CURRENT admin reward for this action, not a stale copy.
    const reward = settings.rewards[task.action] ?? task.reward;
    const sub = currentUser ? subs.find(s => s.userId === currentUser.id && s.taskId === task.id) : null;

    const div = document.createElement("div");
    div.className = "task-card";
    const dailyReward = getActiveDailyReward(activePlans);
    div.innerHTML =
      "<div class='task-card-content'>" +
        "<p class='task-platform'>" + esc(task.platform) + "</p>" +
        "<h3>" + esc(task.action) + " <span>— " + esc(task.channel) + "</span></h3>" +
        "<p class='task-details'>Day " + task.day + " • " + (dailyReward
          ? "Part of <span class='reward'>" + rs(dailyReward) + " combined daily simulation reward</span>; mark all 3 tasks done to earn"
          : "<span class='reward'>" + rs(reward) + "</span> when marked done") + "</p>" +
      "</div>" +
      "<div class='task-card-actions'>" +
        "<a class='btn btn-outline btn-small' href='" + task.url + "' target='_blank' rel='noopener'>Open TikTok</a> " +
        (sub
          ? "<span class='badge " + sub.status + "'>" + sub.status.toUpperCase() + "</span>"
          : "<button class='btn btn-primary btn-small' onclick=\"submitTask('" + task.id + "')\">Mark done</button>") +
      "</div>";
    list.appendChild(div);
  });
  updateStats();
}

async function submitTask(taskId) {
  if (!currentUser) { $("tasksMsg").textContent = "Please login first."; showView("login"); return; }
  const activePlans = getActivePlans(currentUser);
  if (!activePlans.length) {
    $("tasksMsg").textContent = "An active plan is required to submit tasks.";
    showView("plans");
    return;
  }
  const task = ALL_TASKS.find(t => t.id === taskId);
  if (!task) return;
  if (task.day > getUnlockedTaskDay(currentUser)) {
    $("tasksMsg").textContent = "Day " + task.day + " is locked. New task days unlock every 24 hours after your first plan starts.";
    return;
  }
  const subs = getSubmissions();
  if (subs.find(s => s.userId === currentUser.id && s.taskId === taskId)) {
    $("tasksMsg").textContent = "You already submitted this task.";
    return;
  }
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("submit_task", { p_task_id: task.id });
    if (error) { $("tasksMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); }
    catch (loadError) { $("tasksMsg").textContent = "Task approved, but refresh failed: " + loadError.message; return; }
    $("tasksMsg").textContent = "Task marked done and approved automatically.";
    renderTasks();
    return;
  }
  const settings = getSettings();
  const sub = {
    id: "S" + Date.now(), userId: currentUser.id, userName: currentUser.name,
    taskId: task.id, day: task.day, platform: task.platform, channel: task.channel,
    action: task.action, reward: getActiveDailyReward(activePlans) ? 0 : (settings.rewards[task.action] ?? task.reward),
    status: "pending", createdAt: new Date().toISOString()
  };
  subs.push(sub);
  saveSubmissions(subs);
  await approveTask(sub.id);
  $("tasksMsg").textContent = "Task marked done and approved automatically.";
  renderTasks();
}

function getPlanActivations(user) {
  if (Array.isArray(user?.planActivations) && user.planActivations.length) return user.planActivations;
  if (!user?.activePlanId || !user.planExpiresAt) return [];
  const plan = findPlan(user.activePlanId);
  if (!plan) return [];
  const startedAt = user.planStartedAt || new Date(Date.parse(user.planExpiresAt) - plan.days * DAY_MS).toISOString();
  return [{ id: startedAt, planId: plan.id, startedAt, expiresAt: user.planExpiresAt }];
}

function getActivePlans(user) {
  const now = Date.now();
  return getPlanActivations(user).filter(activation =>
    Date.parse(activation.startedAt) <= now && Date.parse(activation.expiresAt) > now
  ).map(activation => {
    const plan = findPlan(activation.planId);
    return plan ? { ...plan, activation } : null;
  }).filter(Boolean);
}

function getActiveDailyReward(activePlans) {
  return activePlans.reduce((total, plan) => total + Number(plan.dailyReward || 0), 0);
}

function getTaskStartTime(user) {
  const startTimes = getPlanActivations(user).map(activation => Date.parse(activation.startedAt)).filter(Number.isFinite);
  if (startTimes.length) return Math.min(...startTimes);
  const startedAt = Date.parse(user?.planStartedAt || "");
  if (Number.isFinite(startedAt)) return startedAt;
  const plan = findPlan(user?.activePlanId);
  const expiresAt = Date.parse(user?.planExpiresAt || "");
  return plan && Number.isFinite(expiresAt) ? expiresAt - plan.days * DAY_MS : Date.now();
}

function getTaskScheduleDays(user) {
  const durations = getPlanActivations(user).map(activation => findPlan(activation.planId)?.days || 0);
  const fallback = findPlan(user?.activePlanId)?.days || 0;
  return Math.max(...durations, fallback) || CONFIG.DAYS;
}

function getUnlockedTaskDay(user) {
  if (!getActivePlans(user).length) return 0;
  const elapsed = Math.max(0, Date.now() - getTaskStartTime(user));
  return Math.min(getTaskScheduleDays(user), Math.floor(elapsed / DAY_MS) + 1);
}

function activateRequestedPlan(user) {
  const plan = findPlan(user?.planRequestId);
  if (!user || !plan || Number(user.balance) < plan.amount) return false;

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  user.balance -= plan.amount;
  if (!Array.isArray(user.planActivations)) user.planActivations = getPlanActivations(user);
  user.planActivations.push({
    id: "A" + startedAt + "-" + Math.random().toString(36).slice(2, 8),
    planId: plan.id,
    startedAt: startedAtIso,
    expiresAt: new Date(startedAt + plan.days * DAY_MS).toISOString()
  });
  user.activePlanId = plan.id;
  user.planStartedAt = startedAtIso;
  user.planExpiresAt = new Date(startedAt + plan.days * DAY_MS).toISOString();
  user.planRequestId = null;

  const history = getHistory();
  history.push({ userId: user.id, text: "Plan activated automatically: " + rs(plan.amount) + " simulation balance used", amount: -plan.amount });
  saveHistory(history);

  if (currentUser?.id === user.id) {
    currentUser = user;
    sessionStorage.setItem("ame_session", JSON.stringify(user));
  }
  return true;
}

function renderPlans() {
  const users = getUsers();
  const planUser = users.find(user => user.id === currentUser?.id) || currentUser;
  if (!useSupabase && planUser?.planRequestId && activateRequestedPlan(planUser)) saveUsers(users);
  if (currentUser && planUser) {
    currentUser = planUser;
    sessionStorage.setItem("ame_session", JSON.stringify(planUser));
  }
  const activePlans = getActivePlans(currentUser);
  const requestedPlan = findPlan(currentUser?.planRequestId);
  const totalDailyReward = getActiveDailyReward(activePlans);
  const activeText = activePlans.length
    ? "Active plans: " + activePlans.map(plan =>
      rs(plan.amount) + " (" + Math.ceil((Date.parse(plan.activation.expiresAt) - Date.now()) / DAY_MS) +
        " days left; until " + new Date(plan.activation.expiresAt).toLocaleDateString() + ")"
    ).join("; ") + (totalDailyReward ? ". Combined daily simulation reward: " + rs(totalDailyReward) : "")
    : "";
  $("plansStatus").textContent = activeText
    ? activeText + (requestedPlan ? " • Selected: " + rs(requestedPlan.amount) + " awaiting sufficient balance." : "")
    : requestedPlan
      ? "Selected: " + rs(requestedPlan.amount) + ". It activates automatically when your balance reaches " + rs(requestedPlan.amount) + "."
      : "Choose one or more plans. Each activates when your balance covers its price and has its own 80-day period.";
  $("plansList").innerHTML = PLANS.map(plan =>
    {
      const selected = currentUser?.planRequestId === plan.id;
      const disabled = !currentUser || (!!requestedPlan && !selected);
      const buttonText = selected ? "Selected" : requestedPlan ? "Another plan selected" : "Choose plan";
      const totalSimulatedReward = Number(plan.totalReward ?? (Number(plan.dailyReward) * Number(plan.days)));
      return "<article class='plan-card'><h3>" + rs(plan.amount) + " activity</h3>" +
        "<p class='plan-duration'>" + plan.days + " days</p>" +
        "<p class='plan-daily-reward'>Rs " + Number(plan.dailyReward).toLocaleString("en-PK") + " simulated daily reward</p>" +
        "<p class='plan-total-reward'>Total simulated rewards: " + rs(totalSimulatedReward) + "</p>" +
        "<button class='btn btn-primary' " + (disabled ? "disabled" : "onclick=\"requestPlan('" + plan.id + "')\"") + ">" + buttonText + "</button></article>";
    }
  ).join("");
  $("plansMsg").textContent = currentUser
    ? requestedPlan
      ? "Selected plan price: " + rs(requestedPlan.amount) + ". Current balance: " + rs(currentUser.balance) + ". The price is deducted when the plan activates."
      : "The plan price is deducted from your fictional balance when it activates. No real money is paid."
    : "Log in to choose a plan. All balances and plan prices are fictional school-project values.";
}

function requestPlan(planId) {
  if (!currentUser) { showView("login"); return; }
  if (!PLANS.some(plan => plan.id === planId) || currentUser.planRequestId) return;
  if (useSupabase) {
    supabaseClient.rpc("select_plan", { p_plan_id: planId }).then(async ({ error }) => {
      if (error) { $("plansMsg").textContent = error.message; return; }
      try {
        await refreshSupabaseData();
        const selected = findPlan(currentUser.planRequestId);
        $("plansMsg").textContent = !currentUser.planRequestId
          ? "Plan activated automatically; the fictional plan price was deducted."
          : "Plan selected. It will activate when your balance reaches " + rs(selected?.amount) + ".";
        renderPlans();
      } catch (loadError) {
        $("plansMsg").textContent = "Plan saved, but refresh failed: " + loadError.message;
      }
    });
    return;
  }
  const users = getUsers();
  const user = users.find(item => item.id === currentUser.id);
  if (!user) return;
  user.planRequestId = planId;
  const activated = activateRequestedPlan(user);
  saveUsers(users);
  currentUser = user;
  sessionStorage.setItem("ame_session", JSON.stringify(user));
  $("plansMsg").textContent = activated
    ? "Plan activated automatically. Its fictional price was deducted from your balance."
    : "Plan selected. It will activate automatically when your balance reaches " + rs(findPlan(planId).amount) + ".";
  renderPlans();
  updateStats();
}

/* ---------- 10. WALLET ---------- */
function renderWallet() {
  if (!currentUser) { showView("login"); return; }
  const u = getUsers().find(x => x.id === currentUser.id) || currentUser;
  $("walletBalance").textContent = rs(u.balance);
  $("walletTotal").textContent = rs(u.taskEarnings + u.referralEarnings);
  $("walletWithdrawn").textContent = rs(u.totalWithdrawn);
  const history = getHistory().filter(h => h.userId === u.id).slice().reverse();
  $("walletHistory").innerHTML = history.length
    ? history.map(h => "<li><span>" + esc(h.text) + "</span><strong>" + rs(h.amount) + "</strong></li>").join("")
    : "<li>No earnings yet. Mark a task done to start earning.</li>";
}

/* ---------- 11. REFERRALS ----------
   CONDITION: referral is paid ONLY when the referred friend's
   task is APPROVED (see approveTask in section 12). The referrer
   gets REFERRAL_PERCENT of that task reward — e.g. 5% of Rs 10 = Rs 0.50. */
function renderReferrals() {
  if (!currentUser) { showView("login"); return; }
  if (useSupabase) {
    supabaseClient.rpc("get_my_referred_friends").then(({ data, error }) => {
      if (error) { $("refList").innerHTML = "<li>Could not load referrals: " + esc(error.message) + "</li>"; return; }
      $("refCount").textContent = data.length;
      $("refList").innerHTML = data.length
        ? data.map(friend => "<li><span>" + esc(friend.full_name) + " (" + esc(friend.email) + ")</span><span>Task earnings: " + rs(friend.task_earnings_rs) + "</span></li>").join("")
        : "<li>No friends joined with your code yet.</li>";
    });
    const user = getUsers().find(item => item.id === currentUser.id) || currentUser;
    $("myReferralCode").value = user.referralCode || "";
    $("myReferralLink").value = user.referralCode ? makeReferralLink(user.referralCode) : "";
    $("refEarnings").textContent = rs(user.referralEarnings);
    return;
  }
  const u = getUsers().find(x => x.id === currentUser.id) || currentUser;
  $("myReferralCode").value = u.referralCode || "";
  $("myReferralLink").value = u.referralCode ? makeReferralLink(u.referralCode) : "";
  const friends = getUsers().filter(x => x.referredBy === u.id);
  $("refCount").textContent = friends.length;
  $("refEarnings").textContent = rs(u.referralEarnings);
  $("refList").innerHTML = friends.length
    ? friends.map(f => "<li><span>" + esc(f.name) + " (" + esc(f.email) + ")</span><span>Task earnings: " + rs(f.taskEarnings) + "</span></li>").join("")
    : "<li>No friends joined with your code yet.</li>";
}
function makeReferralLink(code) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("ref", code);
  return url.toString();
}
async function copyReferralValue(inputId, label) {
  const input = $(inputId);
  input.focus();
  input.select();
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(input.value);
      alert(label + " copied.");
      return;
    } catch (error) {
      console.error("Clipboard access failed; trying the browser copy fallback:", error);
    }
  }
  if (!document.execCommand("copy")) {
    alert("Could not copy " + label.toLowerCase() + ". Please copy it manually.");
    return;
  }
  alert(label + " copied.");
}
function copyReferral() {
  copyReferralValue("myReferralCode", "Referral code");
}
function copyReferralLink() {
  copyReferralValue("myReferralLink", "Referral link");
}

async function copyDepositAccountNumber() {
  const accountNumber = $("depositAccountNumber").textContent.trim();
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(accountNumber);
      alert("Account number copied.");
      return;
    } catch (error) {
      console.error("Clipboard access failed; trying the browser copy fallback:", error);
    }
  }
  const input = document.createElement("textarea");
  input.value = accountNumber;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) {
    alert("Could not copy account number. Please copy it manually.");
    return;
  }
  alert("Account number copied.");
}

/* ---------- DEMO DEPOSITS ---------- */
function renderDeposit() {
  if (!currentUser) { showView("login"); return; }
  const user = getUsers().find(item => item.id === currentUser.id) || currentUser;
  $("depositBalance").textContent = rs(user.balance);
  const requests = getDepositRequests().filter(request => request.userId === user.id).slice().reverse();
  $("depositList").innerHTML = requests.length
    ? requests.map(request => "<li><span>" + rs(request.amount) + " • " + new Date(request.createdAt).toLocaleString() + "</span><span class='badge " + request.status + "'>" + request.status.toUpperCase() + "</span></li>").join("")
    : "<li>No demo balance requests yet.</li>";
}

async function requestDemoDeposit() {
  if (!currentUser) { showView("login"); return; }
  const amount = Number($("depositAmount").value);
  const message = $("depositMsg");
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    message.textContent = "Enter a whole-number demo amount greater than Rs 0.";
    return;
  }
  const requests = getDepositRequests();
  if (requests.some(request => request.userId === currentUser.id && request.status === "pending")) {
    message.textContent = "You already have a pending balance request.";
    return;
  }
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("request_demo_balance", { p_amount: amount });
    if (error) { message.textContent = error.message; return; }
    $("depositAmount").value = "";
    message.textContent = "Balance request sent to the admin for review.";
    try { await refreshSupabaseData(); renderDeposit(); }
    catch (loadError) { message.textContent = "Request sent, but refresh failed: " + loadError.message; }
    return;
  }
  requests.push({
    id: "D" + Date.now(), userId: currentUser.id, userName: currentUser.name,
    amount, status: "pending", createdAt: new Date().toISOString()
  });
  saveDepositRequests(requests);
  $("depositAmount").value = "";
  message.textContent = "Demo balance request sent to the admin for review.";
  renderDeposit();
}

async function approveDemoDeposit(requestId) {
  if (!currentUser?.isAdmin) return;
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_demo_balance", { p_request_id: requestId, p_approve: true });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); }
    catch (loadError) { $("adminMsg").textContent = "Request approved, but refresh failed: " + loadError.message; }
    return;
  }
  const requests = getDepositRequests();
  const request = requests.find(item => item.id === requestId && item.status === "pending");
  const users = getUsers();
  const user = users.find(item => item.id === request?.userId);
  if (!request || !user) return;
  request.status = "approved";
  user.balance = Number(user.balance || 0) + request.amount;
  const history = getHistory();
  history.push({ userId: user.id, text: "Demo balance request approved", amount: request.amount });
  saveHistory(history);
  activateRequestedPlan(user);
  saveUsers(users);
  saveDepositRequests(requests);
  renderAdmin();
  updateStats();
  if (currentUser.id === user.id) renderDeposit();
}

async function rejectDemoDeposit(requestId) {
  if (!currentUser?.isAdmin) return;
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_demo_balance", { p_request_id: requestId, p_approve: false });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); }
    catch (loadError) { $("adminMsg").textContent = "Request rejected, but refresh failed: " + loadError.message; }
    return;
  }
  const requests = getDepositRequests();
  const request = requests.find(item => item.id === requestId && item.status === "pending");
  if (!request) return;
  request.status = "rejected";
  saveDepositRequests(requests);
  renderAdmin();
  if (currentUser.id === request.userId) renderDeposit();
}

/* ---------- 12. WITHDRAW ----------
   CONDITION: no minimum — any amount above Rs 0 is allowed.
   CONDITION: amount must be <= current balance.
   On request, the amount is TAKEN OUT of the balance right away
   (so it cannot be requested twice) and held as "pending".
   If admin rejects it, the money is REFUNDED (see rejectWithdrawal). */
function renderWithdraw() {
  if (!currentUser) { showView("login"); return; }
  const u = getUsers().find(x => x.id === currentUser.id) || currentUser;
  $("withdrawBalance").textContent = rs(u.balance);
  const list = getWithdrawals().filter(w => w.userId === u.id).slice().reverse();
  $("withdrawList").innerHTML = list.length
    ? list.map(w => "<li><span>" + rs(w.amount) + " • " + esc(w.phone) + " • " + esc(w.bank) + "</span><span class='badge " + w.status + "'>" + w.status.toUpperCase() + "</span></li>").join("")
    : "<li>No withdrawal requests yet.</li>";
}

async function handleWithdraw() {
  if (!currentUser) { showView("login"); return; }
  const amount = Number($("withdrawAmount").value);
  const phone = $("withdrawPhone").value.trim();
  const bank = $("withdrawBank").value.trim();
  const msg = $("withdrawMsg");

  // No minimum — but the amount must be a real, positive number.
  if (!amount || amount <= 0) { msg.textContent = "Enter an amount above Rs 0."; return; }
  if (!phone || !bank) { msg.textContent = "Please add your phone number and bank account."; return; }

  if (useSupabase) {
    const { error } = await supabaseClient.rpc("request_withdrawal", {
      p_amount: amount, p_phone: phone, p_bank_account: bank
    });
    if (error) { msg.textContent = error.message; return; }
    msg.textContent = "Simulation withdrawal request sent.";
    try { await refreshSupabaseData(); renderWithdraw(); updateStats(); }
    catch (loadError) { msg.textContent = "Request sent, but refresh failed: " + loadError.message; }
    return;
  }

  const users = getUsers();
  const u = users.find(x => x.id === currentUser.id);
  if (!u) return;
  if (amount > u.balance) { msg.textContent = "Amount is more than your balance (" + rs(u.balance) + ")."; return; }

  // Hold the money: take it out of the balance now, refund on rejection.
  u.balance -= amount;
  saveUsers(users);
  const w = {
    id: "W" + Date.now(), userId: u.id, userName: u.name,
    amount, phone, bank, status: "pending", createdAt: new Date().toISOString()
  };
  const all = getWithdrawals(); all.push(w); saveWithdrawals(all);
  msg.textContent = "Request sent. An admin will send the money manually and mark it paid.";
  renderWithdraw(); updateStats();
}

/* ---------- 13. ADMIN ----------
   RULE: the FIRST user can claim admin only if no admin exists yet.
   After that, only an existing admin can promote someone else.
   This stops a stranger from making themselves admin later. */
async function refreshAdminRequests() {
  const button = $("refreshAdminRequestsBtn");
  button.disabled = true;
  button.textContent = "Refreshing...";
  try {
    if (useSupabase) await refreshSupabaseData();
    renderAdmin();
    if (currentUser?.isAdmin) $("adminMsg").textContent = "Pending approvals refreshed.";
  } catch (error) {
    $("adminMsg").textContent = "Could not refresh pending approvals: " + error.message;
    console.error("Could not refresh admin approvals:", error);
  } finally {
    button.disabled = false;
    button.textContent = "Refresh pending approvals";
  }
}

function renderAdmin() {
  if (!currentUser) { showView("login"); return; }
  const users = getUsers();
  const anyAdmin = users.some(u => u.isAdmin);
  $("claimAdminBox").style.display = (!anyAdmin) ? "block" : "none";
  $("adminContent").style.display = (currentUser.isAdmin) ? "block" : "none";
  if (!currentUser.isAdmin) {
    $("adminMsg").textContent = anyAdmin ? "You are not an admin. Ask an admin to promote you." : "No admin exists yet — claim admin access above if you are the owner.";
    return;
  }
  $("adminMsg").textContent = "";
  const settings = getSettings();
  $("setFollow").value = settings.rewards.Follow;
  $("setLike").value = settings.rewards.Like;
  $("setComment").value = settings.rewards.Comment;
  $("setReferral").value = settings.referralPercent;

  const pendingTasks = getSubmissions().filter(s => s.status === "pending");
  $("adminTasks").innerHTML = pendingTasks.length
    ? pendingTasks.map(s => {
      const taskUser = users.find(user => user.id === s.userId);
      const combinedReward = getActiveDailyReward(getActivePlans(taskUser));
      const rewardLabel = combinedReward
        ? "part of " + rs(combinedReward) + " combined daily simulation reward"
        : rs(s.reward);
      return "<li><span>" + esc(s.userName) + " • Day " + s.day + " • " + s.action + " " + esc(s.channel) + " • " + rewardLabel + "</span><span><button class='btn btn-primary btn-small' onclick=\"approveTask('" + s.id + "')\">Approve</button> <button class='btn btn-outline btn-small' onclick=\"rejectTask('" + s.id + "')\">Reject</button></span></li>";
    }).join("")
    : "<li>No pending tasks.</li>";

  const pendingDeposits = getDepositRequests().filter(request => request.status === "pending");
  $("adminDeposits").innerHTML = pendingDeposits.length
    ? pendingDeposits.map(request => "<li><span>" + esc(request.userName) + " • " + rs(request.amount) + " demo balance • " + new Date(request.createdAt).toLocaleString() + "</span><span><button class='btn btn-primary btn-small' onclick=\"approveDemoDeposit('" + request.id + "')\">Accept</button> <button class='btn btn-outline btn-small' onclick=\"rejectDemoDeposit('" + request.id + "')\">Reject</button></span></li>").join("")
    : "<li>No pending demo balance requests.</li>";

  const pendingW = getWithdrawals().filter(w => w.status === "pending");
  $("adminWithdrawals").innerHTML = pendingW.length
    ? pendingW.map(w => "<li><span>" + esc(w.userName) + " • " + rs(w.amount) + " • " + esc(w.phone) + " • " + esc(w.bank) + "</span><span><button class='btn btn-primary btn-small' onclick=\"payWithdrawal('" + w.id + "')\">Mark paid</button> <button class='btn btn-outline btn-small' onclick=\"rejectWithdrawal('" + w.id + "')\">Reject + refund</button></span></li>").join("")
    : "<li>No pending withdrawals.</li>";

  $("adminUsers").innerHTML = users.map(u => {
    const activePlans = getActivePlans(u);
    const requestedPlan = findPlan(u.planRequestId);
    const activeStatus = activePlans.length
      ? "<span class='badge approved'>" + activePlans.length + " PLAN(S) ACTIVE • " + rs(getActiveDailyReward(activePlans)) + "/DAY</span>"
      : "<span class='badge'>NO ACTIVE PLAN</span>";
    const planStatus = activeStatus + (requestedPlan
      ? " <span class='badge'>WAITING FOR " + rs(requestedPlan.amount) + " BALANCE</span>"
      : "");
    return "<li><span>" + esc(u.name) + " (" + esc(u.email) + ") • Balance " + rs(u.balance) + " • Referred " + getUsers().filter(x => x.referredBy === u.id).length + "</span>" +
      "<span>" + planStatus + " " + (u.isAdmin ? "<span class='badge approved'>ADMIN</span>" : "<button class='btn btn-outline btn-small' onclick=\"promoteUser('" + u.id + "')\">Make admin</button>") + "</span></li>";
  }).join("");
}

async function claimAdmin() {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("claim_first_admin");
    if (error) { $("adminMsg").textContent = error.message; return; }
    await refreshSupabaseData();
    refreshAuthUI();
    renderAdmin();
    return;
  }
  const users = getUsers();
  if (users.some(u => u.isAdmin)) { alert("An admin already exists."); return; }
  const me = users.find(u => u.id === currentUser.id);
  if (!me) return;
  me.isAdmin = true;
  saveUsers(users);
  currentUser = me;
  sessionStorage.setItem("ame_session", JSON.stringify(me));
  refreshAuthUI();
  renderAdmin();
}

async function promoteUser(userId) {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("promote_user", { p_user_id: userId });
    if (error) { $("adminMsg").textContent = error.message; return; }
    await refreshSupabaseData();
    renderAdmin();
    return;
  }
  const users = getUsers();
  const u = users.find(x => x.id === userId);
  if (!u) return;
  u.isAdmin = true;
  saveUsers(users);
  renderAdmin();
}

async function saveSettings() {
  const settings = {
    rewards: {
      Follow: Number($("setFollow").value) || 10,
      Like: Number($("setLike").value) || 5,
      Comment: Number($("setComment").value) || 10
    },
    referralPercent: Number($("setReferral").value) || 5
  };
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("update_settings", {
      p_follow: settings.rewards.Follow, p_like: settings.rewards.Like,
      p_comment: settings.rewards.Comment, p_referral: settings.referralPercent
    });
    if (error) { $("settingsMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); }
    catch (loadError) { $("settingsMsg").textContent = "Settings saved, but refresh failed: " + loadError.message; return; }
  } else {
    saveSettingsLocal(settings);
  }
  // Keep the in-memory CONFIG in step for this session.
  CONFIG.REWARDS = settings.rewards;
  CONFIG.REFERRAL_PERCENT = settings.referralPercent;
  $("settingsMsg").textContent = "Settings saved. Legacy plans will use these per-task rates.";
}

/* Approve a task: pay the user, THEN pay the referrer 5%.
   This is the ONLY place task money is created. */
async function approveTask(subId) {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_task", { p_submission_id: subId, p_approve: true });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); updateStats(); }
    catch (loadError) { $("adminMsg").textContent = "Task reviewed, but refresh failed: " + loadError.message; }
    return;
  }
  const subs = getSubmissions();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== "pending") return;
  sub.status = "approved";
  saveSubmissions(subs);

  const users = getUsers();
  const earner = users.find(u => u.id === sub.userId);
  if (earner) {
    const activePlans = getActivePlans(earner);
    let payout = sub.reward;
    let payoutText = "Task approved: " + sub.action + " " + sub.channel + " (Day " + sub.day + ")";

    if (getActiveDailyReward(activePlans)) {
      const dayTaskIds = new Set(ALL_TASKS.filter(task => task.day === sub.day).map(task => task.id));
      const approvedCount = subs.filter(item => item.userId === earner.id && dayTaskIds.has(item.taskId) && item.status === "approved").length;
      const paidDays = store.get("dailyTaskPayouts", []);
      if (approvedCount < dayTaskIds.size) {
        renderAdmin(); updateStats();
        return;
      }
      const eligiblePlans = activePlans.filter(plan => plan.dailyReward);
      const unpaidPlans = eligiblePlans.filter(plan =>
        !paidDays.includes([earner.id, plan.activation.id, sub.day].join(":"))
      );
      if (!unpaidPlans.length) {
        renderAdmin(); updateStats();
        return;
      }
      unpaidPlans.forEach(plan => {
        paidDays.push([earner.id, plan.activation.id, sub.day].join(":"));
      });
      payout = unpaidPlans.reduce((total, plan) => total + Number(plan.dailyReward), 0);
      store.set("dailyTaskPayouts", paidDays);
      payoutText = "Combined daily task reward: Day " + sub.day + " completed";
    }

    earner.balance += payout;
    earner.taskEarnings += payout;
    const history = getHistory();
    history.push({ userId: earner.id, text: payoutText, amount: payout });
    saveHistory(history);

    if (earner.referredBy) {
      const referrer = users.find(u => u.id === earner.referredBy);
      if (referrer) {
        const settings = getSettings();
        const bonus = Math.round(payout * settings.referralPercent) / 100;
        referrer.balance += bonus;
        referrer.referralEarnings += bonus;
        const h2 = getHistory();
        h2.push({ userId: referrer.id, text: "Referral bonus from " + earner.name, amount: bonus });
        saveHistory(h2);
        activateRequestedPlan(referrer);
      }
    }
    activateRequestedPlan(earner);
    saveUsers(users);
  }
  renderAdmin(); updateStats();
}

async function rejectTask(subId) {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_task", { p_submission_id: subId, p_approve: false });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); }
    catch (loadError) { $("adminMsg").textContent = "Task rejected, but refresh failed: " + loadError.message; }
    return;
  }
  const subs = getSubmissions();
  const sub = subs.find(s => s.id === subId);
  if (!sub) return;
  sub.status = "rejected"; // No money is paid. The user can do another task.
  saveSubmissions(subs);
  renderAdmin();
}

async function payWithdrawal(withdrawalId) {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_withdrawal", { p_withdrawal_id: withdrawalId, p_decision: "paid" });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); }
    catch (loadError) { $("adminMsg").textContent = "Withdrawal updated, but refresh failed: " + loadError.message; }
    return;
  }
  const all = getWithdrawals();
  const w = all.find(x => x.id === withdrawalId);
  if (!w) return;
  w.status = "paid";
  saveWithdrawals(all);
  const users = getUsers();
  const u = users.find(x => x.id === w.userId);
  if (u) {
    u.totalWithdrawn += w.amount; // Balance was already reduced at request time.
    saveUsers(users);
    const h = getHistory();
    h.push({ userId: u.id, text: "Withdrawal paid to " + w.bank, amount: -w.amount });
    saveHistory(h);
  }
  renderAdmin();
}

async function rejectWithdrawal(withdrawalId) {
  if (useSupabase) {
    const { error } = await supabaseClient.rpc("review_withdrawal", { p_withdrawal_id: withdrawalId, p_decision: "rejected" });
    if (error) { $("adminMsg").textContent = error.message; return; }
    try { await refreshSupabaseData(); renderAdmin(); }
    catch (loadError) { $("adminMsg").textContent = "Withdrawal updated, but refresh failed: " + loadError.message; }
    return;
  }
  const all = getWithdrawals();
  const w = all.find(x => x.id === withdrawalId);
  if (!w) return;
  w.status = "rejected";
  saveWithdrawals(all);
  // REFUND: the money was held at request time, so give it back.
  const users = getUsers();
  const u = users.find(x => x.id === w.userId);
  if (u) { u.balance += w.amount; saveUsers(users); }
  renderAdmin();
  updateStats();
}

/* ---------- 14. START THE APP ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  initSupabase();
  document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $("loginBtn").addEventListener("click", () => showView("login"));
  $("signupBtn").addEventListener("click", () => showView("signup"));
  $("logoutBtn").addEventListener("click", logout);
  // If the link has ?ref=AME-XXXX, pre-fill it on the sign-up form.
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) $("signupReferral").value = ref;
  if (useSupabase) {
    currentUser = null;
    sessionStorage.removeItem("ame_session");
    refreshAuthUI();
    const { data, error } = await supabaseClient.auth.getSession();
    if (error || !data.session) { showView("home"); return; }
    currentUser = { id: data.session.user.id };
    try {
      await refreshSupabaseData();
      loginAs(currentUser);
    } catch (loadError) {
      currentUser = null;
      refreshAuthUI();
      console.error("Could not load Supabase app data:", loadError);
      showView("home");
    }
  } else {
    refreshAuthUI();
    showView("home");
  }
});
