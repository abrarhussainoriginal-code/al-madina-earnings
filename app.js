/* ============================================================
   Al-Madina Earnings — app.js
   Plain JavaScript, written for a beginner to read.
   Read it top to bottom: CONFIG first, then data, then logic.

   SAFE VERSION ONLY — the rules baked into this code:
   1. Free to join. No deposit, no paid plans, no screenshot upload.
   2. No guaranteed daily percent. No 20%, no 15%.
   3. A user earns ONLY after an admin approves a task.
   4. Referral = 5% of what referred friends earn from TASKS.
   5. Withdrawal has NO minimum (any amount above Rs 0).
      Admin pays manually and marks it paid.
   ============================================================ */

/* ---------- 1. CONFIG — change these here, nowhere else ---------- */
const CONFIG = {
  // Supabase — leave empty for LOCAL DEMO MODE.
  // To use a real shared database, create a free Supabase project,
  // run supabase.sql in its SQL Editor, then paste the values here:
  SUPABASE_URL: "",       // e.g. "https://xyzcompany.supabase.co"
  SUPABASE_ANON_KEY: "",  // e.g. "eyJhbGciOi..." — the PUBLIC anon key only, never a service key

  // Task rewards. These are EXAMPLES only.
  // Change them in the Admin panel to match what the company
  // actually pays you per follow / like / comment.
  REWARDS: { Follow: 10, Like: 5, Comment: 10 }, // in PKR (Rs)

  // Referral bonus: percent of a referred friend's TASK earnings.
  REFERRAL_PERCENT: 5, // 5%

  DAYS: 30,        // task plan lasts 30 days
  TASKS_PER_DAY: 3 // 3 tasks every day
};

/* ---------- 2. THE FIVE CHANNELS (exact links given by the owner) ---------- */
const CHANNELS = [
  { platform: "TikTok",    name: "@not_your_ibrar", url: "https://www.tiktok.com/@not_your_ibrar" },
  { platform: "TikTok",    name: "@you_know_zakir", url: "https://www.tiktok.com/@you_know_zakir" },
  { platform: "YouTube",   name: "@oyeah-b8m",      url: "https://youtube.com/@oyeah-b8m" },
  { platform: "Instagram", name: "@zakir_romi",     url: "https://www.instagram.com/zakir_romi" },
  { platform: "Facebook",  name: "Facebook channel", url: "https://www.facebook.com/share/1EzUtZgzFa/" }
];

// The three actions rotate. Every task is one of these.
const ACTIONS = ["Follow", "Like", "Comment"];

/* ---------- 3. TASK PLAN — 30 days × 3 tasks, rotating channels ----------
   Day 1 uses channels 0,1,2. Day 2 uses 3,4,0. Day 3 uses 1,2,3, and so on.
   That way no day repeats the same channel three times, and over
   30 days every channel appears many times.
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
const ALL_TASKS = generateTasks();

/* ---------- 4. SUPABASE (optional) ----------
   If CONFIG has a URL + key, we create a Supabase client.
   If not, useSupabase stays false and everything below uses
   localStorage (demo mode). Nothing breaks either way. */
let supabaseClient = null;
let useSupabase = false;
function initSupabase() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && typeof supabase !== "undefined") {
    supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    useSupabase = true;
    console.log("Supabase mode: ON");
  } else {
    console.log("Local demo mode: Supabase not configured. See README.md.");
  }
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
    try { return JSON.parse(localStorage.getItem("ame_" + key)) ?? fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) { localStorage.setItem("ame_" + key, JSON.stringify(value)); }
};
// Tiny demo hash — for learning only, not real security.
function demoHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return "h" + h; }
function makeReferralCode(name) {
  const clean = (name || "USER").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4) || "USER";
  return "AME-" + clean + Math.floor(100 + Math.random() * 900);
}

// Current logged-in user (kept in memory + sessionStorage).
let currentUser = JSON.parse(sessionStorage.getItem("ame_session") || "null");

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
function getHistory() { return store.get("history", []); }
function saveHistory(h) { store.set("history", h); }
function getSettings() {
  // Settings live in localStorage in demo mode. In Supabase mode
  // they come from the `settings` table — see supabase.sql.
  return store.get("settings", { rewards: CONFIG.REWARDS, referralPercent: CONFIG.REFERRAL_PERCENT });
}
function saveSettingsLocal(s) { store.set("settings", s); }

/* ---------- 7. VIEWS — show one section, hide the rest ---------- */
function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.style.display = "none");
  const el = $("view-" + name);
  if (el) el.style.display = "block";
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  if (name === "tasks") renderTasks();
  if (name === "wallet") renderWallet();
  if (name === "referrals") renderReferrals();
  if (name === "withdraw") renderWithdraw();
  if (name === "admin") renderAdmin();
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
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
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
    // In Supabase mode the profile row is the source of truth.
    // For this demo we create a light local session from the auth user.
    const u = { id: data.user.id, name: data.user.user_metadata?.full_name || email, email, referralCode: "", referredBy: null, isAdmin: false, balance: 0, taskEarnings: 0, referralEarnings: 0, totalWithdrawn: 0 };
    loginAs(u);
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
  showView("tasks");
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
  // Admin menu is only visible to admins (see renderAdmin for the rule).
  $("adminNavBtn").style.display = (loggedIn && currentUser.isAdmin) ? "" : "none";
  if (loggedIn) updateStats();
}

