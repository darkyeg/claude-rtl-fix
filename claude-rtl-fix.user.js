// ==UserScript==
// @name         Claude.ai RTL Fix
// @namespace    https://darky.dev
// @version      1.0.0
// @description  Fixes RTL (Arabic/Persian) text rendering on claude.ai while preserving code blocks and LaTeX math as LTR
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
  const CONFIG = {
    DEBOUNCE_MS: 150,
    RESPONSE: ".standard-markdown",
    USER_MSG: '[data-testid="user-message"]',
    INPUT: '[data-testid="chat-input"], .ProseMirror',
    PROSE: "p, h1, h2, h3, h4, h5, h6, blockquote, dt, dd, summary",
    LTR_FORCED: [
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
    ].join(","),
  };

  //RTL detection (scans prose only, skips code/math/tables)
  const RTL_RE =
    /[\u0591-\u07FF\u200F\u202B\u202E\u2067\uFB1D-\uFDFD\uFE70-\uFEFC]/;

  const detectDir = (el) => {
    for (const node of el.querySelectorAll(
      "p,h1,h2,h3,h4,h5,h6,li,blockquote,dt,dd",
    )) {
      if (node.closest(CONFIG.LTR_FORCED)) continue;
      for (const ch of node.textContent || "") {
        if (RTL_RE.test(ch)) return "rtl";
        if (/[a-zA-Z]/.test(ch)) return "ltr";
      }
    }
    for (const ch of el.textContent || "") {
      if (RTL_RE.test(ch)) return "rtl";
      if (/[a-zA-Z]/.test(ch)) return "ltr";
    }
    return "ltr";
  };

  //CSS  //
  // Handles everything during streaming without JS.
  // List markers use ::before (not native markers) so they
  // participate in unicode-bidi:plaintext flow and position
  // correctly regardless of React re-renders.

  GM_addStyle(`
    /* Text elements */
    .standard-markdown :is(p, h1, h2, h3, h4, h5, h6, dt, dd, summary) {
      unicode-bidi: plaintext;
      text-align: start;
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 0.5rem !important;
      padding-inline-end: 2rem !important;
    }

    /* User messages */
    [data-testid="user-message"],
    [data-testid="user-message"] p {
      unicode-bidi: plaintext;
      text-align: start;
    }

    /* Blockquote — logical props so border flips with direction */
    .standard-markdown blockquote {
      unicode-bidi: plaintext;
      text-align: start;
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
    .standard-markdown blockquote p {
      padding-inline-start: 0 !important;
      padding-inline-end: 0 !important;
    }

    /* Lists — custom markers via ::before so they follow
       unicode-bidi:plaintext and work during streaming */
    .standard-markdown ol {
      list-style: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 0.5rem !important;
      padding-inline-end: 0 !important;
    }
    .standard-markdown ul {
      list-style: none !important;
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 1.5rem !important;
      padding-inline-end: 0 !important;
    }
    .standard-markdown li {
      unicode-bidi: plaintext;
      text-align: start;
      padding-left: 0 !important;
      padding-right: 0 !important;
      padding-inline-start: 0.25rem !important;
    }
    .standard-markdown ol > li::before {
      content: counter(list-item) ".\\00a0";
    }
    .standard-markdown ul > li::before {
      content: "\\2022\\00a0\\00a0";
    }

    /* Code — always LTR */
    .standard-markdown pre,
    .standard-markdown code,
    .standard-markdown .code-block__code,
    .standard-markdown [class*="code-block"],
    .standard-markdown [class*="hljs"] {
      direction: ltr !important;
      unicode-bidi: isolate !important;
      text-align: left !important;
    }

    /* Math — always LTR */
    .standard-markdown .katex-display {
      direction: ltr !important;
      unicode-bidi: isolate !important;
      text-align: center !important;
    }
    .standard-markdown .katex,
    .standard-markdown .katex-html,
    .standard-markdown .katex-mathml,
    .standard-markdown .MathJax,
    .standard-markdown [role="math"] {
      direction: ltr !important;
      unicode-bidi: isolate !important;
    }

    /* Tables */
    .standard-markdown table {
      width: 100% !important;
      table-layout: auto;
    }
    .standard-markdown thead { text-align: start !important; }
    .standard-markdown th,
    .standard-markdown td {
      text-align: start;
      padding: 0.5rem 1rem !important;
    }

    /* Input */
    .ProseMirror,
    [data-testid="chat-input"],
    [contenteditable="true"] { unicode-bidi: plaintext; }
    .ProseMirror p,
    [data-testid="chat-input"] p {
      unicode-bidi: plaintext;
      text-align: start;
    }
  `);

  //DOM processor (debounced)  // Sets dir on containers, table cells, blockquotes.
  // Lists don't need JS — CSS ::before handles them.

  const seen = new WeakSet();

  const processContainer = (el) => {
    el.setAttribute("dir", detectDir(el));

    el.querySelectorAll(CONFIG.PROSE).forEach((node) => {
      if (!node.closest(CONFIG.LTR_FORCED)) node.setAttribute("dir", "auto");
    });

    el.querySelectorAll(CONFIG.LTR_FORCED).forEach((node) => {
      node.setAttribute("dir", "ltr");
    });

    el.querySelectorAll("th, td").forEach((cell) => {
      let rtl = false,
        latin = false;
      for (const ch of cell.textContent || "") {
        if (RTL_RE.test(ch)) {
          rtl = true;
          break;
        }
        if (/[a-zA-Z]/.test(ch)) {
          latin = true;
          break;
        }
      }
      if (rtl) cell.setAttribute("dir", "rtl");
      else if (latin) cell.setAttribute("dir", "ltr");
      else cell.removeAttribute("dir");
    });
  };

  const processAll = () => {
    document.querySelectorAll(CONFIG.RESPONSE).forEach(processContainer);
    document.querySelectorAll(CONFIG.USER_MSG).forEach((msg) => {
      msg.setAttribute("dir", detectDir(msg));
      msg.querySelectorAll("p").forEach((p) => {
        p.setAttribute("dir", "auto");
      });
    });
    for (const input of document.querySelectorAll(CONFIG.INPUT)) {
      if (seen.has(input)) continue;
      input.setAttribute("dir", "auto");
      seen.add(input);
    }
  };

  //Mutation observer
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(processAll, CONFIG.DEBOUNCE_MS);
  };

  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            if (
              node.nodeType === Node.TEXT_NODE &&
              node.parentElement?.closest?.(
                `${CONFIG.RESPONSE},${CONFIG.USER_MSG}`,
              )
            ) {
              schedule();
              return;
            }
            continue;
          }
          if (
            node.matches?.(CONFIG.RESPONSE) ||
            node.matches?.(CONFIG.USER_MSG) ||
            node.querySelector?.(`${CONFIG.RESPONSE},${CONFIG.USER_MSG}`) ||
            node.matches?.("p,li,h1,h2,h3,h4,h5,h6,pre,.katex-display,table") ||
            node.querySelector?.("pre,.katex-display,table")
          ) {
            schedule();
            return;
          }
        }
      }
      if (
        m.type === "characterData" &&
        m.target.parentElement?.closest?.(
          `${CONFIG.RESPONSE},${CONFIG.USER_MSG}`,
        )
      ) {
        schedule();
        return;
      }
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  //SPA navigation
  let url = location.href;
  const onNav = () => {
    if (location.href !== url) {
      url = location.href;
      setTimeout(processAll, 500);
    }
  };

  window.addEventListener("popstate", () => setTimeout(processAll, 300));
  const _push = history.pushState;
  const _replace = history.replaceState;
  history.pushState = function (...a) {
    _push.apply(this, a);
    onNav();
  };
  history.replaceState = function (...a) {
    _replace.apply(this, a);
    onNav();
  };

  //Init  processAll();
  setTimeout(processAll, 1000);
})();
