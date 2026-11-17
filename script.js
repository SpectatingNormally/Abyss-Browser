// ==================== ABYSS BROWSER STATE & PERSISTENCE ====================
const STORAGE_KEY = "abyss_browser_state_v6";
const LEGACY_STORAGE_KEY = "abyss_browser_state_v5";
const DEFAULT_BLOCKER_PASSWORD = "Abyss.Password";
const MAX_ACTIVE_WIDGETS = 4;

const defaultState = {
  tabs: [],
  activeTabId: null,
  historyLog: [],
  lastSearchResults: [],
  activeSettingsSection: "appearance",
  lastActivityAt: Date.now(),
  abyssBlockerUnlocked: false,
  pendingPermissionCallback: null,
  isGameFullscreen: false,
  clockSubTab: "clock", // "clock" | "stopwatch" | "timer"
  stopwatchMs: 0,
  stopwatchRunning: false,
  timerRemainingSec: 300,
  timerRunning: false,
  calcDisplay: "0",
  calcHistory: "",
  stickyNote: "Welcome to Abyss! Jot down quick notes, links, or game codes here.",
  todoItems: [
    { id: 1, text: "Upload a permanent .HTML or .ZIP app with its custom link", done: false },
    { id: 2, text: "Try Voice Search to dictate into the search bar", done: false }
  ],
  converterState: {
    category: "temp",
    inputVal: "72",
    direction: "a2b"
  },
  randomOutput: "Ready to roll!",
  customAccentHex: "#2563eb",
  // New Utility Widget States
  pomodoroMode: "focus", // "focus" | "short" | "long"
  pomodoroSec: 1500,
  pomodoroRunning: false,
  pomodoroSessions: 0,
  weatherCity: "New York",
  weatherTempF: null,
  weatherDesc: "Click Refresh for live weather",
  weatherUseC: false,
  dictWord: "",
  dictResult: "Type any English word above for an instant definition.",
  textToolInput: "",
  textToolOutput: "",
  habitItems: [
    { id: 1, name: "Deep Focus Session", done: false },
    { id: 2, name: "Hydrate & Stretch", done: false }
  ],
  pctInputA: "20",
  pctInputB: "85",
  ytMp4InputUrl: "",
  ytMp4Status: null,
  settings: {
    theme: "clean-white",
    accent: "blue",
    fontFamily: "sans",
    cursorStyle: "default",
    soundEffects: true,
    robotAnimation: "idle",
    voicePermission: "ask", // "ask" | "allow" | "block"
    voiceAutoSubmit: true,
    voiceReadback: true,
    voiceLang: "en-US",
    voiceRate: 1.0,
    defaultWebMode: "live", // "live" | "proxy"
    defaultSearchEngine: "abyss",
    openLinksInNewTab: false,
    prioritizeTabShortcuts: true,
    abyssBlocker: {
      enabled: false,
      safeSearch: true,
      password: DEFAULT_BLOCKER_PASSWORD,
      blockedSites: []
    },
    autoClearHistory: "off", // "off" | "5min" | "15min" | "60min" | "onclose"
    tabSleepEnabled: true,
    tabSleepSeconds: 60, // 0 = Never
    showQuickSites: true,
    widgets: {
      clock: true,
      notes: true,
      calculator: true,
      todo: true,
      converter: false,
      randomizer: false,
      colorStudio: false,
      systemMonitor: false,
      pomodoro: false,
      weather: false,
      dictionary: false,
      textTools: false,
      habits: false,
      percentage: false
    }
  },
  quickSites: [
    { name: "GitHub", url: "https://github.com", badge: "GH", bg: "#f1f5f9", color: "#0f172a" },
    { name: "Supabase", url: "https://supabase.com", badge: "SB", bg: "#dcfce7", color: "#059669" },
    { name: "Wikipedia", url: "https://en.m.wikipedia.org", badge: "W", bg: "#e0f2fe", color: "#0284c7" },
    { name: "Scratch", url: "https://scratch.mit.edu", badge: "S", bg: "#fef3c7", color: "#d97706" }
  ],
  customApps: [
    {
      id: "yt-mp4-converter",
      name: "YouTube to .MP4",
      subtitle: "Non-Copyright MP4",
      customRoute: "abyss://yt-mp4",
      path: "abyss://yt-mp4",
      badge: "MP4",
      bg: "#fee2e2",
      color: "#dc2626",
      isBuiltInTool: true,
      loadedHtml: null,
      loadedFileName: null
    },
    {
      id: "my-games-index2",
      name: "My Games (index2)",
      subtitle: "HTML or ZIP App",
      customRoute: "abyss://app/my-games",
      path: "Local .HTML or .ZIP Archive",
      badge: "GM",
      bg: "#ede9fe",
      color: "#7c3aed",
      loadedHtml: null,
      loadedFileName: null
    }
  ]
};

const state = JSON.parse(JSON.stringify(defaultState));
const renderedPaneSignatures = {};
// Optional account + cloud sync. Guest mode remains fully usable without signing in.
window.ABYSS_SUPABASE_CONFIG = {
  url: "https://okhefqquavywsydomted.supabase.co",
  publishableKey: "sb_publishable_nwOUzQ93Lht6bPumzDgDSg_OA-8GUd6"
};
let abyssSupabase = null;
let abyssSession = null;
let cloudSyncTimer = null;
let cloudBundleSyncTimer = null;
let applyingCloudSnapshot = false;
let cloudRestoreInProgress = false;
const ABYSS_APP_BUCKET = "abyss-app-bundles";


// ==================== INDEXEDDB PERMANENT APP & ZIP STORAGE ====================
const APPS_DB_NAME = "AbyssPermanentAppsDB";
const APPS_STORE_NAME = "appBundles";

function openAppsDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(APPS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(APPS_STORE_NAME)) {
        db.createObjectStore(APPS_STORE_NAME, { keyPath: "appId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePermanentAppBundle(appId, bundleRecord) {
  try {
    const db = await openAppsDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(APPS_STORE_NAME, "readwrite");
      tx.objectStore(APPS_STORE_NAME).put({ appId, ...bundleRecord, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (typeof scheduleCloudBundleSave === "function") scheduleCloudBundleSave();
  } catch {
    // Fallback handled by localStorage if small
  }
}

async function deletePermanentAppBundle(appId) {
  try {
    const db = await openAppsDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(APPS_STORE_NAME, "readwrite");
      tx.objectStore(APPS_STORE_NAME).delete(appId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

async function restoreAllPermanentAppBundles() {
  try {
    const db = await openAppsDb();
    const records = await new Promise((resolve, reject) => {
      const tx = db.transaction(APPS_STORE_NAME, "readonly");
      const req = tx.objectStore(APPS_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    for (const rec of records) {
      const app = state.customApps.find(a => a.id === rec.appId);
      if (!app) continue;
      if (rec.kind === "zip" && Array.isArray(rec.files)) {
        const rebuilt = buildRunnableHtmlFromExtractedEntries(rec.files);
        app.loadedHtml = rebuilt.html;
        if (rec.loadedFileName) app.loadedFileName = rec.loadedFileName;
      } else if (rec.kind === "html" && typeof rec.html === "string") {
        app.loadedHtml = rec.html;
        if (rec.loadedFileName) app.loadedFileName = rec.loadedFileName;
      }
    }
  } catch {}
}

function slugifyAppRoute(rawName) {
  const slug = String(rawName || "app")
    .toLowerCase()
    .replace(/^abyss:\/\/app\//i, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || ("app-" + Date.now().toString(36));
  return `abyss://app/${slug}`;
}

function ensureUniqueCustomRoute(desiredRoute, excludeAppId = null) {
  let base = slugifyAppRoute(desiredRoute);
  let candidate = base;
  let counter = 2;
  while (state.customApps.some(a => a.id !== excludeAppId && (a.customRoute || "").toLowerCase() === candidate.toLowerCase())) {
    candidate = `${base}-${counter++}`;
  }
  return candidate;
}

function enforceMaxFourWidgets(widgetsObj) {
  const result = { ...defaultState.settings.widgets, ...(widgetsObj || {}) };
  let activeCount = 0;
  Object.keys(result).forEach(key => {
    if (result[key]) {
      if (activeCount < MAX_ACTIVE_WIDGETS) {
        activeCount++;
      } else {
        result[key] = false;
      }
    }
  });
  return result;
}

// Clean hook API for Abyss.Blocker
window.AbyssBlocker = {
  isEnabled() {
    return Boolean(state.settings.abyssBlocker?.enabled);
  },
  getBlockedSites() {
    return state.abyssBlockerUnlocked ? [...(state.settings.abyssBlocker?.blockedSites || [])] : [];
  },
  setBlockedSites(sitesArray) {
    if (!Array.isArray(sitesArray)) return;
    state.settings.abyssBlocker.blockedSites = sitesArray
      .map(s => String(s).trim())
      .filter(Boolean);
    savePersistentState();
    renderAll(true);
  },
  addBlockedSite(site) {
    const clean = String(site || "").trim();
    if (!clean) return;
    if (!state.settings.abyssBlocker.blockedSites.includes(clean)) {
      state.settings.abyssBlocker.blockedSites.push(clean);
      savePersistentState();
      renderAll(true);
    }
  }
};

function sanitizeTabForStorage(tab) {
  return {
    id: tab.id,
    title: tab.title,
    historyStack: tab.historyStack.map(entry => ({
      route: entry.route,
      title: entry.title,
      payload: entry.payload ? { ...entry.payload } : null
    })),
    historyIndex: tab.historyIndex,
    lastActiveAt: tab.lastActiveAt,
    sleeping: Boolean(tab.sleeping),
    scrollTop: tab.scrollTop || 0
  };
}

function savePersistentState() {
  try {
    const activePane = document.querySelector(`.tab-pane[data-tab-id="${state.activeTabId}"]`);
    const activeTab = getActiveTab();
    if (activePane && activeTab) {
      activeTab.scrollTop = activePane.scrollTop || 0;
    }
    const toSave = {
      tabs: state.tabs.map(sanitizeTabForStorage),
      activeTabId: state.activeTabId,
      settings: state.settings,
      stickyNote: state.stickyNote,
      todoItems: state.todoItems,
      habitItems: state.habitItems,
      quickSites: state.quickSites,
      historyLog: state.historyLog.slice(0, 120),
      customAccentHex: state.customAccentHex,
      customApps: state.customApps.map(({ loadedHtml, ...rest }) => ({
        ...rest,
        loadedHtml: loadedHtml && loadedHtml.length < 250000 ? loadedHtml : null
      })),
      uiState: {
        clockSubTab: state.clockSubTab, stopwatchMs: state.stopwatchMs, stopwatchRunning: state.stopwatchRunning,
        timerRemainingSec: state.timerRemainingSec, timerRunning: state.timerRunning, calcDisplay: state.calcDisplay, calcHistory: state.calcHistory,
        converterState: state.converterState, randomOutput: state.randomOutput, pomodoroMode: state.pomodoroMode, pomodoroSec: state.pomodoroSec,
        pomodoroRunning: state.pomodoroRunning, pomodoroSessions: state.pomodoroSessions, weatherCity: state.weatherCity, weatherTempF: state.weatherTempF,
        weatherDesc: state.weatherDesc, weatherUseC: state.weatherUseC, dictWord: state.dictWord, dictResult: state.dictResult,
        textToolInput: state.textToolInput, textToolOutput: state.textToolOutput, pctInputA: state.pctInputA, pctInputB: state.pctInputB,
        ytMp4InputUrl: state.ytMp4InputUrl, ytMp4Status: state.ytMp4Status
      },
      
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    if (typeof scheduleCloudSave === "function") scheduleCloudSave(toSave);
  } catch {
    // Ignore storage quota errors (IndexedDB holds full app bundles)
  }
}

function getAccountDisplayName() {
  const user = abyssSession?.user;
  return user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || "Guest";
}

function getAccountInitial() {
  const name = getAccountDisplayName();
  return (String(name).trim()[0] || "G").toUpperCase();
}

function renderAccountPopover() {
  const popover = document.getElementById("account-popover");
  const avatar = document.getElementById("account-avatar-btn");
  if (!popover || !avatar) return;
  const user = abyssSession?.user;
  if (!user) {
    avatar.classList.add("guest-avatar");
    avatar.classList.remove("signed-in-avatar");
    avatar.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.2 20c.5-3.5 3.1-5.4 6.8-5.4s6.3 1.9 6.8 5.4"></path></svg>`;
    avatar.title = "Guest account";
    popover.innerHTML = `
      <div class="account-popover-heading"><span class="account-state-dot"></span><div><strong>Guest mode</strong><small>Using Abyss without an account</small></div></div>
      <div class="account-popover-note">Your data stays on this device. Use Save &amp; Backup to carry it to another device.</div>
      <button class="account-menu-action" onclick="openAccountAuth('signup')">Create an account</button>
      <button class="account-menu-action secondary" onclick="openAccountAuth('login')">Log in</button>
      <button class="account-menu-action secondary" onclick="setSettingsSection('savedemo'); openOrFocusSpecialTab('abyss://settings','Settings'); closeAccountPopover()">Save &amp; Backup</button>`;
  } else {
    const meta = user.user_metadata || {};
    const picture = meta.avatar_url || meta.picture || "";
    const initial = getAccountInitial();
    avatar.classList.remove("guest-avatar");
    avatar.classList.add("signed-in-avatar");
    avatar.innerHTML = picture ? `<img src="${escapeAttr(picture)}" alt="Profile" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initial)}</span>`;
    avatar.title = getAccountDisplayName();
    popover.innerHTML = `
      <div class="account-popover-heading"><span class="account-initial-small">${escapeHtml(initial)}</span><div><strong>${escapeHtml(getAccountDisplayName())}</strong><small>${escapeHtml(user.email || "Signed in")}</small></div></div>
      <div class="account-sync-status" id="account-sync-status">Cloud sync is enabled for this account.</div>
      <button class="account-menu-action" onclick="syncCloudNow()">Sync now</button>
      <button class="account-menu-action secondary" onclick="setSettingsSection('account'); openOrFocusSpecialTab('abyss://settings','Settings'); closeAccountPopover()">Account &amp; Sync Settings</button>
      <button class="account-menu-action secondary" onclick="signOutOfAbyss()">Sign out</button>`;
  }
}

function toggleAccountPopover(force) {
  const popover = document.getElementById("account-popover");
  const button = document.getElementById("account-avatar-btn");
  if (!popover || !button) return;
  const shouldOpen = typeof force === "boolean" ? force : popover.classList.contains("hidden");
  popover.classList.toggle("hidden", !shouldOpen);
  button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  if (shouldOpen) renderAccountPopover();
}

function closeAccountPopover() { toggleAccountPopover(false); }

function openAccountAuth(mode = "login") {
  closeAccountPopover();
  const modal = document.getElementById("account-modal");
  const content = document.getElementById("account-modal-content");
  if (!modal || !content) return;
  const signup = mode === "signup";
  content.innerHTML = `
    <div class="account-modal-top"><div><span class="account-modal-kicker">ABYSS ACCOUNT</span><h2 id="account-modal-title">${signup ? "Create your account" : "Welcome back"}</h2><p>${signup ? "Sync your Abyss data across devices." : "Log in to restore your saved Abyss data."}</p></div><button class="modal-close-btn" onclick="closeAccountAuth()" aria-label="Close">&times;</button></div>
    <div class="account-mode-switch"><button class="${signup ? "active" : ""}" onclick="openAccountAuth('signup')">Register</button><button class="${!signup ? "active" : ""}" onclick="openAccountAuth('login')">Log in</button></div>
    <form id="account-auth-form" class="account-auth-form" onsubmit="submitAccountAuth(event,'${signup ? "signup" : "login"}')">
      ${signup ? `<label>Display name<input id="account-name-input" class="text-input" type="text" maxlength="40" autocomplete="name" placeholder="Your name (optional)"></label>` : ""}
      <label>Email<input id="account-email-input" class="text-input" type="email" autocomplete="email" required placeholder="you@example.com"></label>
      <label>Password<input id="account-password-input" class="text-input" type="password" minlength="8" autocomplete="${signup ? "new-password" : "current-password"}" required placeholder="At least 8 characters"></label>
      <button class="btn btn-primary account-submit-btn" id="account-submit-btn" type="submit">${signup ? "Create account" : "Log in"}</button>
      <p class="account-auth-message" id="account-auth-message" role="status"></p>
    </form>
    <p class="account-guest-footnote">You can keep using Abyss as a guest. Registration is optional.</p>`;
  modal.classList.remove("hidden");
  ensureSupabaseReady().catch(error => {
    const status = document.getElementById("account-auth-message");
    if (status) status.textContent = "Account service could not load. Guest mode and Save & Backup are still available.";
    console.warn("Abyss account service unavailable:", error);
  });
}

function closeAccountAuth() {
  document.getElementById("account-modal")?.classList.add("hidden");
}

async function submitAccountAuth(event, mode) {
  event.preventDefault();
  const message = document.getElementById("account-auth-message");
  const button = document.getElementById("account-submit-btn");
  try { await ensureSupabaseReady(); } catch {}
  if (!abyssSupabase) {
    if (message) message.textContent = "Account service is unavailable. Guest mode and Save & Backup still work.";
    return;
  }
  const email = document.getElementById("account-email-input")?.value.trim();
  const password = document.getElementById("account-password-input")?.value;
  const displayName = document.getElementById("account-name-input")?.value.trim();
  if (button) { button.disabled = true; button.textContent = mode === "signup" ? "Creating..." : "Logging in..."; }
  if (message) message.textContent = "";
  try {
    const result = mode === "signup"
      ? await abyssSupabase.auth.signUp({ email, password, options: { data: { full_name: displayName || "" } } })
      : await abyssSupabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === "signup" && !result.data.session) {
      if (message) message.textContent = "Check your email to confirm your account, then log in here.";
    } else {
      if (message) message.textContent = "Success. Loading your account...";
      if (result.data.session) {
        abyssSession = result.data.session;
        await restoreCloudSnapshot();
        renderAccountPopover();
        closeAccountAuth();
      }
    }
  } catch (error) {
    if (message) message.textContent = error?.message || "Unable to complete account request.";
  } finally {
    if (button?.isConnected) { button.disabled = false; button.textContent = mode === "signup" ? "Create account" : "Log in"; }
  }
}

async function signOutOfAbyss() {
  closeAccountPopover();
  if (!abyssSupabase) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  try {
    const { error } = await abyssSupabase.auth.signOut();
    if (error) throw error;
    abyssSession = null;
    renderAccountPopover();
    showAccountNotice("Signed out. Abyss is still available in guest mode.");
  } catch (error) {
    showAccountNotice(error?.message || "Could not sign out.");
  }
}

function showAccountNotice(message) {
  const popover = document.getElementById("account-popover");
  if (!popover) return;
  toggleAccountPopover(true);
  const note = document.createElement("div");
  note.className = "account-popover-note";
  note.textContent = message;
  popover.appendChild(note);
}

function makeCloudSnapshot() {
  const activePane = document.querySelector(`.tab-pane[data-tab-id="${state.activeTabId}"]`);
  const activeTab = getActiveTab();
  if (activePane && activeTab) activeTab.scrollTop = activePane.scrollTop || 0;
  return {
    tabs: state.tabs.map(sanitizeTabForStorage), activeTabId: state.activeTabId,
    settings: state.settings, stickyNote: state.stickyNote, todoItems: state.todoItems,
    habitItems: state.habitItems, quickSites: state.quickSites, historyLog: state.historyLog.slice(0, 120),
    customAccentHex: state.customAccentHex,
    customApps: state.customApps.map(({ loadedHtml, ...rest }) => ({ ...rest, loadedHtml: loadedHtml && loadedHtml.length < 250000 ? loadedHtml : null })),
    uiState: {
        clockSubTab: state.clockSubTab, stopwatchMs: state.stopwatchMs, stopwatchRunning: state.stopwatchRunning,
        timerRemainingSec: state.timerRemainingSec, timerRunning: state.timerRunning, calcDisplay: state.calcDisplay, calcHistory: state.calcHistory,
        converterState: state.converterState, randomOutput: state.randomOutput, pomodoroMode: state.pomodoroMode, pomodoroSec: state.pomodoroSec,
        pomodoroRunning: state.pomodoroRunning, pomodoroSessions: state.pomodoroSessions, weatherCity: state.weatherCity, weatherTempF: state.weatherTempF,
        weatherDesc: state.weatherDesc, weatherUseC: state.weatherUseC, dictWord: state.dictWord, dictResult: state.dictResult,
        textToolInput: state.textToolInput, textToolOutput: state.textToolOutput, pctInputA: state.pctInputA, pctInputB: state.pctInputB,
        ytMp4InputUrl: state.ytMp4InputUrl, ytMp4Status: state.ytMp4Status
      },
      
  };
}

function scheduleCloudSave(snapshot) {
  if (!abyssSupabase || !abyssSession?.user?.id || applyingCloudSnapshot || cloudRestoreInProgress) return;
  if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    cloudSyncTimer = null;
    try {
      const { error } = await abyssSupabase.from("abyss_user_data").upsert({
        user_id: abyssSession.user.id, data: snapshot, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (error) throw error;
      const status = document.getElementById("account-sync-status");
      if (status) status.textContent = "All set — your latest browser data is synced.";
    } catch (error) {
      const status = document.getElementById("account-sync-status");
      if (status) status.textContent = `Cloud sync paused: ${error?.message || "check your Supabase table and RLS setup"}`;
    }
  }, 1200);
}

async function syncCloudNow() {
  closeAccountPopover();
  if (!abyssSession?.user?.id) { openAccountAuth("login"); return; }
  const status = document.getElementById("account-sync-status");
  try {
    const snapshot = makeCloudSnapshot();
    const { error } = await abyssSupabase.from("abyss_user_data").upsert({
      user_id: abyssSession.user.id, data: snapshot, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    await uploadLocalAppBundlesToCloud();
    showAccountNotice("Your Abyss data and uploaded apps are synced to your account.");
  } catch (error) {
    showAccountNotice(`Sync failed: ${error?.message || "check Supabase setup"}`);
  }
}

async function restoreCloudSnapshot() {
  if (!abyssSupabase || !abyssSession?.user?.id) return;
  cloudRestoreInProgress = true;
  let seedCloudFromThisDevice = false;
  try {
    const { data, error } = await abyssSupabase.from("abyss_user_data").select("data").eq("user_id", abyssSession.user.id).maybeSingle();
    if (error) throw error;
    if (data?.data && typeof data.data === "object") {
      applyingCloudSnapshot = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.data));
      loadPersistentState();
      await restoreAllPermanentAppBundles();
      try { await restoreCloudAppBundles(); } catch (bundleError) { console.warn("Some cloud app files could not be restored:", bundleError); }
      applyingCloudSnapshot = false;
      renderAll(true);
    } else {
      seedCloudFromThisDevice = true;
    }
  } catch (error) {
    applyingCloudSnapshot = false;
    showAccountNotice(`Could not restore cloud data: ${error?.message || "check Supabase setup"}`);
  } finally {
    cloudRestoreInProgress = false;
    renderAccountPopover();
    if (seedCloudFromThisDevice) {
      scheduleCloudSave(makeCloudSnapshot());
      scheduleCloudBundleSave();
    }
  }
}

function loadSupabaseSdk() {
  if (window.supabase?.createClient) return Promise.resolve();
  if (window.__abyssSupabaseSdkPromise) return window.__abyssSupabaseSdkPromise;
  window.__abyssSupabaseSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js";
    script.async = true;
    const timeout = setTimeout(() => reject(new Error("Supabase SDK load timed out")), 8000);
    script.onload = () => { clearTimeout(timeout); window.supabase?.createClient ? resolve() : reject(new Error("Supabase SDK did not initialize")); };
    script.onerror = () => { clearTimeout(timeout); reject(new Error("Could not load Supabase SDK")); };
    document.head.appendChild(script);
  }).catch(error => { window.__abyssSupabaseSdkPromise = null; throw error; });
  return window.__abyssSupabaseSdkPromise;
}

async function ensureSupabaseReady() {
  const config = window.ABYSS_SUPABASE_CONFIG;
  if (!config?.url || !config?.publishableKey) throw new Error("Supabase config is missing");
  if (!window.supabase?.createClient) await loadSupabaseSdk();
  if (!abyssSupabase) {
    abyssSupabase = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    abyssSupabase.auth.onAuthStateChange((event, session) => {
      abyssSession = session;
      renderAccountPopover();
      if (event === "SIGNED_OUT" && cloudSyncTimer) clearTimeout(cloudSyncTimer);
    });
  }
  if (!abyssSession) {
    const { data, error } = await abyssSupabase.auth.getSession();
    if (error) throw error;
    abyssSession = data?.session || null;
    renderAccountPopover();
    if (abyssSession) await restoreCloudSnapshot();
  }
  return abyssSupabase;
}

function initSupabaseAccount() {
  renderAccountPopover();
  // Background restore is optional: never delay guest-mode startup on a network request.
  ensureSupabaseReady().catch(error => console.info("Abyss cloud sync is unavailable until sign-in:", error?.message || error));
}


async function getAllLocalAppBundleRecords() {
  try {
    const db = await openAppsDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(APPS_STORE_NAME, "readonly");
      const req = tx.objectStore(APPS_STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

function scheduleCloudBundleSave() {
  if (!abyssSupabase || !abyssSession?.user?.id || cloudRestoreInProgress) return;
  if (cloudBundleSyncTimer) clearTimeout(cloudBundleSyncTimer);
  cloudBundleSyncTimer = setTimeout(() => {
    cloudBundleSyncTimer = null;
    uploadLocalAppBundlesToCloud().catch(err => console.warn("Abyss app bundle cloud backup paused:", err));
  }, 5000);
}

async function uploadLocalAppBundlesToCloud() {
  if (!abyssSupabase || !abyssSession?.user?.id || !window.JSZip) return;
  const userId = abyssSession.user.id;
  const records = await getAllLocalAppBundleRecords();
  for (const rec of records) {
    if (!rec?.appId) continue;
    const zip = new JSZip();
    if (rec.kind === "html" && typeof rec.html === "string") {
      zip.file("index.html", rec.html);
    } else if (rec.kind === "zip" && Array.isArray(rec.files)) {
      for (const file of rec.files) {
        if (file?.name && file.buffer) zip.file(file.name, file.buffer);
      }
    } else continue;
    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
    const storagePath = `${userId}/${encodeURIComponent(rec.appId)}.zip`;
    const { error: uploadError } = await abyssSupabase.storage.from(ABYSS_APP_BUCKET).upload(storagePath, blob, { upsert: true, contentType: "application/zip" });
    if (uploadError) throw uploadError;
    const { error: metaError } = await abyssSupabase.from("abyss_app_files").upsert({
      user_id: userId, app_id: rec.appId, file_name: rec.loadedFileName || `${rec.appId}.zip`, storage_path: storagePath, updated_at: new Date().toISOString()
    }, { onConflict: "user_id,app_id" });
    if (metaError) throw metaError;
  }
}

async function restoreCloudAppBundles() {
  if (!abyssSupabase || !abyssSession?.user?.id || !window.JSZip) return;
  const { data, error } = await abyssSupabase.from("abyss_app_files").select("app_id,file_name,storage_path").eq("user_id", abyssSession.user.id);
  if (error) throw error;
  for (const item of (data || [])) {
    const { data: blob, error: downloadError } = await abyssSupabase.storage.from(ABYSS_APP_BUCKET).download(item.storage_path);
    if (downloadError) throw downloadError;
    const zip = await JSZip.loadAsync(blob);
    const files = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      files.push({ name, buffer: await entry.async("arraybuffer") });
    }
    await savePermanentAppBundle(item.app_id, { kind: "zip", files, loadedFileName: item.file_name });
  }
  await restoreAllPermanentAppBundles();
}

function loadPersistentState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.settings) {
      const mergedWidgets = enforceMaxFourWidgets(saved.settings.widgets);
      const savedBlocker = saved.settings.abyssBlocker || {};
      const validPw = typeof savedBlocker.password === "string" && savedBlocker.password.length > 0 && savedBlocker.password.length <= 14
        ? savedBlocker.password
        : DEFAULT_BLOCKER_PASSWORD;
      state.settings = {
        ...state.settings,
        ...saved.settings,
        abyssBlocker: {
          ...state.settings.abyssBlocker,
          ...savedBlocker,
          password: validPw
        },
        widgets: mergedWidgets
      };
    }
    if (saved.uiState && typeof saved.uiState === "object") {
      const allowedUiStateKeys = ["clockSubTab","stopwatchMs","stopwatchRunning","timerRemainingSec","timerRunning","calcDisplay","calcHistory","converterState","randomOutput","pomodoroMode","pomodoroSec","pomodoroRunning","pomodoroSessions","weatherCity","weatherTempF","weatherDesc","weatherUseC","dictWord","dictResult","textToolInput","textToolOutput","pctInputA","pctInputB","ytMp4InputUrl","ytMp4Status"];
      for (const key of allowedUiStateKeys) if (Object.prototype.hasOwnProperty.call(saved.uiState, key)) state[key] = saved.uiState[key];
    }
    if (typeof saved.stickyNote === "string") state.stickyNote = saved.stickyNote;
    if (Array.isArray(saved.todoItems)) state.todoItems = saved.todoItems;
    if (Array.isArray(saved.habitItems)) state.habitItems = saved.habitItems;
    if (Array.isArray(saved.quickSites)) {
      state.quickSites = saved.quickSites.filter(
        s => !(s.name && s.name.toLowerCase().includes("youtube guest"))
      );
    }
    if (Array.isArray(saved.historyLog)) state.historyLog = saved.historyLog;
    if (typeof saved.customAccentHex === "string") state.customAccentHex = saved.customAccentHex;
    if (Array.isArray(saved.customApps) && saved.customApps.length) {
      state.customApps = saved.customApps.map((app, idx) => ({
        ...app,
        customRoute: app.customRoute || (app.id === "yt-mp4-converter" ? "abyss://yt-mp4" : slugifyAppRoute(app.name || ("app-" + idx)))
      }));
      if (!state.customApps.some(a => a.id === "yt-mp4-converter")) {
        state.customApps.unshift(defaultState.customApps[0]);
      }
    }
    if (Array.isArray(saved.tabs) && saved.tabs.length > 0) {
      state.tabs = saved.tabs.map(t => ({
        id: t.id || ("tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
        title: t.title || "Abyss Home",
        historyStack: Array.isArray(t.historyStack) && t.historyStack.length
          ? t.historyStack
          : [{ route: "abyss://home", title: "Abyss Home", payload: null }],
        historyIndex: typeof t.historyIndex === "number" ? t.historyIndex : 0,
        lastActiveAt: t.lastActiveAt || Date.now(),
        sleeping: Boolean(t.sleeping),
        scrollTop: t.scrollTop || 0
      }));
      const validActive = state.tabs.some(t => t.id === saved.activeTabId);
      state.activeTabId = validActive ? saved.activeTabId : state.tabs[0].id;
      return true;
    }
  } catch {
    // Ignore corrupt localStorage
  }
  return false;
}

// ==================== CUSTOM ANIMATED SVG CHARACTERS & ABYSS CIRCLE LOGO ====================
function getAbyssCircleLogoSvg(size = 54, gradId = "abyssGradHome") {
  return `
    <span class="abyss-home-circle-logo" style="width:${size}px;height:${size}px;">
      <svg class="abyss-mark" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="var(--accent)" />
            <stop offset="100%" stop-color="#0ea5e9" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="13" stroke="url(#${gradId})" stroke-width="3" />
        <path d="M9.5 19.5C12.5 13.5 16.5 22.5 22.5 12.5" stroke="url(#${gradId})" stroke-width="2.6" stroke-linecap="round" />
        <circle cx="16" cy="16" r="2.6" fill="var(--accent)" />
      </svg>
    </span>
  `;
}

function getCharacterSvg(type, size = 56) {
  if (type === "abyss-bot") {
    return `
      <span class="char-float" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">
          <defs>
            <linearGradient id="abyssBotGrad" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="var(--accent)" />
              <stop offset="100%" stop-color="#38bdf8" />
            </linearGradient>
          </defs>
          <line x1="32" y1="6" x2="32" y2="14" stroke="url(#abyssBotGrad)" stroke-width="3" stroke-linecap="round"/>
          <circle class="robot-antenna-dot" cx="32" cy="5" r="3.2" fill="var(--accent)"/>
          <rect x="14" y="14" width="36" height="28" rx="11" fill="var(--bg-subtle)" stroke="url(#abyssBotGrad)" stroke-width="2.8"/>
          <rect x="19" y="20" width="26" height="15" rx="6" fill="#0f172a"/>
          <circle class="robot-eye" cx="26.5" cy="27.5" r="2.7" fill="#38bdf8"/>
          <circle class="robot-eye" cx="37.5" cy="27.5" r="2.7" fill="#38bdf8"/>
          <path d="M28 32 Q32 34.5 36 32" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" fill="none"/>
          <rect x="22" y="45" width="20" height="10" rx="5" fill="var(--accent-soft)" stroke="url(#abyssBotGrad)" stroke-width="2.2"/>
          <g class="char-wave-arm">
            <path d="M50 32 L58 24" stroke="url(#abyssBotGrad)" stroke-width="3" stroke-linecap="round"/>
            <circle cx="58.5" cy="23.5" r="2.5" fill="var(--accent)"/>
          </g>
          <path d="M14 34 L7 40" stroke="url(#abyssBotGrad)" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </span>
    `;
  }
  if (type === "sleepy-ghost") {
    return `
      <span class="char-float" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">
          <path d="M16 32 C16 20 23 13 32 13 C41 13 48 20 48 32 L48 49 L42 44 L37 49 L32 44 L27 49 L22 44 L16 49 Z"
                fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.6" stroke-linejoin="round"/>
          <path d="M23 30 Q26 33 29 30" stroke="var(--text-primary)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
          <path d="M35 30 Q38 33 41 30" stroke="var(--text-primary)" stroke-width="2.2" stroke-linecap="round" fill="none"/>
          <circle cx="32" cy="36" r="2" fill="var(--accent)"/>
          <text class="char-zzz-1" x="45" y="18" fill="var(--accent)" font-size="10" font-weight="800" font-family="sans-serif">Z</text>
          <text class="char-zzz-2" x="51" y="12" fill="var(--accent)" font-size="8" font-weight="800" font-family="sans-serif">z</text>
        </svg>
      </span>
    `;
  }
  if (type === "shield-bot") {
    return `
      <span class="char-float" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">
          <path d="M32 8 L50 15 V30 C50 42 42 51 32 56 C22 51 14 42 14 30 V15 Z"
                fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.8" stroke-linejoin="round"/>
          <rect x="21" y="23" width="22" height="12" rx="5" fill="#0f172a"/>
          <circle class="robot-eye" cx="27.5" cy="29" r="2.3" fill="#f59e0b"/>
          <circle class="robot-eye" cx="36.5" cy="29" r="2.3" fill="#f59e0b"/>
          <path d="M27 42 H37" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/>
        </svg>
      </span>
    `;
  }
  if (type === "radar-bot") {
    return `
      <span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">
          <circle class="char-radar-ring" cx="32" cy="32" r="22" stroke="var(--accent)" stroke-width="2.2"/>
          <circle cx="32" cy="32" r="19" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.4"/>
          <rect class="eq-bar-1" x="23" y="25" width="3.5" height="14" rx="1.7" fill="var(--accent)"/>
          <rect class="eq-bar-2" x="30.25" y="21" width="3.5" height="22" rx="1.7" fill="var(--accent)"/>
          <rect class="eq-bar-3" x="37.5" y="25" width="3.5" height="14" rx="1.7" fill="var(--accent)"/>
        </svg>
      </span>
    `;
  }
  if (type === "arcade-bot") {
    return `
      <span class="char-float" style="width:${size}px;height:${size}px;">
        <svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none">
          <rect x="10" y="18" width="44" height="28" rx="12" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2.8"/>
          <path d="M21 28 V36 M17 32 H25" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
          <circle cx="41" cy="29" r="2.5" fill="var(--accent)"/>
          <circle cx="46" cy="34" r="2.5" fill="#0ea5e9"/>
          <circle class="robot-eye" cx="32" cy="13" r="3" fill="var(--accent)"/>
        </svg>
      </span>
    `;
  }
  return "";
}

function getMiniTabSvg(kind) {
  if (kind === "home") {
    return `<svg viewBox="0 0 32 32" width="14" height="14" fill="none"><circle cx="16" cy="16" r="12.5" stroke="var(--accent)" stroke-width="3.2" /><path d="M9.5 19.5C12.5 13.5 16.5 22.5 22.5 12.5" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" /><circle cx="16" cy="16" r="2.5" fill="var(--accent)" /></svg>`;
  }
  if (kind === "settings") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--accent)" stroke-width="2.2" fill="none"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  }
  if (kind === "history") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--accent)" stroke-width="2.2" fill="none"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>`;
  }
  if (kind === "blocker") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--warning)" stroke-width="2.2" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }
  if (kind === "search") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--accent)" stroke-width="2.2" fill="none"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.2" y2="16.2"/></svg>`;
  }
  if (kind === "mp4") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--danger)" stroke-width="2.2" fill="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }
  if (kind === "app") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--accent)" stroke-width="2.2" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>`;
  }
  if (kind === "sleep") {
    return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--text-muted)" stroke-width="2.2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" width="13" height="13" stroke="var(--accent)" stroke-width="2.2" fill="none"><circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>`;
}

// ==================== SYNTHESIZED ROBOT SOUND EFFECTS ====================
let audioCtx = null;
function playRobotSound(type = "click") {
  if (!state.settings.soundEffects) return;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (!audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    if (type === "chime") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === "denied") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(165, now + 0.08);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.03);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc.start(now);
      osc.stop(now + 0.035);
    }
  } catch {
    // Ignore autoplay restrictions
  }
}

// ==================== SAFE CLIPBOARD COPY ====================
function safeCopyText(text, sourceElId = null, feedbackElId = null) {
  const showMsg = (msg, isWarn = false) => {
    if (!feedbackElId) return;
    const fb = document.getElementById(feedbackElId);
    if (fb) {
      fb.textContent = msg;
      fb.style.color = isWarn ? "var(--warning)" : "var(--success)";
    }
  };
  if (sourceElId) {
    const el = document.getElementById(sourceElId);
    if (el) {
      el.focus();
      if (typeof el.select === "function") el.select();
    }
  }
  const tryExecCommand = () => {
    try {
      const temp = document.createElement("textarea");
      temp.value = text;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.appendChild(temp);
      temp.focus();
      temp.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(temp);
      if (ok) {
        playRobotSound("click");
        showMsg("Copied to clipboard!");
        return true;
      }
    } catch {
      // Blocked by frame policy
    }
    showMsg("Highlighted - press Ctrl+C (or Cmd+C) to copy.", true);
    return false;
  };
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(text)
      .then(() => {
        playRobotSound("click");
        showMsg("Copied to clipboard!");
      })
      .catch(() => {
        tryExecCommand();
      });
  } else {
    tryExecCommand();
  }
}

// ==================== DIRECT SITE PERMISSION TOAST ====================
function showSitePermissionToast(originLabel, permissionText, onDecision) {
  const toast = document.getElementById("site-permission-toast");
  document.getElementById("perm-toast-origin").textContent = `${originLabel} wants to`;
  document.getElementById("perm-toast-body").textContent = permissionText;
  state.pendingPermissionCallback = onDecision;
  toast.classList.remove("hidden");
  playRobotSound("click");
}

function hideSitePermissionToast() {
  document.getElementById("site-permission-toast").classList.add("hidden");
  state.pendingPermissionCallback = null;
}

document.getElementById("perm-toast-allow").addEventListener("click", () => {
  const cb = state.pendingPermissionCallback;
  hideSitePermissionToast();
  if (cb) cb(true);
});

document.getElementById("perm-toast-block").addEventListener("click", () => {
  const cb = state.pendingPermissionCallback;
  hideSitePermissionToast();
  if (cb) cb(false);
});

document.getElementById("perm-toast-close").addEventListener("click", hideSitePermissionToast);

// ==================== TAB, SLEEP & ZERO-REFRESH NAVIGATION ENGINE ====================
function touchActivity() {
  state.lastActivityAt = Date.now();
}

function getPaneSignature(tab) {
  const entry = getCurrentEntry(tab);
  const p = entry.payload || {};
  return JSON.stringify({
    idx: tab.historyIndex,
    route: entry.route,
    title: entry.title,
    url: p.originalUrl || "",
    embed: p.embedUrl || "",
    mode: p.viewMode || "",
    searchMode: p.searchMode || "web",
    clean: p.proxyClean !== false,
    q: p.query || "",
    appId: p.appId || "",
    customRoute: p.customRoute || "",
    sec: entry.route === "abyss://settings" ? state.activeSettingsSection : ""
  });
}

function focusActiveTabFrame() {
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.id === "omnibox-input" || activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
    return;
  }
  const tab = getActiveTab();
  if (!tab || tab.sleeping) return;
  const pane = document.querySelector(`.tab-pane[data-tab-id="${tab.id}"]`);
  const iframe = pane?.querySelector("iframe");
  if (iframe) {
    try { iframe.focus(); } catch {}
  }
}

function createTab(route = "abyss://home", title = "Abyss Home", payload = null, switchTo = true) {
  touchActivity();
  const id = "tab_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  const tab = {
    id,
    title,
    historyStack: [{ route, title, payload }],
    historyIndex: 0,
    lastActiveAt: Date.now(),
    sleeping: false,
    scrollTop: 0
  };
  state.tabs.push(tab);
  recordGlobalHistory(title, payload?.customRoute || payload?.originalUrl || route);
  if (switchTo) state.activeTabId = id;
  savePersistentState();
  renderAll();
  return tab;
}

function getActiveTab() {
  return state.tabs.find(t => t.id === state.activeTabId) || state.tabs[0];
}

function getCurrentEntry(tab = getActiveTab()) {
  if (!tab || !tab.historyStack || !tab.historyStack.length) {
    return { route: "abyss://home", title: "Abyss Home", payload: null };
  }
  const safeIdx = Math.max(0, Math.min(tab.historyIndex, tab.historyStack.length - 1));
  return tab.historyStack[safeIdx];
}

function navigateTab(route, title, payload = null) {
  touchActivity();
  playRobotSound("click");
  state.isGameFullscreen = false;
  const tab = getActiveTab();
  tab.sleeping = false;
  tab.lastActiveAt = Date.now();
  tab.scrollTop = 0;

  const blockerMatch = findAbyssBlockerMatch(route + " " + title + " " + (payload?.originalUrl || ""));
  if (state.settings.abyssBlocker?.enabled && blockerMatch) {
    route = "abyss://blocked";
    title = "Blocked by Abyss.Blocker";
    payload = { query: payload?.originalUrl || title };
  }

  tab.historyStack = tab.historyStack.slice(0, tab.historyIndex + 1);
  tab.historyStack.push({ route, title, payload });
  tab.historyIndex = tab.historyStack.length - 1;
  tab.title = title;
  delete renderedPaneSignatures[tab.id];
  recordGlobalHistory(title, payload?.customRoute || payload?.originalUrl || route);
  triggerProgressBar();
  savePersistentState();
  renderAll();
}

function openOrFocusSpecialTab(route, title, payload = null) {
  touchActivity();
  playRobotSound("click");
  const existing = state.tabs.find(t => {
    const cur = getCurrentEntry(t);
    if (route === "abyss://perm-app" && payload?.appId) {
      return cur.route === "abyss://perm-app" && cur.payload?.appId === payload.appId;
    }
    return cur.route === route;
  });
  if (existing) {
    existing.lastActiveAt = Date.now();
    state.activeTabId = existing.id;
    savePersistentState();
    renderAll();
  } else {
    createTab(route, title, payload, true);
  }
}

function switchTab(tabId) {
  touchActivity();
  playRobotSound("click");
  const prevTab = getActiveTab();
  const prevPane = prevTab ? document.querySelector(`.tab-pane[data-tab-id="${prevTab.id}"]`) : null;
  if (prevPane && prevTab) {
    prevTab.scrollTop = prevPane.scrollTop || 0;
  }
  state.isGameFullscreen = false;
  state.activeTabId = tabId;
  const tab = getActiveTab();
  if (tab) {
    tab.lastActiveAt = Date.now();
  }
  savePersistentState();
  renderAll(false);
  setTimeout(focusActiveTabFrame, 40);
}

function wakeTab(tabId) {
  const tab = state.tabs.find(t => t.id === tabId);
  if (tab) {
    tab.sleeping = false;
    tab.lastActiveAt = Date.now();
    playRobotSound("click");
    savePersistentState();
    renderAll(false);
    setTimeout(focusActiveTabFrame, 40);
  }
}

function sleepInactiveTabsNow() {
  let count = 0;
  state.tabs.forEach(t => {
    if (t.id !== state.activeTabId && !t.sleeping) {
      t.sleeping = true;
      count++;
    }
  });
  playRobotSound("click");
  savePersistentState();
  renderTabStrip();
  syncAllTabPanes(false);
  return count;
}

function closeTab(tabId, e) {
  if (e) e.stopPropagation();
  playRobotSound("click");
  const idx = state.tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  state.tabs.splice(idx, 1);
  delete renderedPaneSignatures[tabId];
  const pane = document.querySelector(`.tab-pane[data-tab-id="${tabId}"]`);
  if (pane) pane.remove();
  if (state.tabs.length === 0) {
    createTab("abyss://home", "Abyss Home");
    return;
  }
  if (state.activeTabId === tabId) {
    state.activeTabId = state.tabs[Math.max(0, idx - 1)].id;
  }
  savePersistentState();
  renderAll(false);
}

function goBack() {
  const tab = getActiveTab();
  if (tab.historyIndex > 0) {
    playRobotSound("click");
    tab.historyIndex--;
    tab.title = getCurrentEntry(tab).title;
    delete renderedPaneSignatures[tab.id];
    triggerProgressBar();
    savePersistentState();
    renderAll(true);
  }
}

function goForward() {
  const tab = getActiveTab();
  if (tab.historyIndex < tab.historyStack.length - 1) {
    playRobotSound("click");
    tab.historyIndex++;
    tab.title = getCurrentEntry(tab).title;
    delete renderedPaneSignatures[tab.id];
    triggerProgressBar();
    savePersistentState();
    renderAll(true);
  }
}

function reloadCurrentTab() {
  playRobotSound("click");
  const tab = getActiveTab();
  tab.sleeping = false;
  delete renderedPaneSignatures[tab.id];
  const icon = document.getElementById("reload-icon");
  icon.classList.remove("spin-once");
  void icon.offsetWidth;
  icon.classList.add("spin-once");
  triggerProgressBar();
  savePersistentState();
  renderViewport(true);
}

function recordGlobalHistory(title, route) {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  state.historyLog.unshift({ id: Date.now() + Math.random(), title, route, time });
  savePersistentState();
}

function triggerProgressBar() {
  const bar = document.getElementById("progress-fill");
  bar.style.width = "40%";
  setTimeout(() => { bar.style.width = "85%"; }, 80);
  setTimeout(() => { bar.style.width = "100%"; }, 190);
  setTimeout(() => { bar.style.width = "0%"; }, 380);
}

// Background Timers: Tab Sleep + Auto-Clear History
setInterval(() => {
  if (state.settings.tabSleepEnabled && state.settings.tabSleepSeconds > 0) {
    const timeoutMs = state.settings.tabSleepSeconds * 1000;
    let changed = false;
    state.tabs.forEach(t => {
      if (t.id !== state.activeTabId && !t.sleeping && Date.now() - t.lastActiveAt > timeoutMs) {
        t.sleeping = true;
        changed = true;
      }
    });
    if (changed) {
      savePersistentState();
      renderTabStrip();
      syncAllTabPanes(false);
    }
  }
  const idleMode = state.settings.autoClearHistory;
  if ((idleMode === "5min" || idleMode === "15min" || idleMode === "60min") && state.historyLog.length > 0) {
    const mins = idleMode === "5min" ? 5 : idleMode === "15min" ? 15 : 60;
    if (Date.now() - state.lastActivityAt >= mins * 60 * 1000) {
      state.historyLog = [];
      savePersistentState();
      if (getCurrentEntry().route === "abyss://history") renderViewport(true);
    }
  }
}, 5000);

window.addEventListener("beforeunload", () => {
  if (state.settings.autoClearHistory === "onclose") {
    state.historyLog = [];
  }
  savePersistentState();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    savePersistentState();
  }
});

// Listen for safe link navigation from inside proxied pages
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "ABYSS_NAVIGATE" && typeof event.data.url === "string") {
    handleUserSearchOrUrl(event.data.url);
  }
});

// ==================== SMART URL RESOLVER & CRASH-PROOF PROXY ENGINE ====================
const VALID_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "co", "app", "dev",
  "gg", "tv", "me", "xyz", "ai", "uk", "ca", "de", "jp", "fr", "au", "us",
  "info", "biz", "site", "online", "tech", "game", "games", "club", "live",
  "wiki", "to", "cc", "sh", "so", "fm", "ly", "gl", "be", "it", "es", "nl",
  "se", "no", "fi", "pl", "br", "mx", "in", "kr", "cn", "tw", "nz", "za",
  "ch", "at", "ie", "pt", "gr", "cz", "hu", "ro", "ua", "il", "sg", "hk",
  "my", "ph", "id", "th", "vn", "ae", "sa", "store", "blog", "news", "pro"
]);

function isLikelyWebUrl(raw) {
  const input = raw.trim();
  if (!input || input.includes(" ")) return false;
  if (/^(https?:\/\/|file:\/\/\/|abyss:\/\/)/i.test(input)) return true;
  if (/^localhost(:\d+)?(\/.*)?$/i.test(input)) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(input)) return true;
  const hostPart = input.split("/")[0].split("?")[0].split("#")[0].split(":")[0].toLowerCase();
  if (!hostPart.includes(".")) return false;
  const parts = hostPart.split(".");
  if (parts.some(p => !p.length)) return false;
  const tld = parts[parts.length - 1];
  if (/^\d+$/.test(tld)) return false;
  return VALID_TLDS.has(tld);
}

function extractSearchEngineQuery(urlObj) {
  const host = urlObj.hostname.toLowerCase();
  const path = urlObj.pathname.toLowerCase();
  if ((host.includes("google.") || host.includes("bing.com") || host.includes("yahoo.com")) && path.includes("/search")) {
    return urlObj.searchParams.get("q") || urlObj.searchParams.get("p") || "";
  }
  if (host.includes("duckduckgo.com") && urlObj.searchParams.get("q")) {
    return urlObj.searchParams.get("q") || "";
  }
  if (host.includes("youtube.com") && path.startsWith("/results")) {
    return urlObj.searchParams.get("search_query") || "";
  }
  return "";
}

function findAbyssBlockerMatch(raw) {
  const blocker = state.settings.abyssBlocker;
  if (!blocker || !blocker.enabled || !Array.isArray(blocker.blockedSites)) return null;
  const lower = String(raw || "").toLowerCase();
  return blocker.blockedSites.find(term => term && lower.includes(term.toLowerCase())) || null;
}

function extractYoutubeVideoId(rawUrl) {
  const input = String(rawUrl || "").trim();
  if (!input) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const withProto = /^https?:\/\//i.test(input) ? input : "https://" + input;
    const parsed = new URL(withProto);
    const host = parsed.hostname.toLowerCase();
    if (host === "youtu.be") {
      return parsed.pathname.slice(1).split("/")[0] || "";
    }
    if (host.includes("youtube.com")) {
      if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] || "";
      if (parsed.pathname.startsWith("/live/")) return parsed.pathname.split("/")[2] || "";
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] || "";
    }
  } catch {}
  return "";
}

function convertToEmbeddableUrl(rawUrl) {
  let url = /^https?:\/\//i.test(rawUrl) ? rawUrl : "https://" + rawUrl;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // YouTube video links open in the YouTube to .MP4 Converter & Player
    if (host.includes("youtube.com") || host === "youtu.be") {
      const extractedSearch = extractSearchEngineQuery(parsed);
      if (extractedSearch) {
        return {
          isSearchRedirect: true,
          query: extractedSearch
        };
      }
      const vid = extractYoutubeVideoId(url);
      if (vid) {
        return {
          isYoutubeMp4Converter: true,
          videoId: vid,
          originalUrl: url,
          title: `YouTube to .MP4 (${vid})`
        };
      }
      return {
        isSearchRedirect: true,
        query: "YouTube"
      };
    }

    const extractedQuery = extractSearchEngineQuery(parsed);
    if (extractedQuery) {
      return {
        isSearchRedirect: true,
        query: extractedQuery
      };
    }

    // GitHub Repository Smart Handler
    if (host === "github.com" || host === "www.github.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length >= 2 && !["settings", "login", "signup", "explore", "topics", "marketplace"].includes(segments[0])) {
        return {
          isGithubRepo: true,
          repoOwner: segments[0],
          repoName: segments[1],
          embedUrl: url,
          originalUrl: url,
          title: `${segments[0]}/${segments[1]} - GitHub`
        };
      }
    }

    // Wikipedia -> Mobile Wikipedia via safe proxy/reader
    if (host === "en.wikipedia.org") {
      const mobileUrl = url.replace("://en.wikipedia.org", "://en.m.wikipedia.org");
      return {
        embedUrl: mobileUrl,
        originalUrl: mobileUrl,
        title: decodeURIComponent(parsed.pathname.split("/").pop() || "Wikipedia").replace(/_/g, " ")
      };
    }

    return {
      embedUrl: url,
      originalUrl: url,
      title: host
    };
  } catch {
    return {
      embedUrl: url,
      originalUrl: url,
      title: rawUrl
    };
  }
}

function handleUserSearchOrUrl(rawInput, forceNewTab = false) {
  const input = rawInput.trim();
  if (!input) return;
  hideOmniboxSuggestions();

  // Check custom app links (e.g. abyss://app/my-youtube)
  if (input.toLowerCase().startsWith("abyss://app/")) {
    const matchedApp = state.customApps.find(
      a => (a.customRoute || "").toLowerCase() === input.toLowerCase()
    );
    if (matchedApp) {
      launchCustomApp(matchedApp.id, forceNewTab);
      return;
    }
  }

  if (input.startsWith("abyss://")) {
    if (input === "abyss://blocker" || input === "abyss://restrictions") {
      setSettingsSection("blocker");
      openOrFocusSpecialTab("abyss://settings", "Settings");
      return;
    }
    if (input === "abyss://yt-mp4") {
      if (forceNewTab) createTab("abyss://yt-mp4", "YouTube to .MP4", {});
      else navigateTab("abyss://yt-mp4", "YouTube to .MP4", {});
      return;
    }
    const routeMap = {
      "abyss://home": "Abyss Home",
      "abyss://settings": "Settings",
      "abyss://history": "History",
      "abyss://apps": "My Local Apps"
    };
    const title = routeMap[input] || "Abyss Page";
    if (forceNewTab) createTab(input, title);
    else navigateTab(input, title);
    return;
  }

  const blockerMatch = findAbyssBlockerMatch(input);
  if (state.settings.abyssBlocker?.enabled && blockerMatch) {
    navigateTab("abyss://blocked", "Blocked by Abyss.Blocker", { query: input });
    return;
  }

  if (input.startsWith("file:///")) {
    navigateTab("abyss://local-app", "Local File Launcher", { customPath: input });
    return;
  }

  if (isLikelyWebUrl(input)) {
    const info = convertToEmbeddableUrl(input);
    if (info.isSearchRedirect) {
      handleUserSearchOrUrl(info.query, forceNewTab);
      return;
    }
    if (info.isYoutubeMp4Converter) {
      const payload = { videoUrl: info.originalUrl, videoId: info.videoId };
      if (forceNewTab) createTab("abyss://yt-mp4", info.title, payload);
      else navigateTab("abyss://yt-mp4", info.title, payload);
      return;
    }

    let initialMode = state.settings.defaultWebMode;
    if (initialMode === "auto") {
      initialMode = info.isGithubRepo ? "github" : "live";
    }
    if (initialMode !== "proxy" && initialMode !== "github") initialMode = "live";
    const payload = {
      ...info,
      viewMode: initialMode, // "live" | "proxy" | "github"
      proxyClean: true
    };
    if (forceNewTab || state.settings.openLinksInNewTab) {
      createTab("abyss://web", info.title, payload);
    } else {
      navigateTab("abyss://web", info.title, payload);
    }
    if (state.settings.voicePermission === "allow" && state.settings.voiceReadback) {
      speakText(`Opening ${info.title}`);
    }
  } else {
    const payload = { query: input, searchMode: "web" };
    if (forceNewTab || state.settings.openLinksInNewTab) {
      createTab("abyss://search", `${input} - Abyss Search`, payload);
    } else {
      navigateTab("abyss://search", `${input} - Abyss Search`, payload);
    }
    if (state.settings.voicePermission === "allow" && state.settings.voiceReadback) {
      speakText(`Searching inside Abyss for ${input}`);
    }
  }
}

// ==================== SPEAKER & VOICE SEARCH (ENTERS INTO SEARCH BAR) ====================
let activeRecognition = null;

function handleSpeakerClick() {
  const perm = state.settings.voicePermission;
  const activeEntry = getCurrentEntry();
  const originLabel = activeEntry.payload?.customRoute || activeEntry.payload?.title || activeEntry.route || "abyss://home";
  if (perm === "ask") {
    showSitePermissionToast(
      originLabel,
      "Use your microphone & speaker for Voice Search",
      (allowed) => {
        state.settings.voicePermission = allowed ? "allow" : "block";
        savePersistentState();
        renderToolbar();
        if (allowed) {
          playRobotSound("chime");
          startVoiceCapture();
        } else {
          playRobotSound("denied");
        }
      }
    );
    return;
  }
  if (perm === "block") {
    showSitePermissionToast(
      originLabel,
      "Speaker & microphone are currently blocked - Allow now?",
      (allowed) => {
        state.settings.voicePermission = allowed ? "allow" : "block";
        savePersistentState();
        renderToolbar();
        if (allowed) {
          playRobotSound("chime");
          startVoiceCapture();
        }
      }
    );
    return;
  }
  startVoiceCapture();
}

function syncSpokenTextToSearchBars(text) {
  const omni = document.getElementById("omnibox-input");
  const clearBtn = document.getElementById("omnibox-clear-btn");
  const activePane = document.querySelector(`.tab-pane[data-tab-id="${state.activeTabId}"]`);
  const hero = activePane?.querySelector("#hero-search-input") || document.getElementById("hero-search-input");
  const liveBox = document.getElementById("voice-live-text");
  if (omni) omni.value = text;
  if (clearBtn) clearBtn.classList.toggle("hidden", !text);
  if (hero) hero.value = text;
  if (liveBox) liveBox.textContent = text || "Listening... speak now...";
}

function startVoiceCapture() {
  const modal = document.getElementById("voice-modal");
  const content = document.getElementById("voice-modal-content");
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRec) {
    content.innerHTML = `
      ${getCharacterSvg("radar-bot", 66)}
      <h3 style="margin:8px 0 4px;">Voice Dictation Bar</h3>
      <p style="font-size:12.5px;color:var(--text-secondary);margin-bottom:12px;">
        Your browser frame does not expose hardware SpeechRecognition. Type below to dictate directly into the Abyss search bar:
      </p>
      <input type="text" class="text-input" id="sim-voice-input" style="width:100%;margin-bottom:14px;"
        oninput="syncSpokenTextToSearchBars(this.value)"
        placeholder="Speak or type your search..." />
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="closeVoiceModal()">Cancel</button>
        <button class="btn btn-sm" onclick="finishVoiceIntoBarOnly()">Put in Search Bar</button>
        <button class="btn btn-sm btn-primary" onclick="submitSimulatedVoice()">Search Now</button>
      </div>
    `;
    modal.classList.remove("hidden");
    setTimeout(() => document.getElementById("sim-voice-input")?.focus(), 50);
    return;
  }

  content.innerHTML = `
    ${getCharacterSvg("radar-bot", 68)}
    <h3 style="margin:8px 0 4px;">Listening to Voice...</h3>
    <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Words appear live inside your Abyss search bar as you speak
    </p>
    <div id="voice-live-text" style="background:var(--bg-subtle);border:1px solid var(--border-light);border-radius:10px;padding:10px 12px;font-size:13.5px;font-weight:600;color:var(--accent);min-height:42px;margin-bottom:14px;">
      Speak now...
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <button class="btn btn-sm" onclick="closeVoiceModal()">Cancel</button>
      <button class="btn btn-sm" onclick="finishVoiceIntoBarOnly()">Keep in Search Bar</button>
      <button class="btn btn-sm btn-primary" onclick="runCurrentSpokenQuery()">Search Now</button>
    </div>
  `;
  modal.classList.remove("hidden");

  try {
    if (activeRecognition) {
      activeRecognition.abort();
    }
    const recognition = new SpeechRec();
    activeRecognition = recognition;
    recognition.lang = state.settings.voiceLang || "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += piece;
        else interim += piece;
      }
      const latestTranscript = (finalChunk || interim).trim();
      syncSpokenTextToSearchBars(latestTranscript);
      if (finalChunk.trim()) {
        playRobotSound("chime");
        setTimeout(() => {
          closeVoiceModal();
          if (state.settings.voiceAutoSubmit) {
            handleUserSearchOrUrl(finalChunk.trim());
          } else {
            focusBestSearchBar();
          }
        }, 380);
      }
    };

    recognition.onerror = (err) => {
      const el = document.getElementById("voice-live-text");
      if (el) {
        el.style.color = "var(--warning)";
        el.textContent = `Mic notice (${err.error || "unavailable"}): You can type directly into the search bar.`;
      }
    };

    recognition.start();
  } catch {
    closeVoiceModal();
  }
}

function focusBestSearchBar() {
  const activePane = document.querySelector(`.tab-pane[data-tab-id="${state.activeTabId}"]`);
  const hero = activePane?.querySelector("#hero-search-input");
  const omni = document.getElementById("omnibox-input");
  const target = hero || omni;
  if (target) {
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  }
}

function finishVoiceIntoBarOnly() {
  const omniVal = document.getElementById("omnibox-input")?.value || document.getElementById("sim-voice-input")?.value || "";
  closeVoiceModal();
  syncSpokenTextToSearchBars(omniVal);
  focusBestSearchBar();
}

function runCurrentSpokenQuery() {
  const omniVal = document.getElementById("omnibox-input")?.value || "";
  closeVoiceModal();
  if (omniVal.trim()) handleUserSearchOrUrl(omniVal.trim());
}

function submitSimulatedVoice() {
  const val = document.getElementById("sim-voice-input")?.value || "";
  closeVoiceModal();
  syncSpokenTextToSearchBars(val);
  if (val.trim()) handleUserSearchOrUrl(val.trim());
}

function speakText(text) {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = state.settings.voiceRate || 1.0;
      utter.lang = state.settings.voiceLang || "en-US";
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore TTS error
    }
  }
}

function closeVoiceModal() {
  if (activeRecognition) {
    try { activeRecognition.stop(); } catch {}
    activeRecognition = null;
  }
  document.getElementById("voice-modal").classList.add("hidden");
}

// ==================== ZERO-REFRESH MULTI-PANE RENDERING ENGINE ====================
function applyThemeAndPreferences() {
  const root = document.documentElement;
  root.setAttribute("data-theme", state.settings.theme);
  root.setAttribute("data-accent", state.settings.accent);
  root.setAttribute("data-cursor", state.settings.cursorStyle);
  root.setAttribute("data-font", state.settings.fontFamily || "sans");

  if (state.settings.accent === "custom" && state.customAccentHex) {
    root.style.setProperty("--accent", state.customAccentHex);
    root.style.setProperty("--accent-hover", state.customAccentHex);
    root.style.setProperty("--accent-soft", state.customAccentHex + "22");
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-hover");
    root.style.removeProperty("--accent-soft");
  }
}

function renderAll(forceActiveRebuild = false) {
  applyThemeAndPreferences();
  renderTabStrip();
  renderToolbar();
  renderViewport(forceActiveRebuild);
}

function renderTabStrip() {
  const container = document.getElementById("tabs-list");
  container.innerHTML = state.tabs.map(tab => {
    const isActive = tab.id === state.activeTabId;
    const entry = getCurrentEntry(tab);
    let kind = "web";
    if (entry.route === "abyss://home") kind = "home";
    else if (entry.route === "abyss://settings") kind = "settings";
    else if (entry.route === "abyss://history") kind = "history";
    else if (entry.route === "abyss://blocked") kind = "blocker";
    else if (entry.route === "abyss://search") kind = "search";
    else if (entry.route === "abyss://yt-mp4") kind = "mp4";
    else if (entry.route.startsWith("abyss://local-app") || entry.route === "abyss://perm-app" || entry.route === "abyss://apps") kind = "app";
    if (tab.sleeping) kind = "sleep";

    return `
      <div class="browser-tab ${isActive ? "active" : ""} ${tab.sleeping ? "sleeping" : ""}" onclick="switchTab('${tab.id}')" title="${escapeAttr(tab.title)}">
        <span class="tab-icon-slot">${getMiniTabSvg(kind)}</span>
        <span class="tab-title">${escapeHtml(tab.title)}</span>
        <button class="tab-close" onclick="closeTab('${tab.id}', event)" title="Close tab">&times;</button>
      </div>
    `;
  }).join("");
}

function renderToolbar() {
  const tab = getActiveTab();
  const entry = getCurrentEntry(tab);
  document.getElementById("btn-back").disabled = tab.historyIndex <= 0;
  document.getElementById("btn-forward").disabled = tab.historyIndex >= tab.historyStack.length - 1;

  const omnibox = document.getElementById("omnibox-input");
  const clearBtn = document.getElementById("omnibox-clear-btn");
  const modeBadge = document.getElementById("omnibox-mode-badge");

  if (document.activeElement !== omnibox) {
    const currentUrlOrQuery = entry.route === "abyss://home"
      ? ""
      : (entry.payload?.customRoute || entry.payload?.originalUrl || entry.payload?.query || entry.route);
    omnibox.value = currentUrlOrQuery;
  }
  if (clearBtn) {
    clearBtn.classList.toggle("hidden", !omnibox.value);
  }
  if (modeBadge) {
    modeBadge.className = "omnibox-mode-badge";
    if (entry.route === "abyss://home") {
      modeBadge.textContent = "HOME";
    } else if (entry.route === "abyss://settings") {
      modeBadge.textContent = "SETTINGS";
    } else if (entry.route === "abyss://blocked") {
      modeBadge.textContent = "BLOCKED";
      modeBadge.classList.add("is-blocked");
    } else if (entry.route === "abyss://search") {
      modeBadge.textContent = "SEARCH";
    } else if (entry.route === "abyss://yt-mp4") {
      modeBadge.textContent = "YT MP4";
      modeBadge.classList.add("is-yt");
    } else if (entry.route === "abyss://perm-app") {
      modeBadge.textContent = "CUSTOM APP";
      modeBadge.classList.add("is-app");
    } else if (entry.route === "abyss://web") {
      const vm = entry.payload?.viewMode;
      if (vm === "proxy") {
        modeBadge.textContent = "SAFE VIEW";
        modeBadge.classList.add("is-proxy");
      } else if (vm === "reader") {
        modeBadge.textContent = "READER";
      } else if (vm === "github") {
        modeBadge.textContent = "GITHUB";
      } else {
        modeBadge.textContent = "WEB";
      }
    } else {
      modeBadge.textContent = "ABYSS";
    }
  }

  const bmBtn = document.getElementById("omnibox-bookmark-btn");
  const isBookmarked = entry.route === "abyss://web" && state.quickSites.some(s => s.url === entry.payload?.originalUrl);
  if (isBookmarked) {
    bmBtn.classList.add("bookmarked");
    bmBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.1" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  } else {
    bmBtn.classList.remove("bookmarked");
    bmBtn.innerHTML = `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="2.1" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  }

  const speakerBtn = document.getElementById("nav-speaker-btn");
  if (state.settings.voicePermission === "allow") {
    speakerBtn.classList.remove("locked");
    speakerBtn.classList.add("unlocked");
  } else {
    speakerBtn.classList.add("locked");
    speakerBtn.classList.remove("unlocked");
  }

  const gear = document.querySelector(".cog-gear-ring");
  if (gear) {
    gear.style.animationPlayState = state.settings.robotAnimation === "off" ? "paused" : "running";
  }
}

function buildPaneBodyHtml(tab) {
  const entry = getCurrentEntry(tab);
  switch (entry.route) {
    case "abyss://home":
      return renderHomeView();
    case "abyss://web":
      return renderInAppWebView(entry.payload, tab.id);
    case "abyss://search":
      return renderInAppSearchView(entry.payload, tab.id);
    case "abyss://yt-mp4":
      return renderYoutubeMp4ConverterView(entry.payload);
    case "abyss://perm-app":
      return renderPermanentCustomAppPageView(entry.payload);
    case "abyss://settings":
      return renderCompactSettingsView();
    case "abyss://history":
      return renderHistoryTabView();
    case "abyss://apps":
      return renderAppsManagerTabView();
    case "abyss://local-app":
      return renderLocalAppRunnerView(entry.payload);
    case "abyss://blocked":
      return renderBlockedView(entry.payload);
    default:
      return renderHomeView();
  }
}

function hydratePaneEvents(pane, tab) {
  const entry = getCurrentEntry(tab);
  if (entry.route === "abyss://home") {
    const form = pane.querySelector(".hero-search-form");
    const input = pane.querySelector("#hero-search-input");
    if (form && input) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        handleUserSearchOrUrl(input.value);
      });
    }
    updateClockWidget();
  } else if (entry.route === "abyss://web") {
    if (entry.payload.viewMode === "reader") {
      entry.payload.viewMode = "live";
      const legacyReaderFrame = pane.querySelector(`#proxy-web-iframe-${tab.id}`);
      if (legacyReaderFrame) legacyReaderFrame.src = entry.payload.originalUrl;
    } else if (entry.payload.viewMode === "github") {
      loadGithubRepoInApp(entry.payload, tab.id);
    } else if (entry.payload.viewMode === "live") {
      const liveFrame = pane.querySelector(`#proxy-web-iframe-${tab.id}`);
      if (liveFrame) liveFrame.src = entry.payload.originalUrl;
    } else {
      loadProxiedPageIntoFrame(entry.payload.originalUrl, tab.id, entry.payload.proxyClean !== false);
    }
  } else if (entry.route === "abyss://search") {
    fetchInAppSearchResults(entry.payload.query, tab.id, entry.payload.searchMode || "web");
  } else if (entry.route === "abyss://yt-mp4") {
    if (entry.payload?.videoUrl) {
      analyzeYoutubeLinkForMp4(entry.payload.videoUrl);
    }
  }
}

function syncAllTabPanes(forceActiveRebuild = false) {
  const viewport = document.getElementById("viewport");
  const validIds = new Set(state.tabs.map(t => t.id));
  Array.from(viewport.querySelectorAll(".tab-pane")).forEach(el => {
    if (!validIds.has(el.dataset.tabId)) {
      el.remove();
    }
  });

  state.tabs.forEach(tab => {
    let pane = viewport.querySelector(`.tab-pane[data-tab-id="${tab.id}"]`);
    if (!pane) {
      pane = document.createElement("div");
      pane.className = "tab-pane";
      pane.dataset.tabId = tab.id;
      pane.innerHTML = `
        <div class="sleep-banner hidden"></div>
        <div class="tab-pane-body"></div>
      `;
      pane.addEventListener("scroll", () => {
        tab.scrollTop = pane.scrollTop;
      }, { passive: true });
      viewport.appendChild(pane);
    }

    const isActive = tab.id === state.activeTabId;
    pane.classList.toggle("active", isActive);
    const sleepEl = pane.querySelector(".sleep-banner");
    const bodyEl = pane.querySelector(".tab-pane-body");
    const entry = getCurrentEntry(tab);

    if (tab.sleeping) {
      const subUrl = entry.payload?.customRoute || entry.payload?.originalUrl || entry.payload?.query || entry.route;
      sleepEl.innerHTML = `
        ${getCharacterSvg("sleepy-ghost", 78)}
        <h2 style="margin:10px 0 6px;">Tab Sleeping to Save Memory</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">
          Abyss paused <strong>${escapeHtml(tab.title)}</strong> while inactive so your open games and tabs stay fast.
        </p>
        <p style="font-size:11.5px;color:var(--text-muted);margin-bottom:18px;word-break:break-all;">
          Saved Page: ${escapeHtml(subUrl)}
        </p>
        <button class="btn btn-primary" onclick="wakeTab('${tab.id}')">Wake Tab</button>
      `;
      sleepEl.classList.remove("hidden");
      bodyEl.classList.add("is-hidden-by-sleep");
    } else {
      sleepEl.classList.add("hidden");
      bodyEl.classList.remove("is-hidden-by-sleep");
    }

    const nextSig = getPaneSignature(tab);
    const mustBuild = !renderedPaneSignatures[tab.id] ||
      (isActive && (forceActiveRebuild || renderedPaneSignatures[tab.id] !== nextSig));

    if (mustBuild) {
      bodyEl.innerHTML = buildPaneBodyHtml(tab);
      renderedPaneSignatures[tab.id] = nextSig;
      hydratePaneEvents(pane, tab);
      if (tab.scrollTop > 0) {
        requestAnimationFrame(() => { pane.scrollTop = tab.scrollTop; });
      }
    } else if (isActive && tab.scrollTop > 0 && pane.scrollTop === 0) {
      requestAnimationFrame(() => { pane.scrollTop = tab.scrollTop; });
    }
  });
}

function renderViewport(forceActiveRebuild = true) {
  syncAllTabPanes(forceActiveRebuild);
}

