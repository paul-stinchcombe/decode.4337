# Desktop renderer

How the Electron window turns a click into the text in `#output`. The page is `src/index.html`. Window lifetime and the height clamp are `src/electron-main.ts`. What a transaction decodes to is `decodeTransaction` in `src/decode.ts`; this page only describes how that result is shown.

`pnpm run app` compiles TypeScript and copies `src/index.html` to `dist/index.html`. The window loads `__dirname/index.html`, so it shows the `dist/` copy. Edits to `src/index.html` appear after the next build.

## What is on screen

Top to bottom:

| Region | Id | Initial value |
|--------|-----|----------------|
| Heading | — | `Decode 4337 for KAMI` (`<h1>`). The window title is `Decode 4337` (`<title>`). |
| Transaction hash | `#hash` | Empty. Placeholder `0x...`. `autocomplete="off"`. No pattern or length check. |
| Chain | `#chain` | First option, `8453` (Base). Option values are the ids in `CHAINS` in `src/decode.ts`. There is no free-form chain field. |
| Verbose | `#verbose` | Unchecked. Label `Show verbose output`. |
| Button | `#decode` | Label `Decode`. |
| Result | `#output` | Empty. CSS shows the placeholder `Decoded summary will appear here...` (`#output:empty::before`) only while the node has no text and no children. |
| Footer | `#footer` | Author link to `https://www.paulstinchcombe.com`, and `#version` text `Version 1.0.1`. That span is a literal in this file. |

Nothing in the page reads or writes `localStorage`. A relaunch restores the defaults above.

The markup has no `<form>`. The only listener is `click` on `#decode`. Pressing Enter in the hash field does not start a decode.

## Click sequence

The handler reads the controls once, at click time: trimmed hash, `chainSelect.value`, and `verboseCheck.checked`. Editing those fields while `Decoding...` is visible does not change the request already in flight. The result pane does not print the hash it decoded.

| Step | Condition | `#output` | Button |
|------|-----------|-----------|--------|
| Before IPC | `window.txDecode.decode` is missing | `Error: Decode API not available. Try restarting the app.` with class `error` | Stays enabled |
| Before IPC | Trimmed hash is empty (whitespace counts as empty) | `Please enter a transaction hash.` with class `error` | Stays enabled |
| Request started | Hash is non-empty | `Decoding...`, class cleared | `disabled` until the promise settles |
| IPC returns `success: false` | — | `result.error`, or `Decode failed.` when `error` is empty. Class `error`. Assigned with `textContent`. | Re-enabled in `finally` |
| IPC promise rejects | — | `String(err)`, class `error`, `textContent` | Re-enabled in `finally` |
| IPC returns `success: true` | — | HTML described below, class cleared | Re-enabled in `finally` |

Those early messages replace whatever was in `#output`. Class `error` is the attribute `class="error"` (`#output.error`, color `#f87171`). Success sets `className` to `''`, which removes it. Error text is not parsed as HTML. Success markup is.

`#decode:disabled` uses a gray background (`#3f3f46`), `cursor: not-allowed`, and opacity `0.7`. A disabled button does not fire another click, so only one decode runs at a time.

## Success markup

Pieces are concatenated in this order. Each inserted value from the result goes through `escapeHtml` (a detached element's `textContent`, then that element's `innerHTML`) so `<` and `&` in a function name or argument stay text.

1. **Gas line, only when `verboseOutput` is missing or empty** and `gasUsed` or `gasPriceGwei` is not `null` or `undefined`. A `<div class="v-gas v-line">` (color `#fcd34d`, inline `margin-bottom: 8px`) whose text is the non-empty parts joined with ` | `:
   - `Gas used: ` + `gasUsed` when that string is non-empty (`"0"` is shown)
   - `Gas price: ` + `gasPriceGwei` + ` Gwei` when that string is non-empty
2. **Verbose block**, when `verboseOutput` is non-empty. `formatVerboseHtml` splits on `\n`, escapes each line, wraps it in `<span class="v-line …">`, and joins with `<br>`. The first matching test wins: line contains `Gas used` or `Gas price` (`v-gas`), then `startsWith` `Artifacts dir:` (`v-meta`), `ABI:` (`v-abi`), `Direct execute` / `Direct call` / `Inner:` / `Target:` / `Function:` (`v-section`), `Decode error:` (`v-error`), `Args:` (`v-label`), otherwise `v-line` only. A verbose success always has a non-empty `verboseOutput`: `withVerboseHeader` contributes `Artifacts dir:`, and `prependGasLine` puts `Gas used` / `Gas price` on the line above that when those fields exist. The string is truthy, so the separate gas `<div>` is omitted and the gas sentence inside the verbose text takes `v-gas`.
3. **Decoded calls**, when `calls.length > 0`. A `📋 Decoded Calls` title (`summary-title`), then one `call-block` per call:
   - `Function:` and the `function` string inside `.fn-name`
   - `Target:` and `target` (`.call-target`)
   - `Args:` and a `<ul>` of `<li>key: value</li>` in `call.args` key order, only when the object has at least one key. An unknown call with `args: {}` has no Args block.
