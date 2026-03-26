(() => {
  const LOG = {
    prefix: "[overlay]",
    enabled: true,
    info: (...a) => LOG.enabled && console.log(LOG.prefix, ...a),
    warn: (...a) => LOG.enabled && console.warn(LOG.prefix, ...a),
    error: (...a) => console.error(LOG.prefix, ...a),
  };

  // ---------------------------
  // Config
  // ---------------------------
  const DEFAULT_START_HOURS = 12;
  const UPGRADE_SUBS_THRESHOLD = 100;
  const UPGRADE_TOTAL_HOURS_FROM_START = 24;

  const JUNGLE_ASSETS = [
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level1Seed.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level2Sprout.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level3Overgrown.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level4Wild.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level5Carnivorous.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level6Untamed.png",
  "https://raw.githubusercontent.com/DougSilvera/StreamElements-Jungle-Overlay-Assets-/main/assets/Level7Savage.png",
];

  // Prevent double counting: keep a rolling set of event fingerprints
  const SEEN_MAX = 500;
  const seen = new Set();
  function rememberOnce(key) {
    if (!key) return true; // if no key, allow (best effort)
    if (seen.has(key)) return false;
    seen.add(key);
    if (seen.size > SEEN_MAX) {
      const arr = Array.from(seen).slice(Math.floor(SEEN_MAX / 2));
      seen.clear();
      arr.forEach((k) => seen.add(k));
    }
    return true;
  }

  // ---------------------------
  // DOM
  // ---------------------------
  const el = (id) => document.getElementById(id);

  const $jungleFrame = el("jungleFrame");
  const $timerCountdown = el("timerCountdown");
  const $timerStatus = el("timerStatus");

  const $hud = el("hud");
  const $note = el("note");
  const $vHudVisible = el("v_hudVisible");
  const $vStarted = el("v_started");
  const $vUpgraded = el("v_upgraded");
  const $vSubs = el("v_subs");
  const $vStart = el("v_start");
  const $vEnd = el("v_end");
  const $vRemaining = el("v_remaining");
  const $vUpdatedAt = el("v_updatedAt");
  const $vJungleLevel = el("v_jungleLevel");

  const safeSet = ($e, text) => { if ($e) $e.textContent = String(text); };

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    version: 1,
    channel: null,
    updatedAtMs: null,
    ui: { hudVisible: false },
    subathon: {
      startTimeMs: null,
      endTimeMs: null,
      sessionSubs: 0,
      upgraded: false,
    },
  };

  function markUpdated(reason) {
    state.updatedAtMs = Date.now();
    LOG.info("update:", reason, snapshot());
    renderAll();
  }

  function snapshot() {
    const s = state.subathon;
    return {
      hudVisible: state.ui.hudVisible,
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      sessionSubs: s.sessionSubs,
      upgraded: s.upgraded,
      jungleLevel: computeJungleLevel(s.sessionSubs),
    };
  }

  // ---------------------------
  // Formatting
  // ---------------------------
  const pad2 = (n) => String(n).padStart(2, "0");

  function fmtTime(ms) {
    if (!ms) return "-";
    return new Date(ms).toLocaleString();
  }

  function fmtRemaining(msRemaining) {
    const totalSeconds = Math.max(0, Math.floor((msRemaining || 0) / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  // ---------------------------
  // Time parsing (NEW)
  // ---------------------------
  function parseTimeArg(raw) {
    // returns epoch ms or null
    if (!raw || typeof raw !== "string") return null;
    const s = raw.trim();

    // epoch ms
    if (/^\d{11,13}$/.test(s)) {
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    }

    // time-only -> today local
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const parts = s.split(":").map((x) => Number(x));
      const hh = parts[0], mm = parts[1], ss = parts[2] ?? 0;
      if (![hh, mm, ss].every(Number.isFinite)) return null;

      const d = new Date();
      d.setHours(hh, mm, ss, 0);
      return d.getTime();
    }

    // ISO-ish / "YYYY-MM-DD HH:MM:SS"
    const normalized = s.includes("T") ? s : s.replace(" ", "T");
    const t = Date.parse(normalized);
    return Number.isFinite(t) ? t : null;
  }

  function ensureStarted() {
    if (state.subathon.startTimeMs && state.subathon.endTimeMs) return;
    const now = Date.now();
    state.subathon.startTimeMs = now;
    state.subathon.endTimeMs = now + DEFAULT_START_HOURS * 3600 * 1000;
    state.subathon.sessionSubs = state.subathon.sessionSubs ?? 0;
    state.subathon.upgraded = !!state.subathon.upgraded;
  }

  // ---------------------------
  // Core logic
  // ---------------------------
  function isStarted() {
    return !!state.subathon.startTimeMs && !!state.subathon.endTimeMs;
  }

  function startSubathon(hours = DEFAULT_START_HOURS) {
    const now = Date.now();
    state.subathon.startTimeMs = now;
    state.subathon.endTimeMs = now + hours * 3600 * 1000;
    state.subathon.sessionSubs = 0;
    state.subathon.upgraded = false;
    markUpdated(`subathon.start(${hours}h)`);
  }

  function stopSubathon() {
    state.subathon.startTimeMs = null;
    state.subathon.endTimeMs = null;
    state.subathon.sessionSubs = 0;
    state.subathon.upgraded = false;
    markUpdated("subathon.stop");
  }

  function ensureUpgradeIfNeeded() {
    const s = state.subathon;
    if (!s.startTimeMs) return;

    if ((s.sessionSubs || 0) >= UPGRADE_SUBS_THRESHOLD) {
      s.upgraded = true;
      const upgradedEnd = s.startTimeMs + UPGRADE_TOTAL_HOURS_FROM_START * 3600 * 1000;
      if (!s.endTimeMs || upgradedEnd > s.endTimeMs) s.endTimeMs = upgradedEnd;
    }
  }

  function addSubs(n, reason = "add") {
    if (!Number.isFinite(n) || n === 0) return;

    if (!isStarted()) {
      LOG.warn("subs received before start; starting default 12h session");
      startSubathon(DEFAULT_START_HOURS);
    }

    state.subathon.sessionSubs = Math.max(0, (state.subathon.sessionSubs || 0) + n);
    ensureUpgradeIfNeeded();
    markUpdated(`subathon.${reason}(${n})`);
  }

  // ---------------------------
  // NEW: start/end setters
  // ---------------------------
  function setStartTime(ms) {
    if (!Number.isFinite(ms)) return;

    const prevStart = state.subathon.startTimeMs;
    const prevEnd = state.subathon.endTimeMs;

    state.subathon.startTimeMs = ms;

    // preserve duration if we had one
    if (Number.isFinite(prevStart) && Number.isFinite(prevEnd) && prevEnd > prevStart) {
      const duration = prevEnd - prevStart;
      state.subathon.endTimeMs = ms + duration;
    } else if (state.subathon.endTimeMs && state.subathon.endTimeMs < ms) {
      state.subathon.endTimeMs = ms + DEFAULT_START_HOURS * 3600 * 1000;
    } else if (!state.subathon.endTimeMs) {
      state.subathon.endTimeMs = ms + DEFAULT_START_HOURS * 3600 * 1000;
    }

    // upgrade rule can apply immediately if subs already high
    ensureUpgradeIfNeeded();
    markUpdated(`subathon.setstart(${ms})`);
  }

  function setEndTime(ms) {
    if (!Number.isFinite(ms)) return;

    ensureStarted();

    // clamp end >= start
    if (ms < state.subathon.startTimeMs) {
      LOG.warn("setend: end < start; clamping to start");
      ms = state.subathon.startTimeMs;
    }

    state.subathon.endTimeMs = ms;

    // upgrade might force end further out
    ensureUpgradeIfNeeded();
    markUpdated(`subathon.setend(${ms})`);
  }

  function setDurationHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return;

    ensureStarted();
    state.subathon.endTimeMs = state.subathon.startTimeMs + hours * 3600 * 1000;

    ensureUpgradeIfNeeded();
    markUpdated(`subathon.setduration(${hours}h)`);
  }

  function setEndInHours(hours) {
    if (!Number.isFinite(hours) || hours <= 0) return;

    ensureStarted();
    const now = Date.now();
    state.subathon.endTimeMs = now + hours * 3600 * 1000;

    ensureUpgradeIfNeeded();
    markUpdated(`subathon.setendin(${hours}h)`);
  }

  function setHudVisible(flag) {
    state.ui.hudVisible = !!flag;
    markUpdated(`ui.hudVisible=${state.ui.hudVisible}`);
  }

  function toggleHud() {
    state.ui.hudVisible = !state.ui.hudVisible;
    markUpdated(`ui.hudToggle -> ${state.ui.hudVisible}`);
  }

// --- milestone DOM ---
const $milestoneLevel = document.getElementById("milestoneLevel");
const $milestoneSubs = document.getElementById("milestoneSubs");
const $milestoneNext = document.getElementById("milestoneNext");
const $milestoneIncentive = document.getElementById("milestoneIncentive");

// Incentives keyed by the level you unlock at that goal
const INCENTIVE_BY_LEVEL = {
  SEED: "In Game Challenge",                 // unlock at 5
  SPROUT: "Chat picks my skin",              // unlock at 20
  OVERGROWN: "Chat picks Dinner",            // unlock at 45
  WILD: "$$ Customs Tourney",                // unlock at 60
  CARNIVOROUS: "24 hrs unlocked + giveaway", // unlock at 100
  UNTAMED: "PIE IN THE FACE",                // unlock at 200
  SAVAGE: "Momster gets a tattoo",           // unlock at 250
};

// Thresholds define when the *displayed level name changes*.
// Alteration: 0-4 => no current level (blank/none), at 5 => SEED.
const LEVEL_RANGES = [
  { min: 5,   name: "SEED" },
  { min: 20,  name: "SPROUT" },
  { min: 45,  name: "OVERGROWN" },
  { min: 60,  name: "WILD" },
  { min: 100, name: "CARNIVOROUS" },
  { min: 200, name: "UNTAMED" },
  { min: 250, name: "SAVAGE" },
];

const GOALS = [5, 20, 45, 60, 100, 200, 250];

function getCurrentLevelName(subs) {
  const s = Number(subs || 0);

  // 0-4: show nothing
  if (s < 5) return "";

  let current = "SEED";
  for (const r of LEVEL_RANGES) {
    if (s >= r.min) current = r.name;
  }
  return current;
}

function getNextGoal(subs) {
  const s = Number(subs || 0);
  for (const g of GOALS) {
    if (s < g) return g;
  }
  return null;
}

function getNextLevelName(subs) {
  const nextGoal = getNextGoal(subs);
  if (nextGoal == null) return null;

  // Alteration: before 5, next level is SEED.
  if (nextGoal === 5) return "SEED";
  if (nextGoal === 20) return "SPROUT";
  if (nextGoal === 45) return "OVERGROWN";
  if (nextGoal === 60) return "WILD";
  if (nextGoal === 100) return "CARNIVOROUS";
  if (nextGoal === 200) return "UNTAMED";
  if (nextGoal === 250) return "SAVAGE";
  return null;
}

function renderMilestoneCard() {
  if (!$milestoneLevel || !$milestoneSubs || !$milestoneNext || !$milestoneIncentive) return;

  const subs = Number(state?.subathon?.sessionSubs || 0);

  const currentLevel = getCurrentLevelName(subs); // "" for 0-4
  const nextGoal = getNextGoal(subs);
  const nextLevel = getNextLevelName(subs);

  // If blank, show placeholder (optional). If you truly want nothing, keep "".
  safeSet($milestoneLevel, currentLevel || "—");

  if (nextGoal == null) {
    safeSet($milestoneSubs, `${subs} / MAX`);
    safeSet($milestoneNext, `NEXT LEVEL: —`);
    safeSet($milestoneIncentive, `Final tier reached: ${INCENTIVE_BY_LEVEL.SAVAGE}`);
    return;
  }

  safeSet($milestoneSubs, `${subs} / ${nextGoal}`);
  safeSet($milestoneNext, `NEXT LEVEL: ${nextLevel || "—"}`);

  const incentive = (nextLevel && INCENTIVE_BY_LEVEL[nextLevel]) ? INCENTIVE_BY_LEVEL[nextLevel] : "";
  safeSet($milestoneIncentive, incentive ? `Next unlock: ${incentive}` : "");
}

  // ---------------------------
  // Jungle growth
  // ---------------------------
  function computeJungleLevel(subs) {
    // Your milestone spec: 5, 20, 45, 60, 100 => 5 assets
    const s = Number(subs || 0);
    if (s >= 250) return 7;
    if (s >= 200) return 6;
    if (s >= 100) return 5;
    if (s >= 60) return 4;
    if (s >= 45) return 3;
    if (s >= 20) return 2;
    if (s >= 5) return 1;
    return 0;
  }

  const $layerA = document.getElementById("jungleLayerA");
const $layerB = document.getElementById("jungleLayerB");

let activeLayer = $layerA;
let lastJungleUrl = null;

function jungleUrlForLevel(level) {
  // Your spec: level 0 uses the 1st asset; level 7 uses none
  if (level >= 7) return null;
  if (level < 0) return null;
  return JUNGLE_ASSETS[level] || null;
}

function applyJungleFrame(level) {
  if (!$layerA || !$layerB) return;

  const url = jungleUrlForLevel(level);

  // If nothing changed, do nothing (prevents pulsing)
  if (url === lastJungleUrl) return;
  lastJungleUrl = url;

  // Clear both if "no asset" state
  if (!url) {
    $layerA.style.backgroundImage = "";
    $layerB.style.backgroundImage = "";
    $layerA.classList.remove("active");
    $layerB.classList.remove("active");
    return;
  }

  // First-time set: just show it without swapping
  const aHas = !!$layerA.style.backgroundImage;
  const bHas = !!$layerB.style.backgroundImage;
  if (!aHas && !bHas) {
    activeLayer = $layerA;
    activeLayer.style.backgroundImage = `url("${url}")`;
    $layerA.classList.add("active");
    $layerB.classList.remove("active");
    return;
  }

  // Crossfade to the other layer
  const nextLayer = activeLayer === $layerA ? $layerB : $layerA;
  nextLayer.style.backgroundImage = `url("${url}")`;

  nextLayer.classList.add("active");
  activeLayer.classList.remove("active");
  activeLayer = nextLayer;
}

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderTimer() {
    if (!$timerCountdown) return;

    if (!isStarted()) {
      safeSet($timerCountdown, "--:--:--");
      safeSet($timerStatus, "Waiting for !subathon start");
      return;
    }

    const remainingMs = state.subathon.endTimeMs - Date.now();
    safeSet($timerCountdown, fmtRemaining(remainingMs));

    const subs = state.subathon.sessionSubs || 0;
    safeSet(
      $timerStatus,
      state.subathon.upgraded
        ? `Session subs: ${subs} • Upgraded (24h from start)`
        : `Session subs: ${subs} • Base (12h from start)`
    );
  }

  function renderHud() {
    if (!$hud) return;

    $hud.classList.toggle("hidden", !state.ui.hudVisible);

    safeSet($vHudVisible, state.ui.hudVisible ? "true" : "false");
    safeSet($vStarted, isStarted() ? "true" : "false");
    safeSet($vUpgraded, state.subathon.upgraded ? "true" : "false");
    safeSet($vSubs, String(state.subathon.sessionSubs ?? 0));

    safeSet($vStart, fmtTime(state.subathon.startTimeMs));
    safeSet($vEnd, fmtTime(state.subathon.endTimeMs));

    const remaining = state.subathon.endTimeMs ? (state.subathon.endTimeMs - Date.now()) : null;
    safeSet($vRemaining, remaining == null ? "-" : fmtRemaining(remaining));

    safeSet($vUpdatedAt, state.updatedAtMs ? fmtTime(state.updatedAtMs) : "-");
    safeSet($vJungleLevel, String(computeJungleLevel(state.subathon.sessionSubs)));

    safeSet(
      $note,
      isStarted()
        ? "Running. !subathon status | !subathon setendin 1 | !hud toggle"
        : "Not started. !subathon start | !hud toggle"
    );
  }

  function renderJungle() {
    applyJungleFrame(computeJungleLevel(state.subathon.sessionSubs));
  }

  function renderAll() {
    renderTimer();
    renderJungle();
    renderHud();
    renderMilestoneCard();
  }

  setInterval(renderAll, 1000);

  // ---------------------------
  // Chat parsing
  // ---------------------------
  function isPrivilegedUser(obj) {
    const data = obj?.detail?.event?.data || {};
    const badges = data.badges || {};
    const tags = data.tags || {};

    const username =
      data.displayName ||
      data.username ||
      data.nick ||
      data.userName ||
      "";

    const channel = state.channel || "";

    const isBroadcaster =
      badges.broadcaster === "1" ||
      tags.badges?.includes?.("broadcaster") ||
      data.isBroadcaster === true ||
      username.toLowerCase() === channel.toLowerCase();

    const isModerator =
      badges.moderator === "1" ||
      tags.mod === "1" ||
      data.isMod === true;

    return isBroadcaster || isModerator;
  }

  function extractMessageText(obj) {
    const event = obj?.detail?.event;
    const text =
      event?.data?.text ??
      event?.data?.message ??
      event?.message ??
      event?.text ??
      null;
    return typeof text === "string" ? text.trim() : null;
  }

  function extractUser(obj) {
    const event = obj?.detail?.event;
    return (
      event?.data?.displayName ??
      event?.data?.nick ??
      event?.data?.username ??
      event?.data?.userName ??
      "unknown"
    );
  }

  function parseCommand(textRaw) {
    const text = (textRaw || "").trim();
    const lower = text.toLowerCase();

    if (lower.startsWith("!hud")) {
      const parts = lower.split(/\s+/);
      const action = parts[1] || "toggle";
      if (action === "on") return { type: "hud", value: true };
      if (action === "off") return { type: "hud", value: false };
      return { type: "hudToggle" };
    }

    if (lower.startsWith("!subathon")) {
      const parts = text.split(/\s+/); // IMPORTANT: keep original casing for time args
      const action = (parts[1] || "").toLowerCase();

      if (action === "start") return { type: "subStart" };
      if (action === "stop") return { type: "subStop" };
      if (action === "status") return { type: "subStatus" };

      if (/^[+-]\d+$/.test(action)) {
        return { type: "subAdd", value: parseInt(action, 10) };
      }

      // NEW: setstart / setend / setduration / setendin
      if (action === "setstart") {
        const rawTime = parts.slice(2).join(" ");
        return { type: "subSetStart", rawTime };
      }
      if (action === "setend") {
        const rawTime = parts.slice(2).join(" ");
        return { type: "subSetEnd", rawTime };
      }
      if (action === "setduration") {
        const hours = Number(parts[2]);
        return { type: "subSetDuration", hours };
      }
      if (action === "setendin") {
        const hours = Number(parts[2]);
        return { type: "subSetEndIn", hours };
      }

      return { type: "help", raw: text };
    }

    return null;
  }

  function handleCommand(cmd, user, rawText) {
    switch (cmd.type) {
      case "hud": setHudVisible(cmd.value); return;
      case "hudToggle": toggleHud(); return;

      case "subStart": startSubathon(DEFAULT_START_HOURS); return;
      case "subStop": stopSubathon(); return;
      case "subStatus": markUpdated("subathon.status"); return;

      case "subAdd": addSubs(cmd.value, "chatAdd"); return;

      case "subSetStart": {
        const ms = parseTimeArg(cmd.rawTime);
        if (!ms) {
          LOG.warn("setstart: could not parse time:", cmd.rawTime);
          safeSet($note, `Bad time for setstart: "${cmd.rawTime}"`);
          return;
        }
        setStartTime(ms);
        return;
      }

      case "subSetEnd": {
        const ms = parseTimeArg(cmd.rawTime);
        if (!ms) {
          LOG.warn("setend: could not parse time:", cmd.rawTime);
          safeSet($note, `Bad time for setend: "${cmd.rawTime}"`);
          return;
        }
        setEndTime(ms);
        return;
      }

      case "subSetDuration":
        if (!Number.isFinite(cmd.hours) || cmd.hours <= 0) {
          safeSet($note, `Bad hours for setduration: "${cmd.hours}"`);
          return;
        }
        setDurationHours(cmd.hours);
        return;

      case "subSetEndIn":
        if (!Number.isFinite(cmd.hours) || cmd.hours <= 0) {
          safeSet($note, `Bad hours for setendin: "${cmd.hours}"`);
          return;
        }
        setEndInHours(cmd.hours);
        return;

      case "help":
      default:
        LOG.warn("unrecognized command:", rawText);
        safeSet($note, `Unknown command: ${rawText}`);
        return;
    }
  }

  // ---------------------------
  // StreamElements EVENT counting
  // ---------------------------
  function getEventFingerprint(detail) {
    const e = detail?.event || {};
    const data = e?.data || {};
    const id = data?.id || data?._id || e?.id || e?._id || null;
    if (id) return `id:${id}`;

    const type = detail?.listener || e?.type || e?.name || "unknown";
    const name = data?.displayName || data?.username || data?.name || "";
    const amount = data?.amount ?? data?.quantity ?? "";
    const ts = data?.createdAt || data?.timestamp || e?.createdAt || "";
    return `fp:${type}|${name}|${amount}|${ts}`;
  }

  function extractSubAmountFromEvent(detail) {
    const e = detail?.event || {};
    const data = e?.data || {};
    const amtRaw = data?.amount ?? data?.quantity ?? data?.count ?? null;
    const amt = Number(amtRaw);
    if (Number.isFinite(amt) && amt > 0) return amt;
    return 1;
  }

  function maybeHandleSubscriptionEvent(detail) {
    const listener = (detail?.listener || "").toLowerCase();
    const e = detail?.event || {};
    const name = String(e?.name || e?.type || "").toLowerCase();

    const looksLikeSub =
      listener.includes("subscriber") ||
      listener.includes("subscription") ||
      name.includes("subscriber") ||
      name.includes("subscription");

    if (!looksLikeSub) return false;

    const key = getEventFingerprint(detail);
    if (!rememberOnce(key)) return true;

    const amt = extractSubAmountFromEvent(detail);
    LOG.info("sub event -> +", amt, { listener, name });
    addSubs(amt, "eventSub");
    return true;
  }

  // ---------------------------
  // Lifecycle
  // ---------------------------
  window.addEventListener("onWidgetLoad", (obj) => {
    state.channel = obj?.detail?.channel?.username || obj?.detail?.channel?.name || "channel";
    state.ui.hudVisible = false;
    LOG.info("loaded for channel:", state.channel);
    markUpdated("onWidgetLoad");
  });

  window.addEventListener("onEventReceived", (obj) => {
    try {
      const detail = obj?.detail;
      const listener = detail?.listener;

      // 1) Chat commands
      if (listener === "message") {
        const text = extractMessageText(obj);
        if (!text) return;

        const user = extractUser(obj);
        const cmd = parseCommand(text);
        if (!cmd) return;

        if (!isPrivilegedUser(obj)) {
          LOG.warn("blocked command (not privileged):", user, text);
          return;
        }

        LOG.info("privileged cmd:", user, text);
        handleCommand(cmd, user, text);
      }

      // 2) Subscription events
      maybeHandleSubscriptionEvent(detail);
    } catch (e) {
      LOG.error("onEventReceived failed:", e);
    }
  });

  renderAll();
  LOG.info("initialized");
})();