// ==================== HOME SCREEN & 14 UTILITY WIDGETS (MAX 4 ACTIVE) ====================
function renderHomeView() {
  const appsHtml = state.customApps.map(app => `
    <div class="app-tile" onclick="launchCustomApp('${app.id}')">
      <div class="app-icon-circle" style="background:${app.bg};color:${app.color};">${escapeHtml(app.badge || "AP")}</div>
      <div class="app-tile-name">${escapeHtml(app.name)}</div>
      <div class="app-tile-sub">${escapeHtml(app.customRoute || app.subtitle)}</div>
    </div>
  `).join("");

  const sitesHtml = state.quickSites.map((site, idx) => `
    <div class="app-tile" onclick="handleUserSearchOrUrl('${escapeAttr(site.url)}')">
      <button class="tile-remove-btn" onclick="removeQuickSite(${idx}, event)" title="Remove Shortcut">&times;</button>
      <div class="app-icon-circle" style="background:${site.bg};color:${site.color};">${escapeHtml(site.badge || site.name.slice(0, 2).toUpperCase())}</div>
      <div class="app-tile-name">${escapeHtml(site.name)}</div>
      <div class="app-tile-sub">In-App View</div>
    </div>
  `).join("");

  const w = state.settings.widgets;
  const activeWidgetKeys = Object.keys(w).filter(k => w[k]).slice(0, MAX_ACTIVE_WIDGETS);
  const activeSet = new Set(activeWidgetKeys);

  const widgetsHtml = activeSet.size > 0 ? `
    <div class="widgets-header-bar">
      <span class="section-title">Home Utility Widgets (${activeSet.size} / ${MAX_ACTIVE_WIDGETS} Active)</span>
      <button class="section-link" onclick="setSettingsSection('widgets'); openOrFocusSpecialTab('abyss://settings', 'Settings')">+ Customize Widgets</button>
    </div>
    <div class="widgets-grid">
      ${activeSet.has("clock") ? renderClockTimerWidget() : ""}
      ${activeSet.has("notes") ? renderStickyNotesWidget() : ""}
      ${activeSet.has("calculator") ? renderCalculatorWidget() : ""}
      ${activeSet.has("todo") ? renderTodoWidget() : ""}
      ${activeSet.has("converter") ? renderConverterWidget() : ""}
      ${activeSet.has("randomizer") ? renderRandomizerWidget() : ""}
      ${activeSet.has("colorStudio") ? renderColorStudioWidget() : ""}
      ${activeSet.has("systemMonitor") ? renderSystemMonitorWidget() : ""}
      ${activeSet.has("pomodoro") ? renderPomodoroWidget() : ""}
      ${activeSet.has("weather") ? renderWeatherWidget() : ""}
      ${activeSet.has("dictionary") ? renderDictionaryWidget() : ""}
      ${activeSet.has("textTools") ? renderTextToolsWidget() : ""}
      ${activeSet.has("habits") ? renderHabitsWidget() : ""}
      ${activeSet.has("percentage") ? renderPercentageWidget() : ""}
    </div>
  ` : "";

  const blockerActive = Boolean(state.settings.abyssBlocker?.enabled);
  return `
    <div class="home-container">
      <div class="abyss-brand">
        <div class="abyss-logo-row">
          ${getAbyssCircleLogoSvg(54, "abyssGradHomePage")}
          <span class="abyss-wordmark">Abyss</span>
          ${getCharacterSvg("abyss-bot", 62)}
        </div>
        <p class="abyss-tagline">In-App Web Search, Non-Copyrighted YT-to-.MP4 &amp; Permanent Apps &bull; Abyss.Blocker: ${blockerActive ? "ON" : "OFF"}</p>
      </div>

      <form class="hero-search-form">
        <div class="hero-search-bar">
          <svg viewBox="0 0 24 24" width="19" height="19" stroke="var(--text-muted)" stroke-width="2.2" fill="none">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="hero-search-input" placeholder="Search the web, calculate math, paste a YouTube link for .MP4, or open abyss://app/..." spellcheck="false" />
          <button type="button" class="hero-voice-btn ${state.settings.voicePermission === "allow" ? "active-voice" : ""}" onclick="handleSpeakerClick()" title="Speak into Search Bar">
            <svg viewBox="0 0 24 24" width="17" height="17" stroke="currentColor" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>
          <button type="submit" class="hero-go-btn">Go</button>
        </div>
      </form>

      ${widgetsHtml}

      <div class="section-block">
        <div class="section-header">
          <span class="section-title">Permanent Apps &amp; Utilities (.HTML &amp; .ZIP)</span>
          <button class="section-link" onclick="openOrFocusSpecialTab('abyss://apps', 'My Local Apps')">+ Add Permanent App / Upload ZIP</button>
        </div>
        <div class="apps-grid">
          ${appsHtml}
          <div class="app-tile" onclick="openOrFocusSpecialTab('abyss://apps', 'My Local Apps')">
            <div class="app-icon-circle" style="background:var(--bg-subtle);color:var(--text-secondary);">+</div>
            <div class="app-tile-name">Add App</div>
            <div class="app-tile-sub">.HTML / .ZIP &rarr; Link</div>
          </div>
        </div>
      </div>

      ${state.settings.showQuickSites ? `
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">In-App Quick Sites</span>
            <div style="display:flex;gap:12px;">
              <button class="section-link" onclick="openAddQuickSiteModal()">+ Add Site</button>
              <button class="section-link" onclick="openOrFocusSpecialTab('abyss://history', 'History')">History (${state.historyLog.length}) &rarr;</button>
            </div>
          </div>
          <div class="apps-grid">
            ${sitesHtml}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderClockTimerWidget() {
  const mode = state.clockSubTab;
  let inner = "";
  if (mode === "clock") {
    inner = `
      <div>
        <div class="clock-time" id="widget-clock-time">--:--:--</div>
        <div class="clock-date" id="widget-clock-date">Loading date...</div>
      </div>
    `;
  } else if (mode === "stopwatch") {
    const secs = (state.stopwatchMs / 1000).toFixed(1);
    inner = `
      <div>
        <div class="clock-time" id="widget-sw-display">${secs}s</div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button class="btn btn-sm btn-primary" onclick="toggleStopwatch()">${state.stopwatchRunning ? "Pause" : "Start"}</button>
          <button class="btn btn-sm" onclick="resetStopwatch()">Reset</button>
        </div>
      </div>
    `;
  } else {
    const mins = String(Math.floor(state.timerRemainingSec / 60)).padStart(2, "0");
    const secs = String(state.timerRemainingSec % 60).padStart(2, "0");
    inner = `
      <div>
        <div class="clock-time" id="widget-timer-display">${mins}:${secs}</div>
        <div style="display:flex;gap:5px;margin-top:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" onclick="toggleFocusTimer()">${state.timerRunning ? "Pause" : "Start"}</button>
          <button class="btn btn-sm" onclick="setFocusTimer(300)">5m</button>
          <button class="btn btn-sm" onclick="setFocusTimer(900)">15m</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Time Suite</span>
        <div class="widget-mini-tabs">
          <button class="widget-tab-pill ${mode === "clock" ? "active" : ""}" onclick="setClockSubTab('clock')">Clock</button>
          <button class="widget-tab-pill ${mode === "stopwatch" ? "active" : ""}" onclick="setClockSubTab('stopwatch')">SW</button>
          <button class="widget-tab-pill ${mode === "timer" ? "active" : ""}" onclick="setClockSubTab('timer')">Timer</button>
        </div>
      </div>
      ${inner}
    </div>
  `;
}

function renderStickyNotesWidget() {
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Sticky Notes</span>
        <div style="display:flex;gap:4px;">
          <button class="widget-tab-pill" onclick="safeCopyText(state.stickyNote)">Copy</button>
          <button class="widget-tab-pill" onclick="state.stickyNote=''; savePersistentState(); renderViewport(true);">Clear</button>
        </div>
      </div>
      <textarea class="notes-area" oninput="state.stickyNote = this.value; savePersistentState();" placeholder="Type quick notes...">${escapeHtml(state.stickyNote)}</textarea>
    </div>
  `;
}

function renderCalculatorWidget() {
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Calculator</span>
        <span style="font-size:10.5px;color:var(--text-muted);">${escapeHtml(state.calcHistory)}</span>
      </div>
      <div class="calc-display" id="calc-display">${escapeHtml(state.calcDisplay)}</div>
      <div class="calc-keys">
        <button onclick="calcPress('7')">7</button><button onclick="calcPress('8')">8</button><button onclick="calcPress('9')">9</button><button class="calc-op" onclick="calcPress('/')">&divide;</button>
        <button onclick="calcPress('4')">4</button><button onclick="calcPress('5')">5</button><button onclick="calcPress('6')">6</button><button class="calc-op" onclick="calcPress('*')">&times;</button>
        <button onclick="calcPress('1')">1</button><button onclick="calcPress('2')">2</button><button onclick="calcPress('3')">3</button><button class="calc-op" onclick="calcPress('-')">&minus;</button>
        <button onclick="calcPress('C')">C</button><button onclick="calcPress('0')">0</button><button class="calc-eq" onclick="calcPress('=')">=</button><button class="calc-op" onclick="calcPress('+')">+</button>
      </div>
    </div>
  `;
}

function renderTodoWidget() {
  const rows = state.todoItems.map(item => `
    <div class="todo-row ${item.done ? "done" : ""}">
      <label style="display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;">
        <input type="checkbox" ${item.done ? "checked" : ""} onchange="toggleTodoItem(${item.id})" />
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.text)}</span>
      </label>
      <button style="border:none;background:none;color:var(--text-muted);cursor:pointer;" onclick="deleteTodoItem(${item.id})">&times;</button>
    </div>
  `).join("");
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Quick Tasks (${state.todoItems.filter(i => !i.done).length})</span>
        <button class="widget-tab-pill" onclick="clearDoneTodos()">Prune</button>
      </div>
      <div style="display:flex;gap:5px;">
        <input type="text" class="text-input" id="todo-new-input" style="flex:1;padding:4px 8px;font-size:12px;" placeholder="Add a task..." onkeydown="if(event.key==='Enter') addTodoItem(this)" />
        <button class="btn btn-sm btn-primary" onclick="addTodoItem(this.previousElementSibling)">+</button>
      </div>
      <div class="todo-list-box">${rows || `<span style="font-size:11.5px;color:var(--text-muted);">All tasks complete!</span>`}</div>
    </div>
  `;
}

function renderConverterWidget() {
  const c = state.converterState;
  const val = parseFloat(c.inputVal) || 0;
  let labelA = "Fahrenheit", labelB = "Celsius", out = 0;
  if (c.category === "temp") {
    labelA = "F"; labelB = "C";
    out = c.direction === "a2b" ? ((val - 32) * 5 / 9) : (val * 9 / 5 + 32);
  } else if (c.category === "length") {
    labelA = "Miles"; labelB = "KM";
    out = c.direction === "a2b" ? (val * 1.60934) : (val / 1.60934);
  } else if (c.category === "weight") {
    labelA = "Lbs"; labelB = "KG";
    out = c.direction === "a2b" ? (val * 0.453592) : (val / 0.453592);
  } else {
    labelA = "GB"; labelB = "MB";
    out = c.direction === "a2b" ? (val * 1024) : (val / 1024);
  }
  const fromUnit = c.direction === "a2b" ? labelA : labelB;
  const toUnit = c.direction === "a2b" ? labelB : labelA;
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Unit Converter</span>
        <select class="select-input" style="padding:2px 6px;font-size:11px;" onchange="state.converterState.category=this.value; renderViewport(true);">
          <option value="temp" ${c.category === "temp" ? "selected" : ""}>Temp</option>
          <option value="length" ${c.category === "length" ? "selected" : ""}>Distance</option>
          <option value="weight" ${c.category === "weight" ? "selected" : ""}>Weight</option>
          <option value="data" ${c.category === "data" ? "selected" : ""}>Data</option>
        </select>
      </div>
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
        <input type="number" class="text-input" style="width:90px;padding:5px 8px;" value="${escapeAttr(c.inputVal)}" oninput="state.converterState.inputVal=this.value; renderViewport(true);" />
        <span style="font-size:12px;font-weight:600;">${fromUnit}</span>
        <button class="btn btn-sm" onclick="state.converterState.direction = state.converterState.direction==='a2b'?'b2a':'a2b'; renderViewport(true);">&harr;</button>
      </div>
      <div style="font-size:16px;font-weight:800;color:var(--accent);">${out.toFixed(2)} ${toUnit}</div>
    </div>
  `;
}

function renderRandomizerWidget() {
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Random &amp; Dice Studio</span>
        <button class="widget-tab-pill" onclick="safeCopyText(state.randomOutput)">Copy</button>
      </div>
      <div style="font-size:15px;font-weight:700;color:var(--accent);background:var(--bg-main);border:1px solid var(--border-light);border-radius:8px;padding:7px 10px;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${escapeHtml(state.randomOutput)}
      </div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="runRandomTool('d6')">Roll D6</button>
        <button class="btn btn-sm" onclick="runRandomTool('d20')">Roll D20</button>
        <button class="btn btn-sm" onclick="runRandomTool('coin')">Coin</button>
        <button class="btn btn-sm btn-primary" onclick="runRandomTool('pass')">Key</button>
      </div>
    </div>
  `;
}

function renderColorStudioWidget() {
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Color &amp; Accent Studio</span>
        <button class="widget-tab-pill" onclick="safeCopyText(state.customAccentHex)">Copy Hex</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <input type="color" value="${escapeAttr(state.customAccentHex)}" onchange="state.customAccentHex=this.value; renderViewport(true);" style="width:42px;height:34px;border:none;background:none;cursor:pointer;" />
        <div>
          <div style="font-family:monospace;font-size:13px;font-weight:700;">${escapeHtml(state.customAccentHex.toUpperCase())}</div>
          <div style="font-size:11px;color:var(--text-muted);">Custom UI Accent</div>
        </div>
      </div>
      <button class="btn btn-sm btn-primary" onclick="updateSetting('accent', 'custom')">Apply to Abyss</button>
    </div>
  `;
}

function renderSystemMonitorWidget() {
  const sleepingCount = state.tabs.filter(t => t.sleeping).length;
  const blockedCount = (state.settings.abyssBlocker?.blockedSites || []).length;
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Tab &amp; Memory Pulse</span>
        <span style="font-size:10.5px;color:var(--success);font-weight:700;">OPTIMAL</span>
      </div>
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.55;margin-bottom:8px;">
        Open Tabs: <strong>${state.tabs.length}</strong> &bull; Sleeping: <strong>${sleepingCount}</strong><br/>
        History Items: <strong>${state.historyLog.length}</strong> &bull; Blocker Rules: <strong>${blockedCount}</strong>
      </div>
      <button class="btn btn-sm" onclick="sleepInactiveTabsNow(); renderViewport(true);">Sleep Inactive Tabs</button>
    </div>
  `;
}

// 6 Additional Home Utility Widgets
function renderPomodoroWidget() {
  const mins = String(Math.floor(state.pomodoroSec / 60)).padStart(2, "0");
  const secs = String(state.pomodoroSec % 60).padStart(2, "0");
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Pomodoro Studio (${state.pomodoroSessions})</span>
        <div class="widget-mini-tabs">
          <button class="widget-tab-pill ${state.pomodoroMode === "focus" ? "active" : ""}" onclick="setPomodoroMode('focus', 1500)">25m</button>
          <button class="widget-tab-pill ${state.pomodoroMode === "short" ? "active" : ""}" onclick="setPomodoroMode('short', 300)">5m</button>
          <button class="widget-tab-pill ${state.pomodoroMode === "long" ? "active" : ""}" onclick="setPomodoroMode('long', 900)">15m</button>
        </div>
      </div>
      <div class="clock-time" id="widget-pomo-display">${mins}:${secs}</div>
      <div style="display:flex;gap:6px;margin-top:8px;">
        <button class="btn btn-sm btn-primary" onclick="togglePomodoro()">${state.pomodoroRunning ? "Pause" : "Start Focus"}</button>
        <button class="btn btn-sm" onclick="resetPomodoro()">Reset</button>
      </div>
    </div>
  `;
}

function renderWeatherWidget() {
  const tempDisplay = state.weatherTempF !== null
    ? (state.weatherUseC ? `${Math.round((state.weatherTempF - 32) * 5 / 9)}°C` : `${Math.round(state.weatherTempF)}°F`)
    : "--°";
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Live Weather</span>
        <button class="widget-tab-pill" onclick="state.weatherUseC = !state.weatherUseC; renderViewport(true);">${state.weatherUseC ? "°F" : "°C"}</button>
      </div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div class="clock-time" style="font-size:24px;">${tempDisplay}</div>
        <div style="font-size:11.5px;color:var(--text-secondary);text-align:right;">${escapeHtml(state.weatherDesc)}</div>
      </div>
      <div style="display:flex;gap:5px;">
        <input type="text" class="text-input" style="flex:1;padding:4px 8px;font-size:12px;" value="${escapeAttr(state.weatherCity)}"
          oninput="state.weatherCity=this.value" onkeydown="if(event.key==='Enter') fetchWeatherWidget()" placeholder="City name..." />
        <button class="btn btn-sm btn-primary" onclick="fetchWeatherWidget()">Check</button>
      </div>
    </div>
  `;
}

function renderDictionaryWidget() {
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Quick Dictionary</span>
        <button class="widget-tab-pill" onclick="speakText(state.dictResult)">Speak</button>
      </div>
      <div style="display:flex;gap:5px;margin-bottom:6px;">
        <input type="text" class="text-input" style="flex:1;padding:4px 8px;font-size:12px;" value="${escapeAttr(state.dictWord)}"
          oninput="state.dictWord=this.value" onkeydown="if(event.key==='Enter') lookupDictionaryWord()" placeholder="Lookup word..." />
        <button class="btn btn-sm btn-primary" onclick="lookupDictionaryWord()">Define</button>
      </div>
      <div style="font-size:11.5px;color:var(--text-secondary);line-height:1.4;max-height:54px;overflow-y:auto;">
        ${escapeHtml(state.dictResult)}
      </div>
    </div>
  `;
}

function renderTextToolsWidget() {
  const words = state.textToolInput.trim() ? state.textToolInput.trim().split(/\s+/).length : 0;
  const chars = state.textToolInput.length;
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Text &amp; Dev Utility</span>
        <span style="font-size:10.5px;color:var(--text-muted);">${words}w &bull; ${chars}c</span>
      </div>
      <input type="text" class="text-input" style="width:100%;padding:5px 8px;font-size:12px;margin-bottom:6px;"
        value="${escapeAttr(state.textToolInput)}" oninput="state.textToolInput=this.value; renderViewport(true);"
        placeholder="Enter text to transform..." />
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        <button class="btn btn-sm" style="padding:3px 7px;font-size:11px;" onclick="runTextTool('upper')">UPPER</button>
        <button class="btn btn-sm" style="padding:3px 7px;font-size:11px;" onclick="runTextTool('lower')">lower</button>
        <button class="btn btn-sm" style="padding:3px 7px;font-size:11px;" onclick="runTextTool('b64e')">Base64+</button>
        <button class="btn btn-sm" style="padding:3px 7px;font-size:11px;" onclick="runTextTool('b64d')">Base64-</button>
        <button class="btn btn-sm btn-primary" style="padding:3px 7px;font-size:11px;" onclick="safeCopyText(state.textToolOutput || state.textToolInput)">Copy</button>
      </div>
    </div>
  `;
}

function renderHabitsWidget() {
  const rows = state.habitItems.map(h => `
    <div class="todo-row ${h.done ? "done" : ""}">
      <label style="display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;">
        <input type="checkbox" ${h.done ? "checked" : ""} onchange="toggleHabitItem(${h.id})" />
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(h.name)}</span>
      </label>
      <button style="border:none;background:none;color:var(--text-muted);cursor:pointer;" onclick="deleteHabitItem(${h.id})">&times;</button>
    </div>
  `).join("");
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Daily Habits</span>
        <button class="widget-tab-pill" onclick="resetDailyHabits()">Reset Day</button>
      </div>
      <div style="display:flex;gap:5px;">
        <input type="text" class="text-input" id="habit-new-input" style="flex:1;padding:4px 8px;font-size:12px;" placeholder="New habit..." onkeydown="if(event.key==='Enter') addHabitItem(this)" />
        <button class="btn btn-sm btn-primary" onclick="addHabitItem(this.previousElementSibling)">+</button>
      </div>
      <div class="todo-list-box">${rows || `<span style="font-size:11.5px;color:var(--text-muted);">Add a daily habit above.</span>`}</div>
    </div>
  `;
}

function renderPercentageWidget() {
  const pct = parseFloat(state.pctInputA) || 0;
  const base = parseFloat(state.pctInputB) || 0;
  const result = (pct / 100) * base;
  return `
    <div class="widget-card">
      <div class="widget-top-row">
        <span class="widget-label">Percentage &amp; Tip Solver</span>
        <span style="font-size:10.5px;color:var(--text-muted);">Total: ${(base + result).toFixed(2)}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
        <input type="number" class="text-input" style="width:66px;padding:4px 7px;" value="${escapeAttr(state.pctInputA)}" oninput="state.pctInputA=this.value; renderViewport(true);" />
        <span style="font-size:12px;font-weight:700;">% of</span>
        <input type="number" class="text-input" style="flex:1;padding:4px 7px;min-width:60px;" value="${escapeAttr(state.pctInputB)}" oninput="state.pctInputB=this.value; renderViewport(true);" />
      </div>
      <div style="font-size:16px;font-weight:800;color:var(--accent);">= ${result.toFixed(2)}</div>
    </div>
  `;
}

// Widget Actions
function setClockSubTab(sub) {
  playRobotSound("click");
  state.clockSubTab = sub;
  renderViewport(true);
}

function toggleStopwatch() {
  playRobotSound("click");
  state.stopwatchRunning = !state.stopwatchRunning;
  renderViewport(true);
}

function resetStopwatch() {
  playRobotSound("click");
  state.stopwatchRunning = false;
  state.stopwatchMs = 0;
  renderViewport(true);
}

function toggleFocusTimer() {
  playRobotSound("click");
  state.timerRunning = !state.timerRunning;
  renderViewport(true);
}

function setFocusTimer(sec) {
  playRobotSound("click");
  state.timerRunning = false;
  state.timerRemainingSec = sec;
  renderViewport(true);
}

function setPomodoroMode(mode, sec) {
  playRobotSound("click");
  state.pomodoroMode = mode;
  state.pomodoroSec = sec;
  state.pomodoroRunning = false;
  renderViewport(true);
}

function togglePomodoro() {
  playRobotSound("click");
  state.pomodoroRunning = !state.pomodoroRunning;
  renderViewport(true);
}

function resetPomodoro() {
  playRobotSound("click");
  state.pomodoroRunning = false;
  state.pomodoroSec = state.pomodoroMode === "short" ? 300 : state.pomodoroMode === "long" ? 900 : 1500;
  renderViewport(true);
}

async function fetchWeatherWidget() {
  const city = (state.weatherCity || "").trim();
  if (!city) return;
  playRobotSound("click");
  state.weatherDesc = "Checking...";
  renderViewport(true);
  try {
    const geoRes = await fetchWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`, 6000);
    const geo = await geoRes.json();
    const loc = geo?.results?.[0];
    if (!loc) {
      state.weatherDesc = "City not found";
      renderViewport(true);
      return;
    }
    const wRes = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current_weather=true&temperature_unit=fahrenheit`, 6000);
    const wData = await wRes.json();
    const cw = wData?.current_weather;
    if (cw) {
      state.weatherCity = loc.name;
      state.weatherTempF = cw.temperature;
      state.weatherDesc = `${loc.name} • Wind ${Math.round(cw.windspeed)} mph`;
    } else {
      state.weatherDesc = "Weather unavailable";
    }
  } catch {
    state.weatherDesc = "Offline / Unavailable";
  }
  renderViewport(true);
}

async function lookupDictionaryWord() {
  const word = (state.dictWord || "").trim();
  if (!word) return;
  playRobotSound("click");
  state.dictResult = "Looking up...";
  renderViewport(true);
  try {
    const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, 6000);
    const data = await res.json();
    const def = data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition;
    const pos = data?.[0]?.meanings?.[0]?.partOfSpeech || "";
    state.dictResult = def ? `(${pos}) ${def}` : "No definition found.";
  } catch {
    state.dictResult = "Definition lookup unavailable.";
  }
  renderViewport(true);
}

function runTextTool(mode) {
  playRobotSound("click");
  const src = state.textToolInput || "";
  if (mode === "upper") state.textToolInput = src.toUpperCase();
  else if (mode === "lower") state.textToolInput = src.toLowerCase();
  else if (mode === "b64e") {
    try { state.textToolInput = btoa(unescape(encodeURIComponent(src))); } catch {}
  } else if (mode === "b64d") {
    try { state.textToolInput = decodeURIComponent(escape(atob(src))); } catch {}
  }
  state.textToolOutput = state.textToolInput;
  renderViewport(true);
}

function addHabitItem(inputEl) {
  const inp = inputEl || document.getElementById("habit-new-input");
  const val = (inp?.value || "").trim();
  if (!val) return;
  playRobotSound("click");
  state.habitItems.unshift({ id: Date.now(), name: val, done: false });
  savePersistentState();
  renderViewport(true);
}

function toggleHabitItem(id) {
  playRobotSound("click");
  const item = state.habitItems.find(h => h.id === id);
  if (item) item.done = !item.done;
  savePersistentState();
  renderViewport(true);
}

function deleteHabitItem(id) {
  playRobotSound("click");
  state.habitItems = state.habitItems.filter(h => h.id !== id);
  savePersistentState();
  renderViewport(true);
}

function resetDailyHabits() {
  playRobotSound("click");
  state.habitItems.forEach(h => { h.done = false; });
  savePersistentState();
  renderViewport(true);
}

function addTodoItem(inputEl) {
  const inp = inputEl || document.getElementById("todo-new-input");
  const val = (inp?.value || "").trim();
  if (!val) return;
  playRobotSound("click");
  state.todoItems.unshift({ id: Date.now(), text: val, done: false });
  savePersistentState();
  renderViewport(true);
}

function toggleTodoItem(id) {
  playRobotSound("click");
  const item = state.todoItems.find(t => t.id === id);
  if (item) item.done = !item.done;
  savePersistentState();
  renderViewport(true);
}

function deleteTodoItem(id) {
  playRobotSound("click");
  state.todoItems = state.todoItems.filter(t => t.id !== id);
  savePersistentState();
  renderViewport(true);
}

function clearDoneTodos() {
  playRobotSound("click");
  state.todoItems = state.todoItems.filter(t => !t.done);
  savePersistentState();
  renderViewport(true);
}

function runRandomTool(kind) {
  playRobotSound("click");
  if (kind === "d6") state.randomOutput = "D6 Roll: " + (Math.floor(Math.random() * 6) + 1);
  else if (kind === "d20") state.randomOutput = "D20 Roll: " + (Math.floor(Math.random() * 20) + 1);
  else if (kind === "coin") state.randomOutput = "Coin: " + (Math.random() < 0.5 ? "HEADS" : "TAILS");
  else {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$";
    let pw = "";
    for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
    state.randomOutput = pw;
  }
  renderViewport(true);
}

function updateClockWidget() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  document.querySelectorAll("#widget-clock-time").forEach(el => { el.textContent = timeStr; });
  document.querySelectorAll("#widget-clock-date").forEach(el => { el.textContent = dateStr; });
}

setInterval(() => {
  updateClockWidget();
  if (state.stopwatchRunning) {
    state.stopwatchMs += 200;
    document.querySelectorAll("#widget-sw-display").forEach(el => {
      el.textContent = (state.stopwatchMs / 1000).toFixed(1) + "s";
    });
  }
}, 200);