function updateStats() {
  if (!currentUser) return;
  const fresh = getUsers().find(u => u.id === currentUser.id) || currentUser;
  currentUser = fresh;
  const approved = getSubmissions().filter(s => s.userId === fresh.id && s.status === "approved").length;
  if ($("statBalance")) $("statBalance").textContent = rs(fresh.balance);
  if ($("statTaskEarnings")) $("statTaskEarnings").textContent = rs(fresh.taskEarnings);
  if ($("statRefEarnings")) $("statRefEarnings").textContent = rs(fresh.referralEarnings);
  if ($("statApproved")) $("statApproved").textContent = approved;
}

/* ---------- 9. TASKS ----------
   CONDITION: you must be logged in to submit.
   CONDITION: one submission per task per user. Pressing "Mark done"
   twice does NOT pay twice — the second press is blocked.
   CONDITION: submitting does NOT pay yet. Status = "pending".
   Only an admin approval (section 12) adds money. */
function renderTasks() {
  const sel = $("daySelect");
  if (sel.options.length === 0) {
    for (let d = 1; d <= CONFIG.DAYS; d++) {
      const o = document.createElement("option");
      o.value = d; o.textContent = "Day " + d;
      sel.appendChild(o);
    }
  }
  const day = Number(sel.value || 1);
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
    div.innerHTML =
      "<div><h4>" + task.action + " — " + esc(task.channel) + "</h4>" +
      "<p>" + esc(task.platform) + " • Day " + task.day + " • <span class='reward'>" + rs(reward) + "</span> after approval</p></div>" +
      "<div>" +
        "<a class='btn btn-outline btn-small' href='" + task.url + "' target='_blank' rel='noopener'>Open channel</a> " +
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
  const task = ALL_TASKS.find(t => t.id === taskId);
  if (!task) return;
  const subs = getSubmissions();
  if (subs.find(s => s.userId === currentUser.id && s.taskId === taskId)) {
    $("tasksMsg").textContent = "You already submitted this task.";
    return;
  }
  const settings = getSettings();
  const sub = {
    id: "S" + Date.now(), userId: currentUser.id, userName: currentUser.name,
    taskId: task.id, day: task.day, platform: task.platform, channel: task.channel,
    action: task.action, reward: settings.rewards[task.action] ?? task.reward,
    status: "pending", createdAt: new Date().toISOString()
  };
  subs.push(sub);
  saveSubmissions(subs);

  // Supabase mode: also write the row to the shared table.
  if (useSupabase) {
    await supabaseClient.from("task_submissions").insert({
      user_id: currentUser.id, task_id: task.id, status: "pending", reward_rs: sub.reward
    });
  }
  $("tasksMsg").textContent = "Submitted for approval. You will be paid only if an admin approves it.";
  renderTasks();
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
    : "<li>No earnings yet. Complete a task and wait for admin approval.</li>";
}

/* ---------- 11. REFERRALS ----------
   CONDITION: referral is paid ONLY when the referred friend's
   task is APPROVED (see approveTask in section 12). The referrer
   gets REFERRAL_PERCENT of that task reward — e.g. 5% of Rs 10 = Rs 0.50. */
function renderReferrals() {
  if (!currentUser) { showView("login"); return; }
  const u = getUsers().find(x => x.id === currentUser.id) || currentUser;
  $("myReferralCode").value = u.referralCode || "";
  const friends = getUsers().filter(x => x.referredBy === u.id);
  $("refCount").textContent = friends.length;
  $("refEarnings").textContent = rs(u.referralEarnings);
  $("refList").innerHTML = friends.length
    ? friends.map(f => "<li><span>" + esc(f.name) + " (" + esc(f.email) + ")</span><span>Task earnings: " + rs(f.taskEarnings) + "</span></li>").join("")
    : "<li>No friends joined with your code yet.</li>";
}
function copyReferral() {
  const input = $("myReferralCode");
  input.select();
  navigator.clipboard?.writeText(input.value);
  alert("Referral code copied: " + input.value);
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
  if (useSupabase) {
    await supabaseClient.from("withdrawals").insert({ user_id: u.id, amount_rs: amount, phone, bank_account: bank, status: "pending" });
  }
  msg.textContent = "Request sent. An admin will send the money manually and mark it paid.";
  renderWithdraw(); updateStats();
}