4. **Summary**, when `summary` is set. A `📋 Summary` title and three lines, always: `Amount:`, `From:`, `Beneficiary:` (`summary-line`).

The same two titles are what the CLI prints. The CLI adds chalk and a dashed rule; this page uses the divs above. Section order matches the CLI: verbose text, then calls, then summary.

If that concatenation is `''`, `#output` is set to the text `No summary available.` and the class is still cleared. That is a successful decode with no gas fields, no verbose string, no calls, and no summary. The placeholder does not return, because the node is not empty.

`#output` is monospace, `white-space: pre-wrap`, `word-break: break-all`, `min-height: 120px`. Call cards are normal blocks inside it (`background: #1e1e24`, left border `#3b82f6`).

## Window size

`createWindow` opens one `BrowserWindow` at `width: 560` and `height: 520`. It does not set `useContentSize`, so those numbers are the outer window. `loadFile` loads `path.join(__dirname, 'index.html')`, which is `dist/index.html` when Electron starts from `package.json` `"main"`. On `closed`, the module sets `mainWindow` to `null`.

`window-all-closed` calls `app.quit()` on every platform. There is no `activate` handler and no second call to `createWindow`. Closing the window exits the process; opening the app again is a new launch.

After a **successful** render, `requestContentResize` runs. It does not run for the pre-IPC errors, a failed decode, or a rejected invoke, so a short error leaves the window at whatever size the last success (or the initial window) set.

When `window.txDecode.requestResize` is a function, the page waits one animation frame (so the new markup has a layout), then sends `document.body.scrollHeight + 40`. The footer is inside the body, so it is part of `scrollHeight`. The preload forwards that number on the `resize-window` channel (`ipcRenderer.send`, not `invoke`).

The main process ignores the message when the window is missing or destroyed. Otherwise it `Math.round`s the height, clamps it to **520–1000**, and calls `setContentSize(560, height)`. That sets the **page** size, not the outer frame, and it forces the content width back to 560. A drag-resize by the user lasts only until the next successful decode.

The first success therefore sets a content box of 560×(at least 520). The title-bar frame sits outside that box, and the initial 520 was the outer height, so the framed window grows on the first successful decode. Later successes shrink or grow the content height with the page, inside the clamp. Past 1000px the page scrolls. `html` and `body` set `overflow: auto` and hide the scrollbar (`scrollbar-width: none`, and `::-webkit-scrollbar { display: none }`). The content still scrolls; there is no visible bar.

## Boot script

A second script, after the footer, looks up `#app-loading` and `#app-main` and toggles `hidden` / `visible` on them. The CSS for those ids is in the same file. The elements are not in the markup. An extra `</div>` between the footer and that script does not wrap the form; the parser drops the unmatched closer.

`showApp` always touches both elements. In the Electron window the preload has already defined `window.txDecode.decode`, so the first `check` calls `showApp` and throws `TypeError` (reading `classList` of `null`). That first check runs on `DOMContentLoaded` when `readyState` is still `loading`, and immediately otherwise. `setInterval` runs only when `check` returns false, so this throw does not start the retry timer. The decode click listener is registered by the earlier script, and the form is not inside `#app-main` (that rule would set `opacity: 0`), so the window still shows the form. The exception is visible in DevTools.

The 100ms interval is cleared only when `check` returns `true`. `showApp` throws before that return. Opened without the preload (no `txDecode`), `check` waits 8 seconds, then throws on every tick and the interval stays armed.

Adding a splash screen means adding **both** elements. Putting the form in `#app-main` without `#app-loading` still throws, and the form stays at opacity 0 if the `visible` class is never applied.

## Constraints

- Hash checks in the page are trim-and-non-empty only. A bad hash is sent to the main process and comes back as `success: false` with the decoder or RPC error string.
- The chain `<select>` values have to stay in step with `CHAINS`. The desktop IPC path does not take an RPC URL.
- Call cards read `result.calls` and `result.summary`. They do not parse `verboseOutput`. Changing a verbose log line changes `formatVerboseHtml` colors, not the Function / Target / Args cards.
- `formatVerboseHtml` tests are case-sensitive and do not trim. A gas line is detected with `indexOf`, and that test runs first.
- Resize is not a continuous content observer. Only a successful decode sends a height, and the main process then overwrites the content width.