setInterval(() => {
  if (state.timerRunning && state.timerRemainingSec > 0) {
    state.timerRemainingSec--;
    const m = String(Math.floor(state.timerRemainingSec / 60)).padStart(2, "0");
    const s = String(state.timerRemainingSec % 60).padStart(2, "0");
    document.querySelectorAll("#widget-timer-display").forEach(el => {
      el.textContent = `${m}:${s}`;
    });
    if (state.timerRemainingSec === 0) {
      state.timerRunning = false;
      playRobotSound("chime");
    }
  }
  if (state.pomodoroRunning && state.pomodoroSec > 0) {
    state.pomodoroSec--;
    const pm = String(Math.floor(state.pomodoroSec / 60)).padStart(2, "0");
    const ps = String(state.pomodoroSec % 60).padStart(2, "0");
    document.querySelectorAll("#widget-pomo-display").forEach(el => {
      el.textContent = `${pm}:${ps}`;
    });
    if (state.pomodoroSec === 0) {
      state.pomodoroRunning = false;
      if (state.pomodoroMode === "focus") state.pomodoroSessions++;
      playRobotSound("chime");
    }
  }
}, 1000);

// Safe Calculator Evaluator
function calcPress(key) {
  playRobotSound("click");
  if (key === "C") {
    state.calcDisplay = "0";
    state.calcHistory = "";
  } else if (key === "=") {
    try {
      const sanitized = state.calcDisplay.replace(/[^0-9+\-*/.]/g, "");
      const tokens = sanitized.match(/(\d+\.?\d*|\.\d+|[+\-*/])/g);
      if (tokens && tokens.length >= 3) {
        let total = parseFloat(tokens[0]);
        for (let i = 1; i < tokens.length; i += 2) {
          const op = tokens[i];
          const num = parseFloat(tokens[i + 1]);
          if (isNaN(num)) break;
          if (op === "+") total += num;
          if (op === "-") total -= num;
          if (op === "*") total *= num;
          if (op === "/") total = num === 0 ? NaN : total / num;
        }
        state.calcHistory = state.calcDisplay + " =";
        state.calcDisplay = Number.isFinite(total) ? String(Math.round(total * 100000) / 100000) : "Error";
      }
    } catch {
      state.calcDisplay = "Error";
    }
  } else {
    state.calcDisplay = state.calcDisplay === "0" || state.calcDisplay === "Error" ? key : state.calcDisplay + key;
  }
  document.querySelectorAll("#calc-display").forEach(el => { el.textContent = state.calcDisplay; });
}

// ==================== ABYSS VIDEO PLAYER & LOCAL FFmpeg.wasm CONVERTER ====================
// FFmpeg.wasm is built and hosted with this site by the GitHub Actions workflow.
// Conversion happens in the user's browser; no paid conversion server is used.
let abyssFfmpeg = null;
let abyssFfmpegLoadPromise = null;
let abyssLastConvertedMp4 = null;
let abyssLastConvertedMp4Name = "abyss-video.mp4";
let abyssLastConvertedMp4Url = null;

function renderYoutubeMp4ConverterView(payload) {
  const prefillUrl = payload?.videoUrl || state.ytMp4InputUrl || "";
  const st = state.ytMp4Status;
  let resultHtml = "";

  if (st?.error) {
    resultHtml = `<div class="card-panel" style="border-left:3px solid var(--danger);"><p style="font-size:13px;color:var(--danger);font-weight:600;">${escapeHtml(st.error)}</p></div>`;
  } else if (st?.kind === "youtube") {
    const watchSrc = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(st.videoId)}?rel=0`;
    resultHtml = `
      <div class="card-panel">
        <h3 style="font-size:15px;margin-bottom:10px;">YouTube preview</h3>
        <div class="yt-player-frame-box"><iframe src="${escapeAttr(watchSrc)}" title="YouTube video player" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">This uses YouTube's official embedded player. A YouTube watch link is not a downloadable video file, so Abyss won't extract or convert it. To convert, upload a video file you own or have permission to use.</p>
      </div>`;
  } else if (st?.kind === "direct") {
    resultHtml = `
      <div class="card-panel">
        <h3 style="font-size:15px;margin-bottom:10px;">Direct video preview</h3>
        <div class="yt-player-frame-box"><video controls playsinline preload="metadata" src="${escapeAttr(st.url)}"></video></div>
        <p style="font-size:12px;color:var(--text-secondary);margin-top:10px;">If you have permission to use this video, save the source file to your device and upload it in the converter below. Some video hosts block cross-site access.</p>
      </div>`;
  }

  const hasOutput = Boolean(abyssLastConvertedMp4);
  return `
    <div class="yt-mp4-shell">
      <div class="page-header" style="margin-bottom:4px;">
        <div class="page-title-group"><h1>Abyss Video Player &amp; MP4 Converter</h1><p>Preview supported video links and convert uploaded video files directly in your browser.</p></div>
        <button class="btn btn-sm" onclick="navigateTab('abyss://home', 'Abyss Home')">&larr; Home</button>
      </div>
      <div class="card-panel">
        <div class="panel-heading">Open a video link</div>
        <form style="display:flex;gap:8px;flex-wrap:wrap;" onsubmit="event.preventDefault(); analyzeYoutubeLinkForMp4(document.getElementById('yt-mp4-url-input').value);">
          <input type="url" class="text-input" id="yt-mp4-url-input" style="flex:1;min-width:220px;" value="${escapeAttr(prefillUrl)}" placeholder="Paste a YouTube link or direct video URL" />
          <button type="submit" class="btn btn-sm btn-primary">Open video</button>
        </form>
        <p style="font-size:11.5px;color:var(--text-muted);margin-top:8px;">YouTube links play through the official embed. Direct video URLs may preview if their host permits it.</p>
      </div>
      ${resultHtml}
      <div class="card-panel">
        <div class="panel-heading">Convert a video file to MP4</div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Choose a video file stored on your device. FFmpeg.wasm runs locally in your browser; the video is not sent to a conversion server.</p>
        <input type="file" id="abyss-mp4-file" class="text-input" accept="video/*,.mov,.mkv,.webm,.avi,.m4v,.mpeg,.mpg,.ogv" />
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:12px;">
          <button class="btn btn-sm btn-primary" id="abyss-mp4-convert-btn" onclick="convertUploadedVideoToMp4()">Convert to MP4</button>
          <span id="yt-mp4-progress-msg" style="font-size:12px;color:var(--text-secondary);"></span>
        </div>
        <div id="abyss-mp4-result" style="margin-top:12px;">${hasOutput ? renderMp4OutputActions() : ""}</div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:10px;">The first conversion loads the FFmpeg engine (about 30 MB). Processing speed depends on your device. Large files may exceed available memory.</p>
      </div>
    </div>`;
}

function renderMp4OutputActions() {
  if (!abyssLastConvertedMp4) return "";
  return `<div style="border:1px solid var(--border);border-radius:10px;padding:12px;">
    <p style="font-size:13px;font-weight:600;margin-bottom:9px;">MP4 ready: ${escapeHtml(abyssLastConvertedMp4Name)}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-sm btn-primary" onclick="downloadLastConvertedMp4()">Download MP4</button>
      <button class="btn btn-sm" onclick="saveLastConvertedMp4ToCloud()">Save to Supabase</button>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-top:8px;">Cloud saving requires an Abyss account and the optional video-storage SQL policies.</p>
  </div>`;
}

async function analyzeYoutubeLinkForMp4(rawUrl) {
  const input = String(rawUrl || "").trim();
  state.ytMp4InputUrl = input;
  let parsed;
  try { parsed = new URL(input); } catch {
    state.ytMp4Status = { error: "Enter a complete video URL starting with https://" };
    renderViewport(true); return;
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    state.ytMp4Status = { error: "Only HTTP and HTTPS video links are supported." };
    renderViewport(true); return;
  }
  const videoId = extractYoutubeVideoId(input);
  if (videoId) state.ytMp4Status = { kind: "youtube", videoId };
  else if (/\.(mp4|webm|mov|m4v|ogv|mkv)(?:$|[?#])/i.test(parsed.href)) state.ytMp4Status = { kind: "direct", url: parsed.href };
  else state.ytMp4Status = { error: "This link is not a recognized YouTube link or direct video-file URL. Upload a video file below to convert it." };
  playRobotSound("click");
  renderViewport(true);
}

async function loadAbyssFfmpeg() {
  if (abyssFfmpeg) return abyssFfmpeg;
  if (abyssFfmpegLoadPromise) return abyssFfmpegLoadPromise;
  abyssFfmpegLoadPromise = (async () => {
    const moduleUrl = new URL("./vendor/ffmpeg/index.js", document.baseURI);
    const { FFmpeg } = await import(moduleUrl.href);
    const engine = new FFmpeg();
    engine.on("log", ({ message }) => {
      const msg = document.getElementById("yt-mp4-progress-msg");
      if (msg && /error|failed/i.test(message)) msg.textContent = message.slice(0, 160);
    });
    engine.on("progress", ({ progress }) => {
      const msg = document.getElementById("yt-mp4-progress-msg");
      if (msg && Number.isFinite(progress)) msg.textContent = `Converting… ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
    });
    const coreBase = new URL("./vendor/ffmpeg-core/", document.baseURI);
    await engine.load({
      coreURL: new URL("ffmpeg-core.js", coreBase).href,
      wasmURL: new URL("ffmpeg-core.wasm", coreBase).href
    });
    abyssFfmpeg = engine;
    return engine;
  })().catch(error => {
    abyssFfmpegLoadPromise = null;
    throw new Error(`FFmpeg could not load. Check that GitHub Pages deployed the vendor files. ${error?.message || ""}`);
  });
  return abyssFfmpegLoadPromise;
}

async function convertUploadedVideoToMp4() {
  const fileInput = document.getElementById("abyss-mp4-file");
  const msgEl = document.getElementById("yt-mp4-progress-msg");
  const button = document.getElementById("abyss-mp4-convert-btn");
  const say = message => { if (msgEl) msgEl.textContent = message; };
  const file = fileInput?.files?.[0];
  if (!file) { say("Choose a video file first."); return; }
  if (file.size > 500 * 1024 * 1024) { say("This file is over the 500 MB safety limit. Try a smaller file."); return; }
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg|ogv)$/i.test(file.name)) {
    say("That does not look like a supported video file."); return;
  }
  if (button) button.disabled = true;
  try {
    say("Loading FFmpeg engine… (first load may take a little while)");
    const ffmpeg = await loadAbyssFfmpeg();
    const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || "video").toLowerCase();
    const inputName = `abyss_input.${ext}`;
    const outputName = "abyss_output.mp4";
    say("Preparing video…");
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
    say("Converting video… keep Abyss open.");
    await ffmpeg.exec(["-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputName]);
    const data = await ffmpeg.readFile(outputName);
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const blob = new Blob([bytes.slice().buffer], { type: "video/mp4" });
    if (!blob.size) throw new Error("FFmpeg returned an empty file.");
    abyssLastConvertedMp4 = blob;
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "_").slice(0, 60) || "abyss_video";
    abyssLastConvertedMp4Name = `${baseName}.mp4`;
    if (abyssLastConvertedMp4Url) URL.revokeObjectURL(abyssLastConvertedMp4Url);
    abyssLastConvertedMp4Url = URL.createObjectURL(blob);
    const result = document.getElementById("abyss-mp4-result");
    if (result) result.innerHTML = renderMp4OutputActions();
    say(`Conversion complete — ${(blob.size / (1024 * 1024)).toFixed(1)} MB.`);
    playRobotSound("chime");
    try { await ffmpeg.deleteFile(inputName); await ffmpeg.deleteFile(outputName); } catch {}
  } catch (error) {
    console.error("Abyss MP4 conversion failed:", error);
    say(error?.message || "Conversion failed. Try a smaller or different video file.");
  } finally {
    if (button) button.disabled = false;
  }
}

function downloadLastConvertedMp4() {
  if (!abyssLastConvertedMp4) return;
  triggerBlobDownload(abyssLastConvertedMp4, abyssLastConvertedMp4Name);
}

async function saveLastConvertedMp4ToCloud() {
  if (!abyssLastConvertedMp4) return;
  try {
    await ensureSupabaseReady();
    if (!abyssSession?.user?.id) {
      showAccountNotice("Sign in to Abyss to save this MP4 to your cloud storage. You can still download it without an account.");
      openAccountAuth("login");
      return;
    }
    if (abyssLastConvertedMp4.size > 50 * 1024 * 1024) {
      showAccountNotice("This MP4 is larger than the current 50 MB Supabase video upload limit. Download it to your device instead.");
      return;
    }
    const userId = abyssSession.user.id;
    const safeName = abyssLastConvertedMp4Name.replace(/[^a-z0-9._-]/gi, "_");
    const storagePath = `${userId}/${Date.now()}_${safeName}`;
    const { error: uploadError } = await abyssSupabase.storage.from("abyss-videos").upload(storagePath, abyssLastConvertedMp4, { contentType: "video/mp4", upsert: false });
    if (uploadError) throw uploadError;
    const { error: metaError } = await abyssSupabase.from("abyss_video_files").insert({ user_id: userId, file_name: abyssLastConvertedMp4Name, storage_path: storagePath, size_bytes: abyssLastConvertedMp4.size });
    if (metaError) throw metaError;
    showAccountNotice("MP4 saved to your Supabase cloud storage.");
  } catch (error) {
    showAccountNotice(`Cloud video save failed: ${error?.message || "Check your Supabase SQL setup."}`);
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ==================== PERMANENT CUSTOM LINK APP PAGE ====================
function renderPermanentCustomAppPageView(payload) {
  const app = state.customApps.find(a => a.id === payload?.appId);
  if (!app) {
    return `
      <div class="page-shell">
        <h2>App Not Found</h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:8px 0 14px;">This custom app link could not be located.</p>
        <button class="btn btn-sm btn-primary" onclick="navigateTab('abyss://home', 'Abyss Home')">&larr; Home</button>
      </div>
    `;
  }
  const customLink = app.customRoute || slugifyAppRoute(app.name);
  if (!app.loadedHtml) {
    return renderLocalAppRunnerView({ appId: app.id });
  }
  return `
    <div class="perm-app-page">
      <div class="perm-app-topbar">
        <div class="proxy-bar-left">
          <span class="proxy-status-pill is-proxy">
            <span class="proxy-status-dot"></span>
            PERMANENT APP
          </span>
          <strong>${escapeHtml(app.name)}</strong>
          <span class="proxy-url-chip" title="${escapeAttr(customLink)}">${escapeHtml(customLink)}</span>
        </div>
        <div class="mode-pill-group">
          <button class="mode-pill" onclick="safeCopyText(${JSON.stringify(customLink)})">Copy Link</button>
          <button class="mode-pill" onclick="reloadCurrentTab()">Restart</button>
          <button class="mode-pill" onclick="navigateTab('abyss://local-app', ${JSON.stringify(app.name)}, { appId: ${JSON.stringify(app.id)} })">Manage File</button>
          <button class="mode-pill active" onclick="toggleGameFullscreen()">Full Screen</button>
        </div>
      </div>
      <div class="game-stage-wrapper ${state.isGameFullscreen ? "is-fullscreen" : ""}" id="game-stage-wrapper" style="flex:1;border-radius:0;border:none;display:flex;flex-direction:column;">
        ${state.isGameFullscreen ? `
          <div class="game-stage-bar">
            <span><strong>${escapeHtml(app.name)}</strong> &bull; ${escapeHtml(customLink)}</span>
            <button class="btn btn-sm btn-primary" id="fullscreen-toggle-btn" style="padding:3px 9px;font-size:11px;" onclick="toggleGameFullscreen()">Exit Fullscreen</button>
          </div>
        ` : ""}
        <iframe class="perm-app-frame" sandbox="allow-scripts allow-forms allow-pointer-lock allow-modals allow-same-origin" srcdoc="${escapeAttr(app.loadedHtml)}"></iframe>
      </div>
    </div>
  `;
}

// ==================== CRASH-PROOF IN-APP WEB & PROXY VIEW ====================
function switchWebViewMode(mode) {
  const entry = getCurrentEntry();
  if (!entry || !entry.payload) return;
  playRobotSound("click");
  entry.payload.viewMode = mode;
  savePersistentState();
  renderAll(true);
}

function toggleProxyScriptMode() {
  const entry = getCurrentEntry();
  if (!entry || !entry.payload) return;
  playRobotSound("click");
  entry.payload.proxyClean = !(entry.payload.proxyClean !== false);
  entry.payload.viewMode = "proxy";
  savePersistentState();
  renderAll(true);
}

function retryProxyGateway() {
  const tab = getActiveTab();
  const entry = getCurrentEntry(tab);
  if (!entry || !entry.payload) return;
  playRobotSound("click");
  entry.payload.viewMode = "proxy";
  delete renderedPaneSignatures[tab.id];
  renderAll(true);
}

function openFloatingPopupWindow(url) {
  playRobotSound("click");
  window.open(url, "_blank", "noopener,noreferrer");
}

async function loadGithubRepoInApp(payload, tabId) {
  const box = document.getElementById(`github-repo-box-${tabId}`);
  if (!box) return;
  const { repoOwner, repoName, originalUrl } = payload;
  try {
    const [repoRes, readmeRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`, 7000).then(r => r.json()),
      fetchWithTimeout(`https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}/readme`, 7000).then(r => r.json())
    ]);
    const repo = repoRes.status === "fulfilled" ? repoRes.value : null;
    if (!repo || repo.message === "Not Found") {
      switchWebViewMode("proxy");
      return;
    }
    let readmeText = "";
    if (readmeRes.status === "fulfilled" && readmeRes.value?.content) {
      try {
        readmeText = decodeURIComponent(escape(atob(readmeRes.value.content.replace(/\s/g, ""))));
      } catch {
        readmeText = atob(readmeRes.value.content.replace(/\s/g, ""));
      }
    }
    box.innerHTML = `
      <div class="card-panel">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
          <div>
            <div class="panel-heading" style="margin-bottom:4px;">GitHub Repository</div>
            <h2 style="font-size:20px;margin-bottom:4px;">${escapeHtml(repo.full_name)}</h2>
            <p style="font-size:13px;color:var(--text-secondary);">${escapeHtml(repo.description || "No repository description provided.")}</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <span class="suggestion-tag">&#9733; ${repo.stargazers_count || 0}</span>
            <span class="suggestion-tag">${escapeHtml(repo.language || "Code")}</span>
            <button class="btn btn-sm btn-primary" onclick="openFloatingPopupWindow('${escapeAttr(originalUrl)}')">Open on GitHub &nearr;</button>
          </div>
        </div>
      </div>
      ${readmeText ? `
        <div class="card-panel">
          <div class="panel-heading">README.md</div>
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;color:var(--text-primary);">${escapeHtml(readmeText.slice(0, 14000))}</pre>
        </div>
      ` : ""}
    `;
  } catch {
    switchWebViewMode("proxy");
  }
}

function renderInAppWebView(payload, tabId) {
  const { originalUrl, isGithubRepo } = payload;
  let viewMode = payload.viewMode || "live";
  if (viewMode === "reader") {
    viewMode = "live";
    payload.viewMode = "live";
  }
  const isCleanProxy = payload.proxyClean !== false;

  const statusText = viewMode === "github"
    ? "GitHub In-App"
    : viewMode === "live"
      ? "Live Frame"
      : "Proxy Frame";
  const pillClass = viewMode === "proxy" ? "is-proxy" : "";

  const toolbarHtml = `
    <div class="inapp-notice-bar">
      <div class="proxy-bar-left">
        <span class="proxy-status-pill ${pillClass}">
          <span class="proxy-status-dot"></span>
          ${escapeHtml(statusText)}
        </span>
        <span class="proxy-url-chip" title="${escapeAttr(originalUrl)}">${escapeHtml(originalUrl)}</span>
      </div>
      <div class="mode-pill-group">
        ${isGithubRepo ? `<button class="mode-pill ${viewMode === "github" ? "active" : ""}" onclick="switchWebViewMode('github')">Repo View</button>` : ""}
        <button class="mode-pill ${viewMode === "live" ? "active" : ""}" onclick="switchWebViewMode('live')" title="Load the website directly in its frame">Live Frame</button>
        <button class="mode-pill ${viewMode === "proxy" ? "active" : ""}" onclick="switchWebViewMode('proxy')" title="Load through the configured proxy frame">Proxy Frame</button>
        ${viewMode === "proxy" ? `
          <button class="mode-pill" onclick="toggleProxyScriptMode()" title="Toggle safe static vs interactive scripts">${isCleanProxy ? "Safe Clean" : "Interactive"}</button>
          <button class="mode-pill" onclick="retryProxyGateway()" title="Retry proxy gateway">Retry</button>
        ` : ""}
        <button class="mode-pill content-fullscreen-btn" onclick="toggleGameFullscreen()" title="Expand the current page content">⛶ Full Screen</button>
        <button class="mode-pill" onclick="openFloatingPopupWindow('${escapeAttr(originalUrl)}')" title="Open in New Browser Tab">New Tab &nearr;</button>
      </div>
    </div>
  `;

  if (viewMode === "github") {
    return `
      <div class="inapp-browser-wrap">
        ${toolbarHtml}
        <div class="page-shell" id="github-repo-box-${tabId}">
          <p style="color:var(--text-muted);font-size:13px;">Loading GitHub repository inside Abyss...</p>
        </div>
      </div>
    `;
  }

  if (viewMode === "reader") {
    return `
      <div class="inapp-browser-wrap">
        ${toolbarHtml}
        <div class="reader-article-box" id="reader-content-area-${tabId}">
          Loading clean in-app reader view for <strong>${escapeHtml(originalUrl)}</strong>...
        </div>
      </div>
    `;
  }

  return `
    <div class="inapp-browser-wrap">
      ${toolbarHtml}
      <iframe
        class="inapp-iframe"
        id="proxy-web-iframe-${tabId}"
        title="Abyss webpage frame"
        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-same-origin allow-pointer-lock allow-presentation"
        allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write"
        allowfullscreen
        ${viewMode === "live" ? `src="${escapeAttr(originalUrl)}"` : `srcdoc="<div style='font-family:sans-serif;padding:32px;color:#475569;'><h3>Loading in Abyss Proxy Frame...</h3><p>${escapeAttr(originalUrl)}</p></div>"`}
      ></iframe>
    </div>
  `;
}

function sanitizeProxiedHtml(rawHtml, targetUrl, stripExternalScripts = true) {
  let baseOrigin = "";
  try {
    baseOrigin = new URL(targetUrl).origin;
  } catch {}
  let html = rawHtml;
  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
  html = html.replace(/if\s*\(\s*(window\.)?(top|parent)\s*!==?\s*(window\.)?self\s*\)/gi, "if(false)");
  html = html.replace(/(top|parent)\.location(\.href)?\s*=/gi, "void ");
  if (stripExternalScripts) {
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  }
  if (baseOrigin) {
    html = html.replace(/\b(src|href|action)=["']\/(?!\/)([^"']*)["']/gi, (m, attr, path) => {
      return `${attr}="${baseOrigin}/${path}"`;
    });
  }
  const bridgeScript = `
    <base href="${escapeAttr(targetUrl)}" target="_self">
    <script>
      document.addEventListener("click", function(e) {
        var a = e.target.closest("a[href]");
        if (!a) return;
        var href = a.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
        e.preventDefault();
        try {
          var full = new URL(href, ${JSON.stringify(targetUrl)}).href;
          window.parent.postMessage({ type: "ABYSS_NAVIGATE", url: full }, "*");
        } catch (err) {}
      }, true);
    <\/script>
  `;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${bridgeScript}`);
  } else {
    html = `<head>${bridgeScript}</head>\n${html}`;
  }
  return html;
}

async function fetchWithTimeout(url, ms = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchUrlThroughGateways(targetUrl) {
  const gateways = [
    async (u) => {
      const res = await fetchWithTimeout(`https://api.allorigins.win/get?url=${encodeURIComponent(u)}`, 7500);
      const data = await res.json();
      return data?.contents || "";
    },
    async (u) => {
      const res = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, 7500);
      return await res.text();
    },
    async (u) => {
      const res = await fetchWithTimeout(`https://corsproxy.io/?${encodeURIComponent(u)}`, 7500);
      return await res.text();
    }
  ];
  for (const fetcher of gateways) {
    try {
      const rawHtml = await fetcher(targetUrl);
      const isBlockedOrReset = /Just a moment\.\.\.|Enable JavaScript and cookies to continue|Attention Required! \| Cloudflare|Access denied|not accessible for (my|your) organization|ERR_CONNECTION_RESET/i.test(rawHtml);
      if (rawHtml && rawHtml.length > 100 && !isBlockedOrReset) {
        return rawHtml;
      }
    } catch {}
  }
  return "";
}

async function loadProxiedPageIntoFrame(targetUrl, tabId, stripExternalScripts = true) {
  const frame = document.getElementById(`proxy-web-iframe-${tabId}`);
  if (!frame) return;

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    frame.srcdoc = `
      <div style="font-family:sans-serif;padding:36px;max-width:520px;margin:auto;color:#0f172a;">
        <h2>Offline Mode</h2>
        <p style="color:#475569;line-height:1.6;">
          Your device appears to be offline right now. Permanent HTML/ZIP apps, Sticky Notes, Calculator, and saved pages still work without internet.
        </p>
      </div>
    `;
    return;
  }

  const rawHtml = await fetchUrlThroughGateways(targetUrl);
  if (rawHtml) {
    frame.srcdoc = sanitizeProxiedHtml(rawHtml, targetUrl, stripExternalScripts);
    return;
  }

  let domainLabel = targetUrl;
  try { domainLabel = new URL(targetUrl).hostname.replace(/^www\./, ""); } catch {}
  frame.srcdoc = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:38px 24px;max-width:560px;margin:0 auto;color:#0f172a;">
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#2563eb;margin-bottom:6px;">
          Abyss Safe View Notice
        </div>
        <h2 style="font-size:19px;margin:0 0 8px;">${escapeHtml(domainLabel)} could not be embedded directly</h2>
        <p style="color:#475569;font-size:13.5px;line-height:1.6;margin:0 0 18px;">
          This site restricts embedded framing or is filtered by your network firewall. You can read its summary inside Abyss or open it in a standalone browser tab:
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button onclick="window.parent.postMessage({type:'ABYSS_NAVIGATE',url:${JSON.stringify(domainLabel)}},'*')"
             style="background:#2563eb;color:#ffffff;border:none;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;">
            Search Info Inside Abyss
          </button>
          <a href="${escapeAttr(targetUrl)}" target="_blank" rel="noopener noreferrer"
             style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;">
            Open in Browser Tab &nearr;
          </a>
        </div>
      </div>
    </div>
  `;
}

async function loadReaderArticle(targetUrl, tabId) {
  const box = document.getElementById(`reader-content-area-${tabId}`);
  if (!box) return;
  const htmlText = await fetchUrlThroughGateways(targetUrl);
  if (htmlText) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    doc.querySelectorAll("script, style, nav, footer, iframe, noscript").forEach(el => el.remove());
    const title = doc.querySelector("title")?.textContent || targetUrl;
    const paragraphs = Array.from(doc.querySelectorAll("p, h1, h2, h3"))
      .map(el => el.textContent.trim())
      .filter(txt => txt.length > 35)
      .slice(0, 28);
    if (paragraphs.length > 0) {
      box.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;">
          <h2 style="font-size:20px;">${escapeHtml(title)}</h2>
          <button class="btn btn-sm" onclick="speakText(this.parentElement.parentElement.innerText.slice(0, 1200))">Read Aloud</button>
        </div>
        ${paragraphs.map(p => `<p style="margin-bottom:12px;">${escapeHtml(p)}</p>`).join("")}
      `;
      return;
    }
  }
  if (box) {
    box.innerHTML = `
      <p style="margin-bottom:12px;">No readable article text could be extracted for <strong>${escapeHtml(targetUrl)}</strong>.</p>
      <button class="btn btn-sm btn-primary" onclick="switchWebViewMode('proxy')">Switch to Safe Frame</button>
    `;
  }
}

