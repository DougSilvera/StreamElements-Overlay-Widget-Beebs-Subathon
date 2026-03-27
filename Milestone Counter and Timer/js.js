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
  const DEFAULT_START_HOURS = 6;
  const TIMER_REVEAL_SUBS = 5;
  const TIMER_12H_SUBS = 70;
  const TIMER_24H_SUBS = 150;

  const MILESTONES = [
    { goal: 5, reward: "6 hour stream" },
    { goal: 10, reward: "Camera on" },
    { goal: 15, reward: "Alien Onesie" },
    { goal: 20, reward: "Chamoy Pickle" },
    { goal: 25, reward: "Creative Games + Giveaway" },
    { goal: 30, reward: "Harmonica Coms" },
    { goal: 50, reward: "Bieber Costume" },
    { goal: 55, reward: "Bieber Karaoke" },
    { goal: 70, reward: "12 Hours unlocked" },
    { goal: 100, reward: "Movie night in discord" },
    { goal: 150, reward: "24 Hours" },
    { goal: 200, reward: "Resident Evil 7" },
  ];

  // Prevent double counting: keep a rolling set of event fingerprints
  const SEEN_MAX = 500;
  const seen = new Set();

  function rememberOnce(key) {
    if (!key) return true;
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

  const $timerCountdown = el("timerCountdown");
  const $timerStatus = el("timerStatus");
  const $milestoneSubs = el("milestoneSubs");
  const $milestoneIncentive = el("milestoneIncentive");

  const safeSet = ($e, text) => {
    if ($e) $e.textContent = String(text);
  };

  // ---------------------------
  // State
  // ---------------------------
  const state = {
    version: 1,
    channel: null,
    updatedAtMs: null,
    subathon: {
      startTimeMs: null,
      endTimeMs: null,
      sessionSubs: 0,
    },
  };

  function snapshot() {
    const s = state.subathon;
    return {
      startTimeMs: s.startTimeMs,
      endTimeMs: s.endTimeMs,
      sessionSubs: s.sessionSubs,
      timerTierHours: getTimerTotalHours(s.sessionSubs),
      timerVisible: shouldShowCountdown(s.sessionSubs),
    };
  }

  function markUpdated(reason) {
    state.updatedAtMs = Date.now();
    LOG.info("update:", reason, snapshot());
    renderAll();
  }

  // ---------------------------
  // Formatting
  // ---------------------------
  const pad2 = (n) => String(n).padStart(2, "0");

  function fmtRemaining(msRemaining) {
    const totalSeconds = Math.max(0, Math.floor((msRemaining || 0) / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function parseTimeArg(raw) {
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
      const hh = parts[0];
      const mm = parts[1];
      const ss = parts[2] ?? 0;

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

  // ---------------------------
  // Timer rules
  // ---------------------------
  function getTimerTotalHours(subs) {
    const s = Number(subs || 0);
    if (s >= TIMER_24H_SUBS) return 24;
    if (s >= TIMER_12H_SUBS) return 12;
    return 6;
  }

  function shouldShowCountdown(subs) {
    return Number(subs || 0) >= TIMER_REVEAL_SUBS;
  }

  function syncEndTimeToMilestoneTier() {
    if (!state.subathon.startTimeMs) return;

    const totalHours = getTimerTotalHours(state.subathon.sessionSubs);
    const minimumEndTimeMs = state.subathon.startTimeMs + totalHours * 3600 * 1000;

    if (!state.subathon.endTimeMs || state.subathon.endTimeMs < minimumEndTimeMs) {
      state.subathon.endTimeMs = minimumEndTimeMs;
    }
  }

  function isStarted() {
    return !!state.subathon.startTimeMs && !!state.subathon.endTimeMs;
  }

  function ensureStarted() {
    if (isStarted()) return;

    const now = Date.now();
    state.subathon.startTimeMs = now;
    state.subathon.sessionSubs = state.subathon.sessionSubs ?? 0;
    state.subathon.endTimeMs = now + DEFAULT_START_HOURS * 3600 * 1000;
  }

  // ---------------------------
  // Core logic
  // ---------------------------
  function startSubathon(hours = DEFAULT_START_HOURS) {
    const now = Date.now();
    state.subathon.startTimeMs = now;
    state.subathon.sessionSubs = 0;
    state.subathon.endTimeMs = now + hours * 3600 * 1000;
    markUpdated(`subathon.start(${hours}h)`);
  }

  function stopSubathon() {
    state.subathon.startTimeMs = null;
    state.subathon.endTimeMs = null;
    state.subathon.sessionSubs = 0;
    markUpdated("subathon.stop");
  }

  function addSubs(n, reason = "add") {
    if (!Number.isFinite(n) || n === 0) return;

    if (!isStarted()) {
      LOG.warn("subs received before start; starting default 6h session");
      startSubathon(DEFAULT_START_HOURS);
    }

    state.subathon.sessionSubs = Math.max(0, (state.subathon.sessionSubs || 0) + n);
    syncEndTimeToMilestoneTier();
    markUpdated(`subathon.${reason}(${n})`);
  }

  function setStartTime(ms) {
    if (!Number.isFinite(ms)) return;

    state.subathon.startTimeMs = ms;
    if (state.subathon.sessionSubs == null) {
      state.subathon.sessionSubs = 0;
    }

    syncEndTimeToMilestoneTier();
    markUpdated(`subathon.setstart(${ms})`);
  }

  function setEndTime(ms) {
    if (!Number.isFinite(ms)) return;

    ensureStarted();

    if (ms < state.subathon.startTimeMs) {
      LOG.warn("setend: end < start; clamping to start");
      ms = state.subathon.startTimeMs;
    }

    state.subathon.endTimeMs = ms;
    syncEndTimeToMilestoneTier();
    markUpdated(`subathon.setend(${ms})`);
  }

  // ---------------------------
  // Milestones
  // ---------------------------
  function getNextMilestone(subs) {
    const s = Number(subs || 0);
    for (const m of MILESTONES) {
      if (s < m.goal) return m;
    }
    return null;
  }

  function renderMilestoneCard() {
    if (!$milestoneSubs || !$milestoneIncentive) return;

    const subs = Number(state.subathon.sessionSubs || 0);
    const next = getNextMilestone(subs);

    if (!next) {
      safeSet($milestoneSubs, `${subs} / MAX`);
      safeSet($milestoneIncentive, "All rewards unlocked");
      return;
    }

    safeSet($milestoneSubs, `${subs} / ${next.goal}`);
    safeSet($milestoneIncentive, `Next unlock: ${next.reward}`);
  }

  // ---------------------------
  // Rendering
  // ---------------------------
  function renderTimer() {
    if (!$timerCountdown) return;

    if (!isStarted()) {
      safeSet($timerCountdown, "--:--:--");
      if ($timerStatus) {
        safeSet($timerStatus, "Waiting for !subathon start");
      }
      return;
    }

    const subs = Number(state.subathon.sessionSubs || 0);
    const remainingMs = state.subathon.endTimeMs - Date.now();
    const totalHours = getTimerTotalHours(subs);

    if (!shouldShowCountdown(subs)) {
      safeSet($timerCountdown, "--:--:--");
      if ($timerStatus) {
        safeSet($timerStatus, `Countdown unlocks at 5 subs • Current subs: ${subs}`);
      }
      return;
    }

    safeSet($timerCountdown, fmtRemaining(remainingMs));
    if ($timerStatus) {
      safeSet($timerStatus, `${totalHours}h timer from stream start • Subs: ${subs}`);
    }
  }

  function renderAll() {
    renderTimer();
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

    if (lower.startsWith("!subathon")) {
      const parts = text.split(/\s+/);
      const action = (parts[1] || "").toLowerCase();

      if (action === "start") return { type: "subStart" };
      if (action === "stop") return { type: "subStop" };
      if (action === "status") return { type: "subStatus" };

      if (/^[+-]\d+$/.test(action)) {
        return { type: "subAdd", value: parseInt(action, 10) };
      }

      if (action === "setstart") {
        const rawTime = parts.slice(2).join(" ");
        return { type: "subSetStart", rawTime };
      }

      if (action === "setend") {
        const rawTime = parts.slice(2).join(" ");
        return { type: "subSetEnd", rawTime };
      }

      return { type: "help", raw: text };
    }

    return null;
  }

  function handleCommand(cmd, user, rawText) {
    switch (cmd.type) {
      case "subStart":
        startSubathon(DEFAULT_START_HOURS);
        return;

      case "subStop":
        stopSubathon();
        return;

      case "subStatus":
        markUpdated("subathon.status");
        return;

      case "subAdd":
        addSubs(cmd.value, "chatAdd");
        return;

      case "subSetStart": {
        const ms = parseTimeArg(cmd.rawTime);
        if (!ms) {
          LOG.warn("setstart: could not parse time:", cmd.rawTime);
          return;
        }
        setStartTime(ms);
        return;
      }

      case "subSetEnd": {
        const ms = parseTimeArg(cmd.rawTime);
        if (!ms) {
          LOG.warn("setend: could not parse time:", cmd.rawTime);
          return;
        }
        setEndTime(ms);
        return;
      }

      case "help":
      default:
        LOG.warn("unrecognized command:", rawText);
        return;
    }
  }

  // ---------------------------
  // StreamElements EVENT counting
  // ---------------------------
  let __subEventSeq = 0;
  let __lastIncomingSubEventTs = 0;

  function logIncomingSubEvent(detail) {
    const now = Date.now();
    const delta = __lastIncomingSubEventTs ? now - __lastIncomingSubEventTs : 0;
    __lastIncomingSubEventTs = now;

    const e = detail?.event || {};
    const data = e?.data || {};

    const seq = ++__subEventSeq;
    const listener = detail?.listener || "";
    const name = e?.name || e?.type || "";
    const amount = data?.amount ?? data?.quantity ?? data?.count ?? null;
    const user =
      data?.displayName ||
      data?.username ||
      data?.name ||
      "unknown";

    console.log(
      `%c[#${seq}] INCOMING`,
      "color: #00ffaa; font-weight: bold;",
      {
        listener,
        name,
        user,
        amount,
        gifted: data?.gifted,
        bulkGiftedAmount: data?.bulkGiftedAmount,
        sender: data?.sender,
        isCommunityGift: data?.isCommunityGift,
        deltaMsFromPrevIncoming: delta,
        raw: detail,
      }
    );

    return seq;
  }

  function logSubDecision(seq, tag, detail, extra = {}) {
    const e = detail?.event || {};
    console.log(
      `%c[#${seq}] ${tag}`,
      "color: #ffd166; font-weight: bold;",
      {
        listener: detail?.listener || "",
        name: e?.name || e?.type || "",
        ...extra,
      }
    );
  }

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
    const name = String(e?.name || e?.type || "").toLowerCase();

    const isCommunityGiftPurchase =
      name === "communitygiftpurchase" ||
      name === "communitysubgift" ||
      name === "giftpurchase";

    if (isCommunityGiftPurchase) {
      const candidates = [
        data?.amount,
        data?.quantity,
        data?.count,
        data?.bulkGiftedAmount,
        e?.amount,
        e?.quantity,
        e?.count,
      ];

      for (const raw of candidates) {
        const amt = Number(raw);
        if (Number.isFinite(amt) && amt > 0) {
          return amt;
        }
      }

      return 1;
    }

    return 1;
  }

  function maybeHandleSubscriptionEvent(detail) {
    const listener = String(detail?.listener || "").toLowerCase();
    const e = detail?.event || {};
    const data = e?.data || {};
    const name = String(e?.name || e?.type || "").toLowerCase();

    const looksSubRelated =
      listener.includes("sub") ||
      name.includes("sub") ||
      name.includes("gift");

    if (!looksSubRelated) return false;

    const seq = logIncomingSubEvent(detail);

    if (listener.endsWith("-latest")) {
      logSubDecision(seq, "IGNORED_LATEST", detail);
      return false;
    }

    const isCommunityGiftPurchase =
      name === "communitygiftpurchase" ||
      name === "communitysubgift" ||
      name === "giftpurchase";

    const isPlainSubscriberEvent =
      name === "subscriber" || name === "subscription";

    const looksLikeCountableSub =
      listener.includes("subscriber") ||
      listener.includes("subscription") ||
      name.includes("subscriber") ||
      name.includes("subscription") ||
      isCommunityGiftPurchase;

    if (!looksLikeCountableSub) {
      logSubDecision(seq, "IGNORED_NOT_COUNTED", detail);
      return false;
    }

    const key = getEventFingerprint(detail);
    if (!rememberOnce(key)) {
      logSubDecision(seq, "IGNORED_DUPLICATE", detail, { key });
      return true;
    }

    if (isCommunityGiftPurchase) {
      const amt = extractSubAmountFromEvent(detail);

      logSubDecision(seq, "COUNT_GIFT_BUNDLE", detail, {
        amountAdded: amt,
      });

      addSubs(amt, "eventGiftPurchase");
      return true;
    }

    if (isPlainSubscriberEvent) {
      const user = String(
        data?.displayName ||
        data?.username ||
        data?.name ||
        ""
      ).toLowerCase();

      const sender = String(data?.sender || "").toLowerCase();
      const isGifted = data?.gifted === true;

      // Community gift recipient follow-up:
      // gifted:true and sender is someone else
      if (isGifted && sender && sender !== user) {
        logSubDecision(seq, "IGNORED_GIFT_RECIPIENT", detail, {
          sender: data?.sender,
          user: data?.displayName || data?.username || data?.name,
        });
        return true;
      }

      // Direct gifted sub or normal sub/resub:
      // count as exactly +1
      const amt = 1;

      logSubDecision(seq, isGifted ? "COUNT_DIRECT_GIFT" : "COUNT_SUB", detail, {
        amountAdded: amt,
        gifted: data?.gifted,
        sender: data?.sender,
      });

      addSubs(amt, isGifted ? "eventDirectGift" : "eventSub");
      return true;
    }

    logSubDecision(seq, "IGNORED_FALLTHROUGH", detail);
    return false;
  }

  // ---------------------------
  // Lifecycle
  // ---------------------------
  window.addEventListener("onWidgetLoad", (obj) => {
    state.channel =
      obj?.detail?.channel?.username ||
      obj?.detail?.channel?.name ||
      "channel";

    LOG.info("loaded for channel:", state.channel);
    markUpdated("onWidgetLoad");
  });

  window.addEventListener("onEventReceived", (obj) => {
    try {
      const detail = obj?.detail;
      const listener = detail?.listener;

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

      maybeHandleSubscriptionEvent(detail);
    } catch (e) {
      LOG.error("onEventReceived failed:", e);
    }
  });

  renderAll();
  LOG.info("initialized");
})();