// ==UserScript==
// @name         Claude.ai RTL Fix
// @namespace    https://darky.dev
// @version      1.1.0
// @description  Sets message-level direction (RTL/LTR) on claude.ai based on the message's content. Code blocks and math stay LTR; tables inherit.
// @author       Youssef Khalil <me@darky.dev>
// @match        https://claude.ai/*
// @match        https://*.claude.ai/*
// @updateURL    https://raw.githubusercontent.com/darkyeg/claude-rtl-fix/main/claude-rtl-fix.user.js
// @downloadURL  https://raw.githubusercontent.com/darkyeg/claude-rtl-fix/main/claude-rtl-fix.user.js
// @grant        GM_addStyle
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(() => {
  const RESPONSE = ".standard-markdown";
  const USER_MSG = '[data-testid="user-message"]';
  const MSG = `${RESPONSE},${USER_MSG}`;
  const INPUT = '[data-testid="chat-input"], .ProseMirror';
  const LTR_FORCED = [
    "pre",
    "code",
    ".code-block__code",
    '[class*="code-block"]',
    '[class*="hljs"]',
    ".katex",
    ".katex-display",
    ".katex-html",
    ".katex-mathml",
    ".MathJax",
    '[role="math"]',
  ].join(",");

  // RTL: Hebrew + Arabic + Syriac + Thaana + NKo + Arabic Extended +
  // explicit RTL bidi controls + Arabic Presentation Forms A/B.
  const RTL_RE = /[֑-ࣿ‏‫‮⁧יִ-﷽ﹰ-ﻼ]/;
  // LTR: Latin + Latin Extended + Greek + Cyrillic.
  const LTR_RE = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;

  // Capped scan: enough for confident majority, short enough to stay cheap
  // even on massive messages.
  const SCAN_LIMIT = 2000;
  const detectDir = (root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.nodeValue?.trim() && !n.parentElement?.closest(LTR_FORCED)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });
    let rtl = 0;
    let ltr = 0;
    let scanned = 0;
    outer: for (let n; (n = walker.nextNode()); ) {
      for (const ch of n.nodeValue) {
        if (RTL_RE.test(ch)) rtl++;
        else if (LTR_RE.test(ch)) ltr++;
        if (++scanned >= SCAN_LIMIT) break outer;
      }
    }
    if (!rtl && !ltr) return null;
    return rtl > ltr ? "rtl" : "ltr";
  };

  GM_addStyle(`
    /* Message-level alignment — start resolves per direction. */
    ${RESPONSE}, ${USER_MSG} { text-align: start !important; }

    /* Prose spacing — logical props flip with direction. */
    ${RESPONSE} :is(p, h1, h2, h3, h4, h5, h6, dt, dd, summary) {
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 0.5rem !important;
      padding-inline-end: 2rem !important;
    }

    /* Blockquote — logical border + spacing. */
    ${RESPONSE} blockquote {
      border-left: none !important;
      border-right: none !important;
      border-inline-start: 4px solid var(--border-300, #d1d5db) !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      margin-inline-start: 0.5rem !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 1rem !important;
      padding-inline-end: 2rem !important;
    }
    ${RESPONSE} blockquote :is(p, h1, h2, h3, h4, h5, h6) {
      padding-inline-start: 0 !important;
      padding-inline-end: 0 !important;
    }

    /* Lists — logical padding so bullets sit on the start side. */
    ${RESPONSE} :is(ol, ul) {
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 1.5rem !important;
    }
    ${RESPONSE} li {
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 0.25rem !important;
    }

    /* Code + math — isolated LTR islands. */
    ${RESPONSE} :is(${LTR_FORCED}) {
      direction: ltr !important;
      unicode-bidi: isolate !important;
      text-align: left !important;
    }
    ${RESPONSE} .katex-display { text-align: center !important; }

    /* Tables — explicitly follow message direction. */
    ${RESPONSE} table { width: 100% !important; table-layout: auto; }
    ${RESPONSE}[dir="rtl"] table, ${USER_MSG}[dir="rtl"] table { direction: rtl !important; }
    ${RESPONSE}[dir="ltr"] table, ${USER_MSG}[dir="ltr"] table { direction: ltr !important; }
    ${RESPONSE} :is(th, td) {
      text-align: start !important;
      padding: 0.5rem 1rem !important;
    }

    /* Input — let the editor follow what the user types. */
    ${INPUT}, [contenteditable="true"] { unicode-bidi: plaintext; }
    ${INPUT.split(",").map((s) => `${s.trim()} p`).join(",")} {
      unicode-bidi: plaintext;
      text-align: start;
    }
  `);

  // Once a message is locked, its observer is disconnected and we never
  // touch it again — old messages cost zero CPU regardless of conversation
  // length.
  const detected = new WeakSet();
  const pending = new WeakSet();
  const observers = new WeakMap();

  const idle =
    typeof requestIdleCallback === "function"
      ? (fn) => requestIdleCallback(fn, { timeout: 2000 })
      : (fn) => setTimeout(fn, 50);

  const lockDir = (msg) => {
    pending.delete(msg);
    if (detected.has(msg) || !msg.isConnected) return;
    const dir = detectDir(msg);
    if (!dir) return; // not enough text yet — observer will retry on next mutation
    if (msg.getAttribute("dir") !== dir) msg.setAttribute("dir", dir);
    detected.add(msg);
    observers.get(msg)?.disconnect();
    observers.delete(msg);
  };

  // Coalesce mutation bursts: only one idle callback in flight per message.
  const schedule = (msg) => {
    if (detected.has(msg) || pending.has(msg)) return;
    pending.add(msg);
    idle(() => lockDir(msg));
  };

  const watchMessage = (msg) => {
    if (detected.has(msg) || observers.has(msg)) return;
    // Native dir="auto" gives the browser its instant first-strong direction
    // — the user sees correct alignment before our majority detection runs.
    if (!msg.hasAttribute("dir")) msg.setAttribute("dir", "auto");
    schedule(msg);
    const obs = new MutationObserver(() => schedule(msg));
    obs.observe(msg, { childList: true, subtree: true, characterData: true });
    observers.set(msg, obs);
  };

  // Releases the observer's strong reference so the detached DOM node can
  // be garbage collected — critical for virtual-scrolled conversations.
  const releaseMessage = (msg) => {
    observers.get(msg)?.disconnect();
    observers.delete(msg);
  };

  const seedInputs = () => {
    for (const el of document.querySelectorAll(INPUT)) {
      if (el.getAttribute("dir") !== "auto") el.setAttribute("dir", "auto");
    }
  };

  const seedAll = () => {
    document.querySelectorAll(MSG).forEach(watchMessage);
    seedInputs();
  };

  // Body-level observer watches childList only (not characterData) — fires
  // when messages appear or disappear, ignores text typing/streaming entirely.
  // Releasing observers on removal is what keeps memory flat under virtual
  // scrolling: detached nodes can be GC'd because no per-message observer
  // is still holding them.
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.(MSG)) releaseMessage(node);
        node.querySelectorAll?.(MSG).forEach(releaseMessage);
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.(MSG)) watchMessage(node);
        node.querySelectorAll?.(MSG).forEach(watchMessage);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // SPA navigation — re-seed any messages that appeared during the route swap.
  const onNav = () => idle(seedAll);
  window.addEventListener("popstate", onNav);
  for (const method of ["pushState", "replaceState"]) {
    const orig = history[method];
    history[method] = function (...args) {
      orig.apply(this, args);
      onNav();
    };
  }

  idle(seedAll);
  setTimeout(seedAll, 1000);
})();