// ==================== REVAMPED ABYSS SEARCH ENGINE (WEB + MATH + WIKIPEDIA IN-APP) ====================
function evaluateLiveMathExpression(rawQuery) {
  let expr = String(rawQuery || "").trim();
  if (!expr) return null;
  expr = expr.replace(/=+$/, "").trim();
  if (!expr) return null;

  // Handle "X% of Y"
  const pctMatch = expr.match(/^(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)$/i);
  if (pctMatch) {
    const val = (parseFloat(pctMatch[1]) / 100) * parseFloat(pctMatch[2]);
    if (Number.isFinite(val)) {
      return { expression: rawQuery.trim(), result: String(Math.round(val * 1000000) / 1000000) };
    }
  }

  // Normalize multiplication/division symbols
  let normalized = expr
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/(\d)\s*[xX]\s*(\d)/g, "$1*$2")
    .replace(/\^/g, "**")
    .replace(/\bsqrt\s*\(([^)]+)\)/gi, "Math.sqrt($1)")
    .replace(/\bpi\b/gi, "Math.PI");

  // Only allow safe arithmetic characters and Math.sqrt / Math.PI
  const stripped = normalized.replace(/Math\.sqrt|Math\.PI/g, "");
  if (!/^[0-9+\-*/().%\s]+$/.test(stripped)) return null;
  if (!/[+\-*/%]|Math\.sqrt/.test(normalized)) return null;

  try {
    const fn = new Function(`"use strict"; return (${normalized});`);
    const val = fn();
    if (typeof val === "number" && Number.isFinite(val)) {
      const rounded = Math.round(val * 100000000) / 100000000;
      return { expression: expr, result: String(rounded) };
    }
  } catch {}
  return null;
}

function switchInAppSearchMode(mode) {
  const entry = getCurrentEntry();
  if (!entry || entry.route !== "abyss://search" || !entry.payload) return;
  playRobotSound("click");
  entry.payload.searchMode = mode; // "web" | "wikipedia"
  savePersistentState();
  renderAll(true);
}

function renderInAppSearchView(payload, tabId) {
  const mode = payload.searchMode || "web";
  return `
    <div class="page-shell">
      <div class="page-header">
        <div class="page-title-group">
          <h1>Abyss Search: "${escapeHtml(payload.query)}"</h1>
          <p>${mode === "wikipedia" ? "Encyclopedia articles loaded directly inside Abyss." : "Web search results & instant answers directly inside Abyss."}</p>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm ${mode === "web" ? "btn-primary" : ""}" onclick="switchInAppSearchMode('web')">Abyss Web</button>
          <button class="btn btn-sm ${mode === "wikipedia" ? "btn-primary" : ""}" onclick="switchInAppSearchMode('wikipedia')">Wikipedia In-App</button>
        </div>
      </div>
      <div id="inapp-math-box-${tabId}"></div>
      <div id="inapp-instant-box-${tabId}"></div>
      <div id="inapp-search-results-${tabId}">
        <p style="color:var(--text-muted);font-size:13px;">Searching inside Abyss...</p>
      </div>
    </div>
  `;
}

function parseDuckDuckGoHtmlResults(htmlText) {
  if (!htmlText) return [];
  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const results = [];

  // Standard DDG HTML result nodes
  doc.querySelectorAll(".result, .web-result").forEach(node => {
    const linkEl = node.querySelector("a.result__a, a.result-link");
    const snippetEl = node.querySelector(".result__snippet, .result-snippet");
    if (!linkEl) return;
    let href = linkEl.getAttribute("href") || "";
    if (href.includes("uddg=")) {
      try {
        const u = new URL(href, "https://duckduckgo.com");
        href = decodeURIComponent(u.searchParams.get("uddg") || href);
      } catch {}
    }
    if (!/^https?:\/\//i.test(href)) return;
    const title = linkEl.textContent.trim();
    const snippet = snippetEl ? snippetEl.textContent.trim() : "";
    if (title) {
      results.push({ title, url: href, snippet });
    }
  });

  // Fallback for DDG Lite table layout
  if (!results.length) {
    doc.querySelectorAll("a.result-link").forEach(a => {
      let href = a.getAttribute("href") || "";
      if (href.includes("uddg=")) {
        try {
          const u = new URL(href, "https://lite.duckduckgo.com");
          href = decodeURIComponent(u.searchParams.get("uddg") || href);
        } catch {}
      }
      if (/^https?:\/\//i.test(href) && a.textContent.trim()) {
        results.push({ title: a.textContent.trim(), url: href, snippet: "" });
      }
    });
  }

  return results.slice(0, 14);
}

async function fetchInAppSearchResults(query, tabId, mode = "web") {
  const container = document.getElementById(`inapp-search-results-${tabId}`);
  const instantBox = document.getElementById(`inapp-instant-box-${tabId}`);
  const mathBox = document.getElementById(`inapp-math-box-${tabId}`);
  if (!container) return;

  // 1. Live Math & Equation Evaluation
  const mathAns = evaluateLiveMathExpression(query);
  if (mathAns && mathBox) {
    mathBox.innerHTML = `
      <div class="card-panel" style="border-left:3px solid var(--success);">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div>
            <div class="panel-heading" style="margin-bottom:3px;">Calculator Answer</div>
            <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(mathAns.expression)} =</div>
            <div style="font-size:26px;font-weight:800;color:var(--accent);margin-top:2px;">${escapeHtml(mathAns.result)}</div>
          </div>
          <button class="btn btn-sm" onclick="safeCopyText(${JSON.stringify(mathAns.result)})">Copy Answer</button>
        </div>
      </div>
    `;
  }

  // Wikipedia In-App Mode
  if (mode === "wikipedia") {
    try {
      const wikiData = await fetchWithTimeout(
        `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`,
        7000
      ).then(r => r.json());
      const results = wikiData?.query?.search || [];
      state.lastSearchResults = results;
      if (!results.length) {
        container.innerHTML = `
          <div class="card-panel">
            <p style="color:var(--text-secondary);font-size:13px;">
              No Wikipedia articles matched <strong>"${escapeHtml(query)}"</strong>. Switch back to <strong>Abyss Web</strong> above for general web results.
            </p>
          </div>
        `;
        return;
      }
      container.innerHTML = results.map((item, idx) => {
        const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "");
        return `
          <div class="search-result-card" onclick="openSearchResultByIndex(${idx})">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(cleanSnippet)}...</p>
            <span style="display:inline-block;margin-top:6px;font-size:11px;color:var(--text-muted);">Wikipedia In-App &rarr;</span>
          </div>
        `;
      }).join("");
    } catch {
      container.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;">Could not load Wikipedia results right now.</p>`;
    }
    return;
  }

  // Default: Abyss Own Web Search Engine (Multi-source real web results + Instant Answers)
  try {
    const safeParam = state.settings.abyssBlocker?.safeSearch ? "&kp=1" : "";
    const ddgHtmlTarget = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}${safeParam}`;

    const [ddgApiRes, webHtmlRes, wikiFallbackRes] = await Promise.allSettled([
      fetchWithTimeout(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, 6500).then(r => r.json()),
      fetchUrlThroughGateways(ddgHtmlTarget),
      fetchWithTimeout(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`, 6500).then(r => r.json())
    ]);

    // Instant Answer / Knowledge Card if available
    if (ddgApiRes.status === "fulfilled" && instantBox) {
      const d = ddgApiRes.value || {};
      const answerText = d.AbstractText || d.Answer || d.Definition || "";
      const answerUrl = d.AbstractURL || d.DefinitionURL || "";
      if (answerText) {
        instantBox.innerHTML = `
          <div class="card-panel" style="border-left:3px solid var(--accent);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
              <div class="panel-heading" style="margin:0;">Instant Answer</div>
              <div style="display:flex;gap:6px;">
                ${answerUrl ? `<button class="btn btn-sm" onclick="handleUserSearchOrUrl('${escapeAttr(answerUrl)}')">Open Source &rarr;</button>` : ""}
                <button class="btn btn-sm" onclick="speakText(${JSON.stringify(answerText)})">Read Aloud</button>
              </div>
            </div>
            <h3 style="font-size:15px;margin-bottom:4px;">${escapeHtml(d.Heading || query)}</h3>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">${escapeHtml(answerText)}</p>
          </div>
        `;
      }
    }

    let webResults = webHtmlRes.status === "fulfilled" ? parseDuckDuckGoHtmlResults(webHtmlRes.value) : [];

    // Filter blocked sites if Abyss.Blocker is enabled
    if (state.settings.abyssBlocker?.enabled) {
      webResults = webResults.filter(r => !findAbyssBlockerMatch(r.url + " " + r.title));
    }

    // If web proxy returned results, render full organic web results
    if (webResults.length > 0) {
      container.innerHTML = webResults.map(item => {
        let domain = item.url;
        try { domain = new URL(item.url).hostname.replace(/^www\./, ""); } catch {}
        return `
          <div class="search-result-card" onclick="handleUserSearchOrUrl(${JSON.stringify(item.url)})">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:3px;">${escapeHtml(domain)}</div>
            <h3>${escapeHtml(item.title)}</h3>
            ${item.snippet ? `<p>${escapeHtml(item.snippet)}</p>` : ""}
            <span style="display:inline-block;margin-top:6px;font-size:11px;color:var(--accent);">Open in Abyss &rarr;</span>
          </div>
        `;
      }).join("");
      return;
    }

    // Secondary fallback: DuckDuckGo RelatedTopics + Wikipedia references if HTML gateway is rate-limited
    const related = (ddgApiRes.status === "fulfilled" ? (ddgApiRes.value?.RelatedTopics || []) : [])
      .flatMap(t => (t.Topics ? t.Topics : [t]))
      .filter(t => t && t.FirstURL && t.Text)
      .slice(0, 8);

    const wikiHits = wikiFallbackRes.status === "fulfilled" ? (wikiFallbackRes.value?.query?.search || []) : [];
    state.lastSearchResults = wikiHits;

    if (related.length > 0 || wikiHits.length > 0) {
      const relHtml = related.map(r => `
        <div class="search-result-card" onclick="handleUserSearchOrUrl(${JSON.stringify(r.FirstURL)})">
          <h3>${escapeHtml(r.Text.split(" - ")[0])}</h3>
          <p>${escapeHtml(r.Text)}</p>
          <span style="display:inline-block;margin-top:6px;font-size:11px;color:var(--accent);">Open in Abyss &rarr;</span>
        </div>
      `).join("");

      const wikiHtml = wikiHits.map((item, idx) => {
        const cleanSnippet = item.snippet.replace(/<\/?[^>]+(>|$)/g, "");
        return `
          <div class="search-result-card" onclick="openSearchResultByIndex(${idx})">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(cleanSnippet)}...</p>
            <span style="display:inline-block;margin-top:6px;font-size:11px;color:var(--text-muted);">Open Article in Abyss &rarr;</span>
          </div>
        `;
      }).join("");

      container.innerHTML = relHtml + wikiHtml;
      return;
    }

    if (mathAns) {
      container.innerHTML = "";
    } else {
      container.innerHTML = `
        <div class="card-panel">
          <p style="color:var(--text-secondary);font-size:13px;">
            No matching results found for <strong>"${escapeHtml(query)}"</strong>. Try different keywords or switch to <strong>Wikipedia In-App</strong> above.
          </p>
        </div>
      `;
    }
  } catch {
    container.innerHTML = `<p style="color:var(--text-secondary);font-size:13px;">Could not reach live search right now.</p>`;
  }
}

function openSearchResultByIndex(idx) {
  const item = state.lastSearchResults[idx];
  if (!item) return;
  const articleUrl = `https://en.m.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`;
  navigateTab("abyss://web", item.title, {
    embedUrl: articleUrl,
    originalUrl: articleUrl,
    viewMode: "proxy",
    proxyClean: true
  });
}

// ==================== COMPACT SETTINGS HUB & ABYSS.BLOCKER ====================
function setSettingsSection(sec) {
  playRobotSound("click");
  state.activeSettingsSection = sec;
  renderViewport(true);
}

function handleTabSleepToggle(enabled) {
  playRobotSound("click");
  state.settings.tabSleepEnabled = enabled;
  if (enabled && (!state.settings.tabSleepSeconds || state.settings.tabSleepSeconds <= 0)) {
    state.settings.tabSleepSeconds = 60;
  }
  savePersistentState();
  renderAll(true);
}

function handleTabSleepDelayChange(rawVal) {
  playRobotSound("click");
  if (rawVal === "never" || Number(rawVal) === 0) {
    state.settings.tabSleepEnabled = false;
    state.settings.tabSleepSeconds = 0;
  } else {
    state.settings.tabSleepEnabled = true;
    state.settings.tabSleepSeconds = Number(rawVal);
  }
  savePersistentState();
  renderAll(true);
}

function getBlockerPassword() {
  const pw = state.settings.abyssBlocker?.password;
  if (typeof pw === "string" && pw.length > 0 && pw.length <= 14) return pw;
  return DEFAULT_BLOCKER_PASSWORD;
}

function enforceBlockerPasswordLength(inputEl) {
  if (!inputEl) return;
  if (inputEl.value.length > 14) {
    inputEl.value = inputEl.value.slice(0, 14);
  }
}

function verifyAbyssBlockerPassword() {
  const inputEl = document.getElementById("abyss-blocker-pw-input");
  const val = (inputEl?.value || "").slice(0, 14);
  if (val === getBlockerPassword()) {
    state.abyssBlockerUnlocked = true;
    playRobotSound("chime");
    renderViewport(true);
  } else {
    playRobotSound("denied");
    if (inputEl) inputEl.value = "";
    const err = document.getElementById("abyss-blocker-pw-error");
    if (err) err.textContent = "Incorrect password.";
  }
}

function updateAbyssBlockerPassword() {
  if (!state.abyssBlockerUnlocked) {
    playRobotSound("denied");
    return;
  }
  const inputEl = document.getElementById("abyss-blocker-new-pw-input");
  const msgEl = document.getElementById("abyss-blocker-pw-change-msg");
  const nextPw = (inputEl?.value || "").slice(0, 14);
  if (!nextPw) {
    if (msgEl) {
      msgEl.style.color = "var(--danger)";
      msgEl.textContent = "Password cannot be empty (1 to 14 characters).";
    }
    return;
  }
  state.settings.abyssBlocker.password = nextPw;
  savePersistentState();
  playRobotSound("chime");
  if (inputEl) inputEl.value = "";
  if (msgEl) {
    msgEl.style.color = "var(--success)";
    msgEl.textContent = "Blocker password updated.";
  }
}

function lockAbyssBlockerNow() {
  state.abyssBlockerUnlocked = false;
  playRobotSound("click");
  renderViewport(true);
}

function toggleAbyssBlockerEnabled(enabled) {
  if (!state.abyssBlockerUnlocked) {
    playRobotSound("denied");
    renderViewport(true);
    return;
  }
  playRobotSound("click");
  state.settings.abyssBlocker.enabled = Boolean(enabled);
  savePersistentState();
  renderAll(true);
}

function toggleAbyssBlockerSafeSearch(enabled) {
  if (!state.abyssBlockerUnlocked) {
    playRobotSound("denied");
    renderViewport(true);
    return;
  }
  playRobotSound("click");
  state.settings.abyssBlocker.safeSearch = Boolean(enabled);
  savePersistentState();
  renderViewport(true);
}

function addAbyssBlockerSite() {
  if (!state.abyssBlockerUnlocked) {
    playRobotSound("denied");
    return;
  }
  const input = document.getElementById("new-blocker-site-input");
  const val = (input?.value || "").trim();
  if (!val) return;
  if (!state.settings.abyssBlocker.blockedSites.includes(val)) {
    playRobotSound("click");
    state.settings.abyssBlocker.blockedSites.push(val);
    savePersistentState();
    renderViewport(true);
  }
}

function removeAbyssBlockerSite(idx) {
  if (!state.abyssBlockerUnlocked) {
    playRobotSound("denied");
    return;
  }
  playRobotSound("click");
  state.settings.abyssBlocker.blockedSites.splice(idx, 1);
  savePersistentState();
  renderViewport(true);
}

function renderAbyssBlockerSettingsPanel() {
  const blocker = state.settings.abyssBlocker || { enabled: false, safeSearch: true, blockedSites: [] };
  const unlocked = state.abyssBlockerUnlocked;
  const ruleCount = blocker.blockedSites.length;

  // When locked, blocked site names & details are completely hidden
  const blockedListHtml = unlocked
    ? (blocker.blockedSites.length
        ? blocker.blockedSites.map((site, idx) => `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">${escapeHtml(site)}</div>
                <div class="list-item-meta">Blocked site / keyword rule</div>
              </div>
              <button class="btn btn-sm btn-danger" onclick="removeAbyssBlockerSite(${idx})">Remove</button>
            </div>
          `).join("")
        : `<p style="color:var(--text-muted);font-size:12.5px;">No sites added to Abyss.Blocker yet.</p>`)
    : `
      <div style="background:var(--bg-main);border:1px solid var(--border-light);border-radius:10px;padding:12px 14px;font-size:12.5px;color:var(--text-secondary);">
        <strong>${ruleCount}</strong> blocked ${ruleCount === 1 ? "rule is" : "rules are"} currently stored. All blocked site names are hidden while Abyss.Blocker is locked.
      </div>
    `;

  return `
    <div class="card-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
        <div class="panel-heading" style="margin:0;">Abyss.Blocker &bull; Content Restrictions</div>
        <span class="blocker-status-badge ${blocker.enabled ? "is-on" : "is-off"}">
          ${blocker.enabled ? "ACTIVE (ON)" : "TURNED OFF"}
        </span>
      </div>
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
        Abyss.Blocker restricts blocked sites and searches. Unlock with your blocker password to view or edit blocked sites.
      </p>

      ${!unlocked ? `
        <div style="background:var(--bg-main);border:1px solid var(--border-light);border-radius:11px;padding:12px;margin-bottom:12px;">
          <div style="font-size:12.5px;font-weight:700;margin-bottom:6px;">Unlock Abyss.Blocker</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input type="password" class="text-input" id="abyss-blocker-pw-input" maxlength="14" style="flex:1;min-width:170px;"
              placeholder="Enter password (max 14 chars)..."
              oninput="enforceBlockerPasswordLength(this)"
              onkeydown="if(event.key==='Enter') verifyAbyssBlockerPassword()" />
            <button class="btn btn-sm btn-primary" onclick="verifyAbyssBlockerPassword()">Unlock</button>
          </div>
          <div id="abyss-blocker-pw-error" style="font-size:11.5px;color:var(--danger);margin-top:6px;"></div>
        </div>
      ` : `
        <div style="display:flex;align-items:center;justify-content:space-between;background:var(--accent-soft);padding:9px 12px;border-radius:10px;margin-bottom:12px;">
          <span style="font-size:12px;font-weight:700;color:var(--accent);">Abyss.Blocker Unlocked</span>
          <button class="btn btn-sm" onclick="lockAbyssBlockerNow()">Lock Abyss.Blocker</button>
        </div>
      `}

      <div class="setting-row">
        <div class="setting-info">
          <h4>Enable Abyss.Blocker</h4>
          <p>Status: <strong>${blocker.enabled ? "Active" : "Inactive"}</strong>. When enabled, matching URLs and searches show the custom Abyss.Blocker screen.</p>
        </div>
        <label class="switch">
          <input type="checkbox" ${blocker.enabled ? "checked" : ""} ${!unlocked ? "disabled" : ""} onchange="toggleAbyssBlockerEnabled(this.checked)" />
          <span class="slider"></span>
        </label>
      </div>
      <div class="setting-row">
        <div class="setting-info">
          <h4>Enforce SafeSearch</h4>
          <p>Status: <strong>${blocker.safeSearch ? "Active" : "Off"}</strong>. Applies SafeSearch filtering on web searches.</p>
        </div>
        <label class="switch">
          <input type="checkbox" ${blocker.safeSearch ? "checked" : ""} ${!unlocked ? "disabled" : ""} onchange="toggleAbyssBlockerSafeSearch(this.checked)" />
          <span class="slider"></span>
        </label>
      </div>

      ${unlocked ? `
        <div class="setting-row" style="flex-direction:column;align-items:stretch;gap:6px;">
          <div class="setting-info">
            <h4>Change Blocker Password (Max 14 Characters)</h4>
            <p>Set a custom password up to 14 characters for Abyss.Blocker.</p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input type="password" class="text-input" id="abyss-blocker-new-pw-input" maxlength="14" style="flex:1;min-width:170px;"
              placeholder="New password (up to 14 chars)..."
              oninput="enforceBlockerPasswordLength(this)"
              onkeydown="if(event.key==='Enter') updateAbyssBlockerPassword()" />
            <button class="btn btn-sm" onclick="updateAbyssBlockerPassword()">Save Password</button>
          </div>
          <div id="abyss-blocker-pw-change-msg" style="font-size:11.5px;font-weight:600;"></div>
        </div>
      ` : ""}
    </div>

    <div class="card-panel">
      <div class="panel-heading">Blocked Sites &amp; Keywords (${unlocked ? ruleCount : "Hidden"})</div>
      ${unlocked ? `
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input type="text" class="text-input" id="new-blocker-site-input" style="flex:1;"
            placeholder="Enter domain or keyword to block..."
            onkeydown="if(event.key==='Enter') addAbyssBlockerSite()" />
          <button class="btn btn-sm btn-primary" onclick="addAbyssBlockerSite()">Add Site</button>
        </div>
      ` : ""}
      ${blockedListHtml}
    </div>
  `;
}

