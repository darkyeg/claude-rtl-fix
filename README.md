# Claude.ai RTL Fix

Tampermonkey userscript that adds RTL support to claude.ai.

Claude has no built-in support for Arabic or Persian — text is always left-aligned with broken punctuation. This fixes that.

## What it fixes

- RTL text flows right-to-left, right-aligned
- LTR text stays left-aligned
- Mixed paragraphs — each one picks its own direction
- Code blocks and math — always LTR
- Tables — per-cell direction, correct column order
- Blockquotes — border on the correct side
- Lists — markers follow text direction (works during streaming)
- Input box — auto-detects direction as you type

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/)
2. Open `claude-rtl-fix.user.js` (or click Raw on GitHub)
3. Tampermonkey will ask to install — click **Install**

Or: Tampermonkey dashboard → new script → paste contents → save.

## How it works

Mostly CSS. `unicode-bidi: plaintext` handles per-paragraph direction detection. List markers use `::before` pseudo-elements so they work correctly even while Claude is streaming — no fighting with React re-renders. A `MutationObserver` sets `dir` on containers and table cells for table/blockquote layout.

## License

[MIT](LICENSE)
