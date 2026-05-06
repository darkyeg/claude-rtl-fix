# Claude.ai RTL Fix

A userscript that makes Arabic and Hebrew render correctly on claude.ai.

Claude renders everything left-to-right out of the box. On Arabic content that means broken punctuation, tables flipped the wrong way, and list bullets stuck on the wrong side. This fixes it.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or any userscript manager).
2. Open [`claude-rtl-fix.user.js`](claude-rtl-fix.user.js) and let Tampermonkey install it.

Updates pull from the `main` branch automatically.

## Behavior

The whole message picks one direction based on its content.

If it's mostly Arabic, the message goes RTL: text alignment, table column order, list bullets, blockquote bar — all on the right side. If it's mostly English, the message stays LTR.

Code blocks, inline `code`, and math (KaTeX, MathJax) always render LTR, even inside an Arabic message.

The chat input follows what you type natively. Start typing Arabic, it goes right-to-left; switch to English, it goes left-to-right.

## How it picks direction

It counts Arabic vs Latin characters in the message and takes the majority, capped at the first 2000 characters.

So `API ده محتاج إيه` is detected as Arabic, even though it starts with English.

## Performance

Each message is scanned once. As soon as its direction is locked, the script stops watching it. No rescans during streaming, no work while you scroll, no leftover observers when virtual-scrolled messages unmount.

If you don't notice the script is running, that's the goal.

## License

[MIT](LICENSE)