function renderCompactSettingsView() {
  const sec = state.activeSettingsSection;
  const s = state.settings;
  const effectiveSleepSec = s.tabSleepEnabled ? (s.tabSleepSeconds || 60) : 0;

  let bodyHtml = "";
  if (sec === "account") {
    const signedIn = Boolean(abyssSession?.user);
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Account &amp; Cloud Sync</div>
        <div class="account-settings-status">
          <div class="account-settings-avatar">${signedIn ? escapeHtml(getAccountInitial()) : "G"}</div>
          <div><strong>${signedIn ? escapeHtml(getAccountDisplayName()) : "Guest mode"}</strong><p>${signedIn ? escapeHtml(abyssSession.user.email || "Signed in") : "No account required to use Abyss."}</p></div>
          <span class="account-mode-pill">${signedIn ? "SYNC ON" : "GUEST"}</span>
        </div>
        <p class="account-settings-copy">${signedIn ? "Your browser settings, tabs, notes, tasks, bookmarks, and app details sync to your account." : "Guest data is saved on this device. Register or log in only when you want cloud sync and account restore."}</p>
        <div class="setting-row">
          <div class="setting-info"><h4>${signedIn ? "Sync account data" : "Register or log in"}</h4><p>${signedIn ? "Save your latest Abyss data to Supabase now." : "Your existing guest data will be kept; cloud data is restored when you sign in."}</p></div>
          <button class="btn btn-sm btn-primary" onclick="${signedIn ? "syncCloudNow()" : "openAccountAuth('signup')"}">${signedIn ? "Sync now" : "Get started"}</button>
        </div>
        ${signedIn ? `<div class="setting-row"><div class="setting-info"><h4>Sign out</h4><p>Abyss stays available in guest mode after signing out.</p></div><button class="btn btn-sm" onclick="signOutOfAbyss()">Sign out</button></div>` : `<div class="setting-row"><div class="setting-info"><h4>Already have an account?</h4><p>Log in to restore your saved cloud data.</p></div><button class="btn btn-sm" onclick="openAccountAuth('login')">Log in</button></div>`}
      </div>
      <div class="card-panel"><div class="panel-heading">What syncs?</div><div class="list-item"><span class="list-item-title">Settings, theme, bookmarks, notes, tasks, habits, and recent history</span><span>Cloud</span></div><div class="list-item"><span class="list-item-title">Open tabs and app details</span><span>Cloud</span></div><div class="list-item"><span class="list-item-title">Uploaded app bundles and browser data</span><span>Device</span></div><p class="account-settings-copy">Permanent uploaded HTML/ZIP apps are backed up to private cloud storage for signed-in accounts. Guest uploads remain on this device until exported with Save &amp; Backup.</p></div>
    `;
  } else if (sec === "appearance") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Theme, Accent &amp; Typography</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Surface Theme</h4>
            <p>Switch Abyss between 5 distinct color themes.</p>
          </div>
          <div class="swatch-group">
            <button class="theme-pill ${s.theme === "clean-white" ? "active" : ""}" onclick="updateSetting('theme', 'clean-white')">Clean White</button>
            <button class="theme-pill ${s.theme === "midnight-dark" ? "active" : ""}" onclick="updateSetting('theme', 'midnight-dark')">Midnight Dark</button>
            <button class="theme-pill ${s.theme === "soft-paper" ? "active" : ""}" onclick="updateSetting('theme', 'soft-paper')">Soft Paper</button>
            <button class="theme-pill ${s.theme === "deep-abyss" ? "active" : ""}" onclick="updateSetting('theme', 'deep-abyss')">Deep Abyss</button>
            <button class="theme-pill ${s.theme === "cyber-matrix" ? "active" : ""}" onclick="updateSetting('theme', 'cyber-matrix')">Cyber Matrix</button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Accent Color</h4>
            <p>Customize highlights, buttons, and animated character accents.</p>
          </div>
          <div class="swatch-group">
            <button class="accent-dot ${s.accent === "blue" ? "active" : ""}" style="background:#2563eb;" title="Blue" onclick="updateSetting('accent', 'blue')"></button>
            <button class="accent-dot ${s.accent === "emerald" ? "active" : ""}" style="background:#059669;" title="Emerald" onclick="updateSetting('accent', 'emerald')"></button>
            <button class="accent-dot ${s.accent === "violet" ? "active" : ""}" style="background:#7c3aed;" title="Violet" onclick="updateSetting('accent', 'violet')"></button>
            <button class="accent-dot ${s.accent === "coral" ? "active" : ""}" style="background:#e11d48;" title="Coral" onclick="updateSetting('accent', 'coral')"></button>
            <button class="accent-dot ${s.accent === "amber" ? "active" : ""}" style="background:#d97706;" title="Amber" onclick="updateSetting('accent', 'amber')"></button>
            <button class="accent-dot ${s.accent === "cyan" ? "active" : ""}" style="background:#0891b2;" title="Cyan" onclick="updateSetting('accent', 'cyan')"></button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Browser Font Style</h4>
            <p>Choose clean Sans, Developer Mono, or Rounded UI text.</p>
          </div>
          <select class="select-input" onchange="updateSetting('fontFamily', this.value)">
            <option value="sans" ${s.fontFamily === "sans" ? "selected" : ""}>System Sans</option>
            <option value="mono" ${s.fontFamily === "mono" ? "selected" : ""}>Developer Mono</option>
            <option value="rounded" ${s.fontFamily === "rounded" ? "selected" : ""}>Friendly Rounded</option>
          </select>
        </div>
      </div>

      <div class="card-panel">
        <div class="panel-heading">Custom Cursor, Sound &amp; Robot Mascot</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Custom Pointer Style</h4>
            <p>Choose your cursor style inside Abyss.</p>
          </div>
          <select class="select-input" onchange="updateSetting('cursorStyle', this.value)">
            <option value="default" ${s.cursorStyle === "default" ? "selected" : ""}>Standard Pointer</option>
            <option value="crosshair" ${s.cursorStyle === "crosshair" ? "selected" : ""}>Precision Crosshair</option>
            <option value="cyber" ${s.cursorStyle === "cyber" ? "selected" : ""}>Cyber Target Ring</option>
            <option value="neon-dot" ${s.cursorStyle === "neon-dot" ? "selected" : ""}>Emerald Halo Dot</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Robot Sound Effects &amp; Chimes</h4>
            <p>Synthesized clicks and chimes on navigation.</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-sm" onclick="playRobotSound('chime')">Test Chime</button>
            <label class="switch">
              <input type="checkbox" ${s.soundEffects ? "checked" : ""} onchange="updateSetting('soundEffects', this.checked)" />
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Idle Robot Cog Animation</h4>
            <p>Spin the robot settings gear gently when idle.</p>
          </div>
          <select class="select-input" onchange="updateSetting('robotAnimation', this.value)">
            <option value="idle" ${s.robotAnimation === "idle" ? "selected" : ""}>Smooth Idle Spin</option>
            <option value="off" ${s.robotAnimation === "off" ? "selected" : ""}>Paused</option>
          </select>
        </div>
      </div>
    `;
  } else if (sec === "blocker") {
    bodyHtml = renderAbyssBlockerSettingsPanel();
  } else if (sec === "widgets") {
    const widgetDefs = [
      ["clock", "Live Clock, Stopwatch & Focus Timer", "Digital clock plus built-in stopwatch and countdown timer."],
      ["notes", "Quick Sticky Notes Pad", "Auto-saved scratchpad right below the search bar."],
      ["calculator", "Mini Calculator", "Compact arithmetic calculator with expression history."],
      ["todo", "Quick Task Checklist", "Track daily tasks and check them off on your Home screen."],
      ["pomodoro", "Pomodoro Focus Studio", "25m Focus, 5m Short Break, and 15m Long Break timer with session counter."],
      ["weather", "Live Weather & Forecast", "Check live temperature and wind conditions for any city."],
      ["dictionary", "Quick Dictionary & Definitions", "Instant English word definitions with voice read-aloud."],
      ["textTools", "Text & Dev Utility", "Live word/character counter, UPPER/lower case, and Base64 encoder/decoder."],
      ["habits", "Daily Habit Tracker", "Track daily habits and reset each day with one click."],
      ["percentage", "Percentage & Tip Solver", "Fast percentage and total calculator right on your Home screen."],
      ["converter", "Unit Converter", "Convert Temperature, Miles/KM, Lbs/KG, and GB/MB."],
      ["randomizer", "Random & Dice Studio", "Roll D6/D20 dice, flip a coin, or generate strong keys."],
      ["colorStudio", "Color & Custom Accent Studio", "Pick any hex color and theme Abyss live."],
      ["systemMonitor", "Tab & Memory Pulse Monitor", "View active/sleeping tab stats and sleep idle tabs."]
    ];
    const activeCount = Object.values(s.widgets).filter(Boolean).length;
    const atLimit = activeCount >= MAX_ACTIVE_WIDGETS;
    bodyHtml = `
      <div class="card-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
          <div class="panel-heading" style="margin:0;">Home Utility Widgets (${widgetDefs.length} Options)</div>
          <span class="blocker-status-badge ${atLimit ? "is-on" : "is-off"}">
            ${activeCount} / ${MAX_ACTIVE_WIDGETS} Active (Max ${MAX_ACTIVE_WIDGETS})
          </span>
        </div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
          Choose up to <strong>${MAX_ACTIVE_WIDGETS}</strong> active widgets to show on your Abyss Home screen at once. Turn off an active widget to swap in any other utility.
        </p>
        <div id="widget-limit-notice" style="font-size:11.5px;color:var(--warning);font-weight:600;margin-bottom:6px;"></div>
        ${widgetDefs.map(([key, title, desc]) => {
          const isChecked = Boolean(s.widgets[key]);
          const disableSwitch = !isChecked && atLimit;
          return `
            <div class="setting-row">
              <div class="setting-info">
                <h4>${title}</h4>
                <p>${desc}</p>
              </div>
              <label class="switch" title="${disableSwitch ? "Turn off one of your 4 active widgets first" : "Toggle widget"}">
                <input type="checkbox" ${isChecked ? "checked" : ""} ${disableSwitch ? "disabled" : ""} onchange="toggleWidget('${key}', this.checked)" />
                <span class="slider"></span>
              </label>
            </div>
          `;
        }).join("")}
        <div class="setting-row">
          <div class="setting-info">
            <h4>Show Quick Sites Section on Home</h4>
            <p>Display pinned websites below your permanent apps.</p>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.showQuickSites ? "checked" : ""} onchange="updateSetting('showQuickSites', this.checked)" />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
  } else if (sec === "browsing") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Web Safe View &amp; Search Behavior</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Default Site Loading Mode</h4>
            <p>"Smart Auto" opens websites through Abyss Safe View so frame-blocking errors never occur.</p>
          </div>
          <select class="select-input" onchange="updateSetting('defaultWebMode', this.value)">
            <option value="live" ${s.defaultWebMode === "live" || s.defaultWebMode === "auto" ? "selected" : ""}>Live Frame (direct)</option>
            <option value="proxy" ${s.defaultWebMode === "proxy" ? "selected" : ""}>Proxy Frame</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Open Searches &amp; Links in New Tab</h4>
            <p>Automatically open search bar submissions in a fresh tab.</p>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.openLinksInNewTab ? "checked" : ""} onchange="updateSetting('openLinksInNewTab', this.checked)" />
            <span class="slider"></span>
          </label>
        </div>
      </div>
    `;
  } else if (sec === "performance") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Tab Sleep &amp; Auto-Clear History</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Tab Sleep / Memory Saver</h4>
            <p>Pause inactive background tabs while keeping your exact page state preserved.</p>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.tabSleepEnabled && effectiveSleepSec > 0 ? "checked" : ""} onchange="handleTabSleepToggle(this.checked)" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Background Tab Sleep Delay</h4>
            <p>Choose how long a background tab waits before sleeping, or pick Never.</p>
          </div>
          <select class="select-input" onchange="handleTabSleepDelayChange(this.value)">
            <option value="never" ${effectiveSleepSec === 0 ? "selected" : ""}>Never</option>
            <option value="30" ${effectiveSleepSec === 30 ? "selected" : ""}>30 Seconds</option>
            <option value="60" ${effectiveSleepSec === 60 ? "selected" : ""}>1 Minute</option>
            <option value="300" ${effectiveSleepSec === 300 ? "selected" : ""}>5 Minutes</option>
            <option value="900" ${effectiveSleepSec === 900 ? "selected" : ""}>15 Minutes</option>
            <option value="1800" ${effectiveSleepSec === 1800 ? "selected" : ""}>30 Minutes</option>
            <option value="3600" ${effectiveSleepSec === 3600 ? "selected" : ""}>1 Hour</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Sleep Background Tabs Now</h4>
            <p>Manually put all inactive tabs to sleep right now.</p>
          </div>
          <button class="btn btn-sm" onclick="sleepInactiveTabsNow()">Sleep Inactive Tabs</button>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Auto-Clear History Timer</h4>
            <p>Automatically wipe tab history after inactivity, on close, or Never.</p>
          </div>
          <select class="select-input" onchange="updateSetting('autoClearHistory', this.value)">
            <option value="off" ${s.autoClearHistory === "off" ? "selected" : ""}>Never (Keep History)</option>
            <option value="5min" ${s.autoClearHistory === "5min" ? "selected" : ""}>After 5 Mins Idle</option>
            <option value="15min" ${s.autoClearHistory === "15min" ? "selected" : ""}>After 15 Mins Idle</option>
            <option value="60min" ${s.autoClearHistory === "60min" ? "selected" : ""}>After 1 Hour Idle</option>
            <option value="onclose" ${s.autoClearHistory === "onclose" ? "selected" : ""}>When Abyss Closes</option>
          </select>
        </div>
      </div>
    `;
  } else if (sec === "permissions") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Speaker &amp; Voice Search Controls</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Speaker &amp; Microphone Access</h4>
            <p>"Ask" triggers the direct site permission prompt toast when clicked.</p>
          </div>
          <select class="select-input" onchange="updateSetting('voicePermission', this.value)">
            <option value="ask" ${s.voicePermission === "ask" ? "selected" : ""}>Ask (Site Toast)</option>
            <option value="allow" ${s.voicePermission === "allow" ? "selected" : ""}>Allow</option>
            <option value="block" ${s.voicePermission === "block" ? "selected" : ""}>Block</option>
          </select>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Auto-Submit Voice Search</h4>
            <p>When ON, spoken words enter the search bar and search automatically. When OFF, words stay in the search bar for editing.</p>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.voiceAutoSubmit ? "checked" : ""} onchange="updateSetting('voiceAutoSubmit', this.checked)" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Spoken Audio Confirmation (TTS)</h4>
            <p>Speak back when opening pages via voice.</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <button class="btn btn-sm" onclick="speakText('Abyss speaker and voice system is online.')">Test Voice</button>
            <label class="switch">
              <input type="checkbox" ${s.voiceReadback ? "checked" : ""} onchange="updateSetting('voiceReadback', this.checked)" />
              <span class="slider"></span>
            </label>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Voice Recognition Language</h4>
            <p>Select spoken dialect for the search bar mic.</p>
          </div>
          <select class="select-input" onchange="updateSetting('voiceLang', this.value)">
            <option value="en-US" ${s.voiceLang === "en-US" ? "selected" : ""}>English (US)</option>
            <option value="en-GB" ${s.voiceLang === "en-GB" ? "selected" : ""}>English (UK)</option>
            <option value="es-ES" ${s.voiceLang === "es-ES" ? "selected" : ""}>Spanish</option>
            <option value="fr-FR" ${s.voiceLang === "fr-FR" ? "selected" : ""}>French</option>
            <option value="de-DE" ${s.voiceLang === "de-DE" ? "selected" : ""}>German</option>
            <option value="ja-JP" ${s.voiceLang === "ja-JP" ? "selected" : ""}>Japanese</option>
          </select>
        </div>
      </div>
    `;
  } else if (sec === "savedemo") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Backup, Save Code &amp; Reset</div>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
          Abyss automatically saves your open tabs, permanent uploaded apps, settings, notes, tasks, bookmarks, and Abyss.Blocker list locally. You can also export a portable backup code below:
        </p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <button class="btn btn-sm btn-primary" onclick="generateSaveCode()">Generate Code</button>
          <button class="btn btn-sm" onclick="copySaveCode()">Copy Code</button>
          <span id="copy-feedback-msg" style="font-size:11.5px;font-weight:600;"></span>
        </div>
        <textarea class="save-code-box" id="export-save-output" readonly placeholder="Click 'Generate Code' to create your ABYSS-SAVE code..."></textarea>
        <div style="margin-top:14px;">
          <textarea class="save-code-box" id="import-save-input" placeholder="Paste an ABYSS-SAVE::... code here to restore..."></textarea>
          <div style="margin-top:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-sm btn-primary" onclick="importSaveCode()">Import Code</button>
            <button class="btn btn-sm btn-danger" onclick="resetAllAbyssData()">Reset All Data</button>
            <span id="save-status-msg" style="font-size:12px;font-weight:600;"></span>
          </div>
        </div>
      </div>
    `;
  } else if (sec === "shortcuts") {
    bodyHtml = `
      <div class="card-panel">
        <div class="panel-heading">Keyboard Shortcuts &amp; In-Tab Priority</div>
        <div class="setting-row">
          <div class="setting-info">
            <h4>Prioritize In-Tab Website &amp; Game Shortcuts</h4>
            <p>When inside a website or game tab, let Ctrl+W, Esc, WASD, and site hotkeys pass directly to the tab instead of closing or leaving it.</p>
          </div>
          <label class="switch">
            <input type="checkbox" ${s.prioritizeTabShortcuts !== false ? "checked" : ""} onchange="updateSetting('prioritizeTabShortcuts', this.checked)" />
            <span class="slider"></span>
          </label>
        </div>
        <div class="list-item"><span class="list-item-title">Open New Abyss Tab</span><code>Ctrl + T / Alt + Shift + T</code></div>
        <div class="list-item"><span class="list-item-title">Close Current Tab</span><code>Ctrl + W / Alt + Shift + W</code></div>
        <div class="list-item"><span class="list-item-title">Focus Address / Search Bar</span><code>Ctrl + L</code></div>
        <div class="list-item"><span class="list-item-title">Exit Game Fullscreen</span><code>Esc (on outer bar)</code></div>
      </div>
    `;
  }

  return `
    <div class="page-shell">
      <div class="page-header">
        <div class="page-title-group">
          <h1>Abyss Settings</h1>
          <p>Control center, themes, home widgets &amp; Abyss.Blocker</p>
        </div>
        <button class="btn btn-sm" onclick="navigateTab('abyss://home', 'Abyss Home')">&larr; Home</button>
      </div>
      <div class="settings-compact-layout">
        <aside class="settings-sidebar">
          <button class="settings-nav-item ${sec === "appearance" ? "active" : ""}" onclick="setSettingsSection('appearance')">Theme &amp; Cursor</button>
          <button class="settings-nav-item ${sec === "blocker" ? "active" : ""}" onclick="setSettingsSection('blocker')">
            <span>Abyss.Blocker</span>
            <span style="font-size:10px;opacity:0.8;">${s.abyssBlocker?.enabled ? "ON" : "OFF"}</span>
          </button>
          <button class="settings-nav-item ${sec === "widgets" ? "active" : ""}" onclick="setSettingsSection('widgets')">Home Widgets</button>
          <button class="settings-nav-item ${sec === "browsing" ? "active" : ""}" onclick="setSettingsSection('browsing')">Web &amp; Safe Mode</button>
          <button class="settings-nav-item ${sec === "performance" ? "active" : ""}" onclick="setSettingsSection('performance')">Sleep &amp; Timers</button>
          <button class="settings-nav-item ${sec === "permissions" ? "active" : ""}" onclick="setSettingsSection('permissions')">Speaker &amp; Voice</button>
          <button class="settings-nav-item ${sec === "savedemo" ? "active" : ""}" onclick="setSettingsSection('savedemo')">Save &amp; Backup</button>
          <button class="settings-nav-item ${sec === "shortcuts" ? "active" : ""}" onclick="setSettingsSection('shortcuts')">Shortcuts &amp; Help</button>
          <div class="settings-sidebar-divider"></div>
          <button class="settings-nav-item" onclick="openOrFocusSpecialTab('abyss://history', 'History')">
            <span>History Tab</span><span>&rarr;</span>
          </button>
          <button class="settings-nav-item" onclick="openOrFocusSpecialTab('abyss://apps', 'My Local Apps')">
            <span>Permanent Apps</span><span>&rarr;</span>
          </button>
        </aside>
        <div>${bodyHtml}</div>
      </div>
    </div>
  `;
}

// ==================== SAVE & BACKUP ====================
function generateSaveCode() {
  const payload = {
    version: "6.0",
    settings: state.settings,
    stickyNote: state.stickyNote,
    todoItems: state.todoItems,
    habitItems: state.habitItems,
    quickSites: state.quickSites,
    customApps: state.customApps.map(({ loadedHtml, ...rest }) => rest)
  };
  const encoded = "ABYSS-SAVE::" + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const box = document.getElementById("export-save-output");
  if (box) box.value = encoded;
}

function copySaveCode() {
  const box = document.getElementById("export-save-output");
  if (!box || !box.value) generateSaveCode();
  const code = document.getElementById("export-save-output").value;
  safeCopyText(code, "export-save-output", "copy-feedback-msg");
}

function importSaveCode() {
  const raw = document.getElementById("import-save-input").value.trim();
  const msg = document.getElementById("save-status-msg");
  try {
    const clean = raw.replace(/^ABYSS-(DEMO|SAVE)::/, "");
    if (clean === raw) throw new Error("Invalid prefix");
    const jsonStr = decodeURIComponent(escape(atob(clean)));
    const parsed = JSON.parse(jsonStr);
    if (parsed.settings) {
      state.settings = {
        ...state.settings,
        ...parsed.settings,
        abyssBlocker: {
          ...state.settings.abyssBlocker,
          ...(parsed.settings.abyssBlocker || {})
        },
        widgets: enforceMaxFourWidgets(parsed.settings.widgets)
      };
    }
    if (typeof parsed.stickyNote === "string") state.stickyNote = parsed.stickyNote;
    if (Array.isArray(parsed.todoItems)) state.todoItems = parsed.todoItems;
    if (Array.isArray(parsed.habitItems)) state.habitItems = parsed.habitItems;
    if (Array.isArray(parsed.quickSites)) state.quickSites = parsed.quickSites;
    if (Array.isArray(parsed.customApps)) {
      state.customApps = parsed.customApps.map(app => ({ ...app, loadedHtml: null }));
    }
    state.abyssBlockerUnlocked = false;
    savePersistentState();
    renderAll(true);
    const updatedMsg = document.getElementById("save-status-msg");
    if (updatedMsg) {
      updatedMsg.style.color = "var(--success)";
      updatedMsg.textContent = "Backup restored successfully!";
    }
  } catch {
    if (msg) {
      msg.style.color = "var(--danger)";
      msg.textContent = "Invalid backup code.";
    }
  }
}

function resetAllAbyssData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  try { indexedDB.deleteDatabase(APPS_DB_NAME); } catch {}
  Object.keys(renderedPaneSignatures).forEach(k => delete renderedPaneSignatures[k]);
  document.getElementById("viewport").innerHTML = "";
  Object.assign(state, JSON.parse(JSON.stringify(defaultState)));
  createTab("abyss://home", "Abyss Home");
}

// ==================== SPECIALIZED HISTORY TAB ====================
function renderHistoryTabView() {
  const itemsHtml = state.historyLog.length
    ? state.historyLog.map((item, idx) => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(item.title)}</div>
            <div class="list-item-meta">${escapeHtml(item.time)} &bull; ${escapeHtml(item.route)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm" onclick="handleUserSearchOrUrl('${escapeAttr(item.route)}')">Reopen</button>
            <button class="btn btn-sm btn-danger" onclick="deleteHistoryItem(${idx})">&times;</button>
          </div>
        </div>
      `).join("")
    : `<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px;">No browsing history recorded.</p>`;

  return `
    <div class="page-shell">
      <div class="page-header">
        <div class="page-title-group">
          <h1>Tab &amp; Search History</h1>
          <p>Auto-Clear Mode: <strong>${state.settings.autoClearHistory === "off" ? "Never" : state.settings.autoClearHistory}</strong></p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" onclick="openOrFocusSpecialTab('abyss://settings', 'Settings')">Settings</button>
          <button class="btn btn-sm btn-danger" onclick="clearHistory()">Clear All</button>
        </div>
      </div>
      ${itemsHtml}
    </div>
  `;
}

function deleteHistoryItem(idx) {
  playRobotSound("click");
  state.historyLog.splice(idx, 1);
  savePersistentState();
  renderViewport(true);
}

// ==================== PERMANENT .HTML & .ZIP APP LOADER (CUSTOM LINKS) ====================
function getMimeType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    mjs: "text/javascript",
    json: "application/json",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    ico: "image/x-icon",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
    wasm: "application/wasm",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    txt: "text/plain",
    xml: "application/xml"
  };
  return map[ext] || "application/octet-stream";
}