/* ---------- 13. ADMIN ----------
   RULE: the FIRST user can claim admin only if no admin exists yet.
   After that, only an existing admin can promote someone else.
   This stops a stranger from making themselves admin later. */
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
    ? pendingTasks.map(s => "<li><span>" + esc(s.userName) + " • Day " + s.day + " • " + s.action + " " + esc(s.channel) + " • " + rs(s.reward) + "</span><span><button class='btn btn-primary btn-small' onclick=\"approveTask('" + s.id + "')\">Approve</button> <button class='btn btn-outline btn-small' onclick=\"rejectTask('" + s.id + "')\">Reject</button></span></li>").join("")
    : "<li>No pending tasks.</li>";

  const pendingW = getWithdrawals().filter(w => w.status === "pending");
  $("adminWithdrawals").innerHTML = pendingW.length
    ? pendingW.map(w => "<li><span>" + esc(w.userName) + " • " + rs(w.amount) + " • " + esc(w.phone) + " • " + esc(w.bank) + "</span><span><button class='btn btn-primary btn-small' onclick=\"payWithdrawal('" + w.id + "')\">Mark paid</button> <button class='btn btn-outline btn-small' onclick=\"rejectWithdrawal('" + w.id + "')\">Reject + refund</button></span></li>").join("")
    : "<li>No pending withdrawals.</li>";

  $("adminUsers").innerHTML = users.map(u =>
    "<li><span>" + esc(u.name) + " (" + esc(u.email) + ") • Balance " + rs(u.balance) + " • Referred " + getUsers().filter(x => x.referredBy === u.id).length + "</span>" +
    (u.isAdmin ? "<span class='badge approved'>ADMIN</span>"
               : "<button class='btn btn-outline btn-small' onclick=\"promoteUser('" + u.id + "')\">Make admin</button>") +
    "</li>").join("");
}

function claimAdmin() {
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

function promoteUser(userId) {
  const users = getUsers();
  const u = users.find(x => x.id === userId);
  if (!u) return;
  u.isAdmin = true;
  saveUsers(users);
  renderAdmin();
}

function saveSettings() {
  const settings = {
    rewards: {
      Follow: Number($("setFollow").value) || 10,
      Like: Number($("setLike").value) || 5,
      Comment: Number($("setComment").value) || 10
    },
    referralPercent: Number($("setReferral").value) || 5
  };
  saveSettingsLocal(settings);
  // Keep the in-memory CONFIG in step for this session.
  CONFIG.REWARDS = settings.rewards;
  CONFIG.REFERRAL_PERCENT = settings.referralPercent;
  $("settingsMsg").textContent = "Settings saved. New tasks will pay these rates.";
  if (useSupabase) {
    supabaseClient.from("settings").upsert({ id: 1, follow_rs: settings.rewards.Follow, like_rs: settings.rewards.Like, comment_rs: settings.rewards.Comment, referral_percent: settings.referralPercent });
  }
}

/* Approve a task: pay the user, THEN pay the referrer 5%.
   This is the ONLY place task money is created. */
function approveTask(subId) {
  const subs = getSubmissions();
  const sub = subs.find(s => s.id === subId);
  if (!sub || sub.status !== "pending") return;
  sub.status = "approved";
  saveSubmissions(subs);

  const users = getUsers();
  const earner = users.find(u => u.id === sub.userId);
  if (earner) {
    earner.balance += sub.reward;
    earner.taskEarnings += sub.reward;
    const history = getHistory();
    history.push({ userId: earner.id, text: "Task approved: " + sub.action + " " + sub.channel + " (Day " + sub.day + ")", amount: sub.reward });
    saveHistory(history);

    // Referral bonus: 5% of THIS task reward, paid to the referrer.
    // Example: 5% of Rs 10 = Rs 0.50.
    if (earner.referredBy) {
      const referrer = users.find(u => u.id === earner.referredBy);
      if (referrer) {
        const settings = getSettings();
        const bonus = Math.round(sub.reward * settings.referralPercent) / 100;
        referrer.balance += bonus;
        referrer.referralEarnings += bonus;
        const h2 = getHistory();
        h2.push({ userId: referrer.id, text: "Referral bonus from " + earner.name, amount: bonus });
        saveHistory(h2);
      }
    }
    saveUsers(users);
  }
  renderAdmin(); updateStats();
}

function rejectTask(subId) {
  const subs = getSubmissions();
  const sub = subs.find(s => s.id === subId);
  if (!sub) return;
  sub.status = "rejected"; // No money is paid. The user can do another task.
  saveSubmissions(subs);
  renderAdmin();
}

function payWithdrawal(withdrawalId) {
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

function rejectWithdrawal(withdrawalId) {
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
}

/* ---------- 14. START THE APP ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initSupabase();
  document.querySelectorAll(".nav-btn").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  $("loginBtn").addEventListener("click", () => showView("login"));
  $("signupBtn").addEventListener("click", () => showView("signup"));
  $("logoutBtn").addEventListener("click", logout);
  // If the link has ?ref=AME-XXXX, pre-fill it on the sign-up form.
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) $("signupReferral").value = ref;
  refreshAuthUI();
  showView("home");
});