function normalizeZipPath(baseDir, rawRef) {
  const cleanRef = rawRef.split("?")[0].split("#")[0].trim();
  if (!cleanRef) return "";
  const baseParts = baseDir ? baseDir.split("/").filter(Boolean) : [];
  const refParts = cleanRef.replace(/^\//, "").split("/");
  const stack = cleanRef.startsWith("/") ? [] : [...baseParts];
  for (const part of refParts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

async function extractZipEntriesFallback(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error("Not a valid ZIP archive");
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder("utf-8");
  const files = [];
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const name = decoder.decode(bytes.slice(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compSlice = bytes.slice(dataStart, dataStart + compSize);
    let rawBuffer;
    if (method === 0) {
      rawBuffer = compSlice.buffer.slice(compSlice.byteOffset, compSlice.byteOffset + compSlice.byteLength);
    } else if (method === 8 && typeof DecompressionStream !== "undefined") {
      const ds = new DecompressionStream("deflate-raw");
      const writer = ds.writable.getWriter();
      writer.write(compSlice);
      writer.close();
      rawBuffer = await new Response(ds.readable).arrayBuffer();
    } else {
      continue;
    }
    files.push({ name, buffer: rawBuffer });
  }
  return files;
}

function buildRunnableHtmlFromExtractedEntries(extracted) {
  const htmlFiles = extracted
    .filter(f => /\.html?$/i.test(f.name))
    .sort((a, b) => a.name.split("/").length - b.name.split("/").length);

  if (!htmlFiles.length) {
    throw new Error("No .html file found inside the ZIP archive.");
  }

  const mainHtmlFile =
    htmlFiles.find(f => /(^|\/)index\.html?$/i.test(f.name)) ||
    htmlFiles.find(f => /(^|\/)index2\.html?$/i.test(f.name)) ||
    htmlFiles[0];

  const baseDir = mainHtmlFile.name.includes("/")
    ? mainHtmlFile.name.slice(0, mainHtmlFile.name.lastIndexOf("/") + 1)
    : "";

  const decoder = new TextDecoder("utf-8");
  const blobUrlByFullPath = {};
  const textByFullPath = {};

  for (const item of extracted) {
    const mime = getMimeType(item.name);
    if (mime === "text/css" || mime === "text/javascript" || mime === "text/html" || mime === "application/json") {
      textByFullPath[item.name] = decoder.decode(item.buffer);
    }
    const typedBlob = new Blob([item.buffer], { type: mime });
    blobUrlByFullPath[item.name] = URL.createObjectURL(typedBlob);
  }

  for (const item of extracted) {
    if (getMimeType(item.name) === "text/css" && textByFullPath[item.name]) {
      const cssDir = item.name.includes("/") ? item.name.slice(0, item.name.lastIndexOf("/") + 1) : "";
      const rewrittenCss = textByFullPath[item.name].replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (full, quote, ref) => {
        if (/^(https?:|data:|blob:|#)/i.test(ref)) return full;
        const resolved = normalizeZipPath(cssDir, ref);
        if (blobUrlByFullPath[resolved]) {
          return `url("${blobUrlByFullPath[resolved]}")`;
        }
        return full;
      });
      textByFullPath[item.name] = rewrittenCss;
      blobUrlByFullPath[item.name] = URL.createObjectURL(new Blob([rewrittenCss], { type: "text/css" }));
    }
  }

  const rawHtml = textByFullPath[mainHtmlFile.name];
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");

  doc.querySelectorAll("link[href]").forEach(linkEl => {
    const href = linkEl.getAttribute("href");
    if (!href || /^(https?:|data:|blob:|#)/i.test(href)) return;
    const resolved = normalizeZipPath(baseDir, href);
    if (linkEl.rel && linkEl.rel.toLowerCase() === "stylesheet" && textByFullPath[resolved]) {
      const styleTag = doc.createElement("style");
      styleTag.textContent = textByFullPath[resolved];
      linkEl.replaceWith(styleTag);
    } else if (blobUrlByFullPath[resolved]) {
      linkEl.setAttribute("href", blobUrlByFullPath[resolved]);
    }
  });

  doc.querySelectorAll("script[src]").forEach(scriptEl => {
    const src = scriptEl.getAttribute("src");
    if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
    const resolved = normalizeZipPath(baseDir, src);
    if (blobUrlByFullPath[resolved]) {
      scriptEl.setAttribute("src", blobUrlByFullPath[resolved]);
    }
  });

  doc.querySelectorAll("[src], [href]").forEach(el => {
    if (el.tagName === "SCRIPT" || el.tagName === "LINK") return;
    const attr = el.hasAttribute("src") ? "src" : "href";
    const val = el.getAttribute(attr);
    if (!val || /^(https?:|data:|blob:|#|mailto:|javascript:)/i.test(val)) return;
    const resolved = normalizeZipPath(baseDir, val);
    if (blobUrlByFullPath[resolved]) {
      el.setAttribute(attr, blobUrlByFullPath[resolved]);
    }
  });

  return {
    html: "<!DOCTYPE html>\n" + doc.documentElement.outerHTML,
    entryName: mainHtmlFile.name,
    assetCount: extracted.length
  };
}

async function buildRunnableHtmlFromZipFile(file) {
  const extracted = [];
  if (typeof JSZip !== "undefined") {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter(f => !f.dir && !f.name.startsWith("__MACOSX/"));
    for (const entry of entries) {
      const buffer = await entry.async("arraybuffer");
      extracted.push({ name: entry.name, buffer });
    }
  } else {
    const buf = await file.arrayBuffer();
    const fallbackFiles = await extractZipEntriesFallback(buf);
    extracted.push(...fallbackFiles);
  }

  const built = buildRunnableHtmlFromExtractedEntries(extracted);
  return {
    ...built,
    extracted
  };
}

function renderAppsManagerTabView() {
  const listHtml = state.customApps.map((app, idx) => {
    const routeLabel = app.customRoute || app.path;
    return `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">[${escapeHtml(app.badge || "AP")}] ${escapeHtml(app.name)}</div>
          <div class="list-item-meta">Link: <code>${escapeHtml(routeLabel)}</code> ${app.loadedFileName ? " &bull; Permanent File: " + escapeHtml(app.loadedFileName) : ""}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="safeCopyText(${JSON.stringify(routeLabel)})">Copy Link</button>
          <button class="btn btn-sm btn-primary" onclick="launchCustomApp('${app.id}')">Open Page</button>
          ${!app.isBuiltInTool && idx > 1 ? `<button class="btn btn-sm btn-danger" onclick="removeCustomApp(${idx})">Delete</button>` : ""}
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="page-shell">
      <div class="page-header">
        <div class="page-title-group">
          <h1>Permanent Apps &amp; Local Files (.HTML &amp; .ZIP)</h1>
          <p>Upload any <code>.html</code> file or <code>.zip</code> project to turn it into a <strong>permanent app page</strong> with its own custom link (<code>abyss://app/...</code>).</p>
        </div>
        <button class="btn btn-sm" onclick="navigateTab('abyss://home', 'Abyss Home')">&larr; Home</button>
      </div>

      <div class="card-panel">
        <div class="panel-heading">Upload .ZIP or .HTML as a Permanent App with Custom Link</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <input type="text" class="text-input" id="upload-new-app-name" placeholder="App Name (e.g. My YouTube)" style="flex:1;min-width:155px;" />
          <input type="text" class="text-input" id="upload-new-app-route" placeholder="Custom Link (e.g. abyss://app/my-youtube)" style="flex:1;min-width:185px;" />
          <label class="btn btn-sm btn-primary" style="cursor:pointer;">
            Upload .ZIP or .HTML
            <input type="file" accept=".html,.htm,.zip" style="display:none;" onchange="createAppFromUploadedFile(event)" />
          </label>
        </div>
        <div id="upload-app-feedback" style="font-size:12px;margin-top:6px;font-weight:600;"></div>
      </div>

      <div class="card-panel">
        <div class="panel-heading">Add Web URL or Custom Shortcut</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input type="text" class="text-input" id="new-app-name" placeholder="App Name" style="flex:1;min-width:130px;" />
          <input type="text" class="text-input" id="new-app-path" placeholder="https://example.com" style="flex:2;min-width:200px;" />
          <button class="btn btn-sm btn-primary" onclick="addCustomApp()">Add App</button>
        </div>
      </div>

      ${listHtml}
    </div>
  `;
}

async function createAppFromUploadedFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const feedback = document.getElementById("upload-app-feedback");
  const customNameInput = (document.getElementById("upload-new-app-name")?.value || "").trim();
  const customRouteInput = (document.getElementById("upload-new-app-route")?.value || "").trim();
  const baseName = customNameInput || file.name.replace(/\.(zip|html?)$/i, "");
  const isZip = /\.zip$/i.test(file.name);
  const newId = "app_" + Date.now();
  const customRoute = ensureUniqueCustomRoute(customRouteInput || baseName);

  try {
    let loadedHtml = "";
    let subtitle = "Permanent HTML App";
    if (isZip) {
      if (feedback) {
        feedback.style.color = "var(--accent)";
        feedback.textContent = `Extracting & saving permanent ZIP app "${file.name}"...`;
      }
      const built = await buildRunnableHtmlFromZipFile(file);
      loadedHtml = built.html;
      subtitle = customRoute;
      await savePermanentAppBundle(newId, {
        kind: "zip",
        files: built.extracted,
        loadedFileName: file.name
      });
    } else {
      loadedHtml = await file.text();
      subtitle = customRoute;
      await savePermanentAppBundle(newId, {
        kind: "html",
        html: loadedHtml,
        loadedFileName: file.name
      });
    }

    const newApp = {
      id: newId,
      name: baseName,
      subtitle,
      customRoute,
      path: customRoute,
      badge: baseName.slice(0, 2).toUpperCase(),
      bg: "#dbeafe",
      color: "#1d4ed8",
      loadedHtml,
      loadedFileName: file.name
    };
    state.customApps.push(newApp);
    playRobotSound("chime");
    savePersistentState();
    launchCustomApp(newApp.id);
  } catch (err) {
    playRobotSound("denied");
    if (feedback) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = err.message || "Could not load file.";
    }
  }
}

function renderLocalAppRunnerView(payload) {
  const app = state.customApps.find(a => a.id === payload?.appId);
  const title = app ? app.name : "Local File Launcher";
  const customLink = app ? (app.customRoute || slugifyAppRoute(app.name)) : "abyss://local-app";
  const hasLoadedContent = Boolean(app && app.loadedHtml);

  return `
    <div class="page-shell">
      <div class="page-header">
        <div class="page-title-group">
          <h1>${escapeHtml(title)}</h1>
          <p>Permanent App Link: <code>${escapeHtml(customLink)}</code></p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="safeCopyText(${JSON.stringify(customLink)})">Copy Custom Link</button>
          ${hasLoadedContent ? `<button class="btn btn-sm btn-primary" onclick="navigateTab('abyss://perm-app', ${JSON.stringify(title)}, { appId: ${JSON.stringify(app.id)}, customRoute: ${JSON.stringify(customLink)} })">Open Full Page &rarr;</button>` : ""}
          <button class="btn btn-sm" onclick="navigateTab('abyss://home', 'Abyss Home')">&larr; Home</button>
        </div>
      </div>

      <div class="local-runner-box">
        ${getCharacterSvg("arcade-bot", 54)}
        <h3 style="margin-top:6px;">Upload Permanent <code>.HTML</code> File or <code>.ZIP</code> Project</h3>
        <p style="font-size:12.5px;color:var(--text-secondary);max-width:520px;margin:6px auto 12px;">
          Select a single <code>.html</code> file or a full <code>.zip</code> project. It saves permanently and runs under <code>${escapeHtml(customLink)}</code>.
        </p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
          <label class="btn btn-primary" style="cursor:pointer;">
            Choose .HTML or .ZIP File
            <input type="file" accept=".html,.htm,.zip" style="display:none;" onchange="handleLocalHtmlUpload(event, '${app ? app.id : ""}')" />
          </label>
        </div>
        <div id="zip-status-msg" style="font-size:12px;color:var(--accent);font-weight:600;margin-top:8px;">
          ${app?.loadedFileName ? `Permanent File Loaded: ${escapeHtml(app.loadedFileName)}` : ""}
        </div>
      </div>

      ${hasLoadedContent ? `
        <div class="game-stage-wrapper ${state.isGameFullscreen ? "is-fullscreen" : ""}" id="game-stage-wrapper">
          <div class="game-stage-bar">
            <span><strong>${escapeHtml(title)}</strong> &bull; ${escapeHtml(customLink)}</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-sm" style="padding:3px 9px;font-size:11px;" onclick="reloadCurrentTab()">Restart</button>
              <button class="btn btn-sm btn-primary" id="fullscreen-toggle-btn" style="padding:3px 9px;font-size:11px;" onclick="toggleGameFullscreen()">
                ${state.isGameFullscreen ? "Exit Fullscreen" : "Full Screen"}
              </button>
            </div>
          </div>
          <iframe class="game-sandbox-frame" title="${escapeAttr(title)}" sandbox="allow-scripts allow-forms allow-pointer-lock allow-modals allow-same-origin allow-popups allow-downloads allow-presentation" allow="fullscreen; autoplay; gamepad; clipboard-read; clipboard-write" allowfullscreen srcdoc="${escapeAttr(app.loadedHtml)}"></iframe>
        </div>
      ` : ""}
    </div>
  `;
}

function toggleGameFullscreen() {
  playRobotSound("click");
  const pane = document.querySelector(`.tab-pane[data-tab-id="${state.activeTabId}"]`);
  const wrapper = pane?.querySelector("#game-stage-wrapper") || pane?.querySelector(".inapp-browser-wrap");
  if (!wrapper) return;
  state.isGameFullscreen = !wrapper.classList.contains("is-fullscreen");
  wrapper.classList.toggle("is-fullscreen", state.isGameFullscreen);
  const btn = wrapper.querySelector("#fullscreen-toggle-btn, .content-fullscreen-btn");
  if (btn) btn.textContent = state.isGameFullscreen ? "Exit Fullscreen" : "⛶ Full Screen";
}

async function handleLocalHtmlUpload(event, appId) {
  const file = event.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById("zip-status-msg");
  const isZip = /\.zip$/i.test(file.name);

  try {
    let runnableHtml = "";
    if (isZip) {
      if (statusEl) statusEl.textContent = `Extracting & saving ${file.name} permanently...`;
      const built = await buildRunnableHtmlFromZipFile(file);
      runnableHtml = built.html;
      if (appId) {
        await savePermanentAppBundle(appId, {
          kind: "zip",
          files: built.extracted,
          loadedFileName: file.name
        });
      }
    } else {
      runnableHtml = await file.text();
      if (appId) {
        await savePermanentAppBundle(appId, {
          kind: "html",
          html: runnableHtml,
          loadedFileName: file.name
        });
      }
    }

    const app = state.customApps.find(a => a.id === appId);
    if (app) {
      app.loadedHtml = runnableHtml;
      app.loadedFileName = file.name;
      if (!app.customRoute) app.customRoute = ensureUniqueCustomRoute(app.name, app.id);
      app.subtitle = app.customRoute;
      savePersistentState();
      playRobotSound("chime");
      navigateTab("abyss://perm-app", app.name, { appId: app.id, customRoute: app.customRoute });
      return;
    }

    playRobotSound("chime");
    renderViewport(true);
  } catch (err) {
    playRobotSound("denied");
    if (statusEl) {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = err.message || "Failed to load archive.";
    }
  }
}

// ==================== BLOCKED VIEW ====================
function renderBlockedView(payload) {
  return `
    <div class="page-shell" style="text-align:center;max-width:480px;padding-top:48px;">
      ${getCharacterSvg("shield-bot", 74)}
      <h2 style="margin:10px 0 6px;">Blocked by Abyss.Blocker</h2>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
        This page or search is currently restricted by <strong>Abyss.Blocker</strong>.
      </p>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button class="btn btn-primary" onclick="navigateTab('abyss://home', 'Abyss Home')">Return Home</button>
        <button class="btn" onclick="setSettingsSection('blocker'); openOrFocusSpecialTab('abyss://settings', 'Settings')">Abyss.Blocker Settings</button>
      </div>
    </div>
  `;
}

// ==================== ACTIONS & MODALS ====================
function updateSetting(key, value) {
  playRobotSound("click");
  state.settings[key] = value;
  savePersistentState();
  renderAll(true);
}

function toggleWidget(widgetKey, enabled) {
  const activeCount = Object.values(state.settings.widgets).filter(Boolean).length;
  if (enabled && !state.settings.widgets[widgetKey] && activeCount >= MAX_ACTIVE_WIDGETS) {
    playRobotSound("denied");
    const notice = document.getElementById("widget-limit-notice");
    if (notice) {
      notice.textContent = `Maximum ${MAX_ACTIVE_WIDGETS} home widgets active. Turn off an active widget first.`;
    }
    renderViewport(true);
    return;
  }
  playRobotSound("click");
  state.settings.widgets[widgetKey] = enabled;
  savePersistentState();
  renderViewport(true);
}

function clearHistory() {
  playRobotSound("click");
  state.historyLog = [];
  savePersistentState();
  renderViewport(true);
}

function launchCustomApp(appId, forceNewTab = false) {
  const app = state.customApps.find(a => a.id === appId);
  if (!app) return;

  if (app.isBuiltInTool || app.customRoute === "abyss://yt-mp4") {
    if (forceNewTab) createTab("abyss://yt-mp4", app.name, {});
    else navigateTab("abyss://yt-mp4", app.name, {});
    return;
  }

  if (/^https?:\/\//i.test(app.path)) {
    handleUserSearchOrUrl(app.path, forceNewTab);
  } else if (app.loadedHtml) {
    const customRoute = app.customRoute || slugifyAppRoute(app.name);
    const payload = { appId: app.id, customRoute };
    if (forceNewTab) createTab("abyss://perm-app", app.name, payload);
    else navigateTab("abyss://perm-app", app.name, payload);
  } else {
    const payload = { appId: app.id };
    if (forceNewTab) createTab("abyss://local-app", app.name, payload);
    else navigateTab("abyss://local-app", app.name, payload);
  }
}

function addCustomApp() {
  const name = document.getElementById("new-app-name").value.trim();
  const path = document.getElementById("new-app-path").value.trim();
  if (!name || !path) return;
  playRobotSound("chime");
  const customRoute = /^https?:\/\//i.test(path) ? path : ensureUniqueCustomRoute(name);
  state.customApps.push({
    id: "app_" + Date.now(),
    name,
    subtitle: /^https?:\/\//i.test(path) ? "Web Shortcut" : customRoute,
    customRoute,
    path,
    badge: name.slice(0, 2).toUpperCase(),
    bg: "#e0e7ff",
    color: "#3730a3",
    loadedHtml: null
  });
  savePersistentState();
  renderViewport(true);
}

function removeCustomApp(idx) {
  playRobotSound("click");
  const removed = state.customApps[idx];
  if (removed?.id) deletePermanentAppBundle(removed.id);
  state.customApps.splice(idx, 1);
  savePersistentState();
  renderViewport(true);
}

function removeQuickSite(idx, e) {
  if (e) e.stopPropagation();
  playRobotSound("click");
  state.quickSites.splice(idx, 1);
  savePersistentState();
  renderViewport(true);
}

function toggleBookmarkCurrentSite() {
  const entry = getCurrentEntry();
  if (entry.route !== "abyss://web" || !entry.payload?.originalUrl) return;
  playRobotSound("chime");
  const url = entry.payload.originalUrl;
  const existingIdx = state.quickSites.findIndex(s => s.url === url);
  if (existingIdx >= 0) {
    state.quickSites.splice(existingIdx, 1);
  } else {
    const name = entry.title.slice(0, 18);
    state.quickSites.push({
      name,
      url,
      badge: name.slice(0, 2).toUpperCase(),
      bg: "#dbeafe",
      color: "#1d4ed8"
    });
  }
  savePersistentState();
  renderAll(false);
}

function openAddQuickSiteModal() {
  playRobotSound("click");
  const modal = document.getElementById("custom-modal");
  const content = document.getElementById("custom-modal-content");
  content.innerHTML = `
    <h3 style="margin-bottom:4px;">Pin In-App Quick Site</h3>
    <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Add any website to your Abyss Home shortcuts.</p>
    <input type="text" class="text-input" id="qs-name" placeholder="Site Name (e.g. MDN Docs)" style="width:100%;margin-bottom:8px;" />
    <input type="text" class="text-input" id="qs-url" placeholder="https://developer.mozilla.org" style="width:100%;margin-bottom:14px;" />
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn btn-sm" onclick="closeCustomModal()">Cancel</button>
      <button class="btn btn-sm btn-primary" onclick="saveNewQuickSite()">Pin Site</button>
    </div>
  `;
  modal.classList.remove("hidden");
}

function saveNewQuickSite() {
  const name = document.getElementById("qs-name").value.trim();
  let url = document.getElementById("qs-url").value.trim();
  if (!name || !url) return;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  playRobotSound("chime");
  state.quickSites.push({
    name,
    url,
    badge: name.slice(0, 2).toUpperCase(),
    bg: "#e0f2fe",
    color: "#0369a1"
  });
  savePersistentState();
  closeCustomModal();
  renderViewport(true);
}

function closeCustomModal() {
  document.getElementById("custom-modal").classList.add("hidden");
}

// ==================== OMNIBOX AUTOCOMPLETE & EVENT WIRING ====================
function updateOmniboxSuggestions(query) {
  const box = document.getElementById("omnibox-suggestions");
  const q = query.trim().toLowerCase();
  if (!q) {
    box.classList.add("hidden");
    return;
  }
  const matches = [];

  // Show live math preview in omnibox suggestions when typing an equation
  const mathPreview = evaluateLiveMathExpression(query);
  if (mathPreview) {
    matches.push({
      label: `= ${mathPreview.result}`,
      url: query.trim(),
      tag: "Math Answer"
    });
  }

  state.customApps.forEach(a => {
    const r = a.customRoute || a.path;
    if (a.name.toLowerCase().includes(q) || r.toLowerCase().includes(q)) {
      matches.push({ label: `${a.name} (${r})`, url: r, tag: "Permanent App" });
    }
  });
  state.quickSites.forEach(s => {
    if (s.name.toLowerCase().includes(q) || s.url.toLowerCase().includes(q)) {
      matches.push({ label: `${s.name} (${s.url})`, url: s.url, tag: "Quick Site" });
    }
  });
  state.historyLog.slice(0, 20).forEach(h => {
    if ((h.title.toLowerCase().includes(q) || h.route.toLowerCase().includes(q)) && !matches.some(m => m.url === h.route)) {
      matches.push({ label: `${h.title} — ${h.route}`, url: h.route, tag: "History" });
    }
  });
  if (!matches.length) {
    box.classList.add("hidden");
    return;
  }
  box.innerHTML = matches.slice(0, 5).map(m => `
    <div class="suggestion-row" onclick="handleUserSearchOrUrl('${escapeAttr(m.url)}')">
      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.label)}</span>
      <span class="suggestion-tag">${escapeHtml(m.tag)}</span>
    </div>
  `).join("");
  box.classList.remove("hidden");
}

function hideOmniboxSuggestions() {
  document.getElementById("omnibox-suggestions")?.classList.add("hidden");
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
}

function escapeAttr(str) {
  return String(str ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
}

document.getElementById("new-tab-btn").addEventListener("click", () => createTab("abyss://home", "Abyss Home"));
document.getElementById("sleep-all-btn").addEventListener("click", () => sleepInactiveTabsNow());
document.getElementById("btn-back").addEventListener("click", goBack);
document.getElementById("btn-forward").addEventListener("click", goForward);
document.getElementById("btn-reload").addEventListener("click", reloadCurrentTab);
document.getElementById("btn-home").addEventListener("click", () => navigateTab("abyss://home", "Abyss Home"));
document.getElementById("btn-settings").addEventListener("click", () => openOrFocusSpecialTab("abyss://settings", "Settings"));
document.getElementById("account-avatar-btn")?.addEventListener("click", (event) => { event.stopPropagation(); toggleAccountPopover(); });
document.addEventListener("click", (event) => { if (!event.target.closest("#account-anchor")) closeAccountPopover(); });
document.getElementById("account-modal")?.addEventListener("click", (event) => { if (event.target.id === "account-modal") closeAccountAuth(); });
document.getElementById("nav-speaker-btn").addEventListener("click", handleSpeakerClick);
document.getElementById("omnibox-voice-btn").addEventListener("click", handleSpeakerClick);
document.getElementById("omnibox-site-btn").addEventListener("click", handleSpeakerClick);
document.getElementById("omnibox-bookmark-btn").addEventListener("click", toggleBookmarkCurrentSite);

const omniboxInputEl = document.getElementById("omnibox-input");
const omniboxClearEl = document.getElementById("omnibox-clear-btn");

omniboxInputEl.addEventListener("input", (e) => {
  omniboxClearEl.classList.toggle("hidden", !e.target.value);
  updateOmniboxSuggestions(e.target.value);
});

omniboxInputEl.addEventListener("focus", (e) => {
  if (e.target.value) updateOmniboxSuggestions(e.target.value);
});

omniboxClearEl.addEventListener("click", () => {
  omniboxInputEl.value = "";
  omniboxClearEl.classList.add("hidden");
  hideOmniboxSuggestions();
  omniboxInputEl.focus();
});

document.getElementById("omnibox-form").addEventListener("submit", (e) => {
  e.preventDefault();
  handleUserSearchOrUrl(omniboxInputEl.value);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".omnibox-anchor")) {
    hideOmniboxSuggestions();
  }
});

["mousemove", "keydown", "click"].forEach(evt => {
  document.addEventListener(evt, touchActivity, { passive: true });
});

// Keyboard Shortcuts (Respects In-Tab Website & Game Shortcut Priority)
document.addEventListener("keydown", (e) => {
  const activeTag = document.activeElement?.tagName;
  const isTypingInChrome = activeTag === "INPUT" || activeTag === "TEXTAREA";
  const currentRoute = getCurrentEntry()?.route || "abyss://home";
  const isInsideContentTab = currentRoute === "abyss://web" || currentRoute === "abyss://local-app" || currentRoute === "abyss://perm-app";
  const prioritizeInTab = state.settings.prioritizeTabShortcuts !== false;

  if (e.altKey && e.shiftKey && e.key.toLowerCase() === "t") {
    e.preventDefault();
    createTab("abyss://home", "Abyss Home");
    return;
  }
  if (e.altKey && e.shiftKey && e.key.toLowerCase() === "w") {
    e.preventDefault();
    closeTab(state.activeTabId);
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
    e.preventDefault();
    omniboxInputEl.focus();
    omniboxInputEl.select();
    return;
  }

  if (e.key === "Escape") {
    hideOmniboxSuggestions();
    if (!document.getElementById("voice-modal").classList.contains("hidden")) {
      closeVoiceModal();
      return;
    }
    if (!document.getElementById("custom-modal").classList.contains("hidden")) {
      closeCustomModal();
      return;
    }
    if (state.isGameFullscreen) {
      toggleGameFullscreen();
      return;
    }
  }

  if (isInsideContentTab && prioritizeInTab) {
    return;
  }

  if ((e.ctrlKey || e.metaKey) && !isTypingInChrome && e.key.toLowerCase() === "t") {
    e.preventDefault();
    createTab("abyss://home", "Abyss Home");
  }
  if ((e.ctrlKey || e.metaKey) && !isTypingInChrome && e.key.toLowerCase() === "w") {
    e.preventDefault();
    closeTab(state.activeTabId);
  }
});

// Boot Abyss Browser & Restore Permanent Apps from IndexedDB
(async function bootAbyss() {
  const restored = loadPersistentState();
  await restoreAllPermanentAppBundles();
  initSupabaseAccount();
  if (!restored) {
    createTab("abyss://home", "Abyss Home");
  } else {
    renderAll(true);
  }
})();