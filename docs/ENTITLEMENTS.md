# Mac hardened-runtime entitlements

The signed Mac app uses **Hardened Runtime** (`package.json` → `build.mac.hardenedRuntime: true`) plus the exceptions in `build/entitlements.mac.plist`. Apple requires Hardened Runtime for Developer ID notarization. The plist is **not** an App Sandbox profile: there is no `com.apple.security.app-sandbox` key, so the usual sandbox network/file entitlements do not apply.

`electron-builder` attaches the same file to the app **and** to helper processes:

```json
"mac": {
  "hardenedRuntime": true,
  "gatekeeperAssess": false,
  "entitlements": "build/entitlements.mac.plist",
  "entitlementsInherit": "build/entitlements.mac.plist",
  "notarize": true
}
```

`entitlementsInherit` is what Chromium helper binaries (renderer, GPU, plugin) receive. `gatekeeperAssess: false` skips `spctl --assess` during `pnpm run dist`; Gatekeeper still runs on the user’s Mac after they download the DMG. Signing and notarization setup lives in [NOTARIZE-MAC.md](./NOTARIZE-MAC.md). Sharing a quarantined DMG is covered in [SHARING-DMG.md](./SHARING-DMG.md).

## What the checked-in plist grants

All three keys are `true` in `build/entitlements.mac.plist`:

| Key | Apple meaning | Why it is in this repo |
|-----|---------------|-------------------------|
| `com.apple.security.cs.allow-jit` | Allow creating **MAP_JIT** memory so a process can compile and run code at runtime. | Required for Electron/Chromium V8. Official Electron notarize guidance: sign with Hardened Runtime **and** this entitlement. This project ships **Electron 33.4.11**. |
| `com.apple.security.cs.allow-unsigned-executable-memory` | Allow writable+executable memory **without** MAP_JIT restrictions. Broader than `allow-jit`. | Present in the checked-in plist. Electron’s notarize docs say this was required for **Electron 11 and below**, and **should not be applied on Electron 12+** because it widens the attack surface. |
| `com.apple.security.cs.disable-library-validation` | Load frameworks/plugins/dylibs that are **not** signed by Apple or by this app’s Team ID. | Present in the checked-in plist. Apple documents it for apps that load third-party-signed plugins. This repo’s runtime dependencies (`viem`, `commander`, `chalk`, `dotenv`) are JavaScript; there are **no** custom native addons in `package.json`. |

Do not treat the last two keys as proven functional requirements of Decode 4337. They are what the current signing configuration ships. Removing them is a **release-signing change**: rebuild the DMG and re-verify on a Mac before concluding they are unused.

## Constraints

- **Do not add entitlements “just in case.”** Extra Hardened Runtime exceptions (unsigned executable memory, disabled library validation, `disable-executable-page-protection`, `allow-dyld-environment-variables`) increase what a compromised process can do. Add a key only after a signed build fails with a `dyld` / codesign error that names that restriction.
- **Do not convert this to App Sandbox** without a separate design pass. Sandbox would require explicit network and file entitlements; the decoder fetches receipts over HTTPS from the Electron main process (`src/electron-main.ts` → `decodeTransaction`).
- **Keep `entitlements` and `entitlementsInherit` in sync** unless you have a helper-specific reason to split them. Helpers inherit the same JIT needs as Chromium.
- **Treat plist edits like certificate changes.** After any edit: `pnpm run build && pnpm run dist` with the [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) env vars, then inspect the **mounted `.app`**, not only the DMG. electron-builder 25 notarizes/staples the app before it wraps the DMG.
- **`dist-mac.sh` is not a substitute for understanding the plist.** It `source`s a local, gitignored `build-env.sh` and runs `pnpm run dist`. It does not generate or override entitlements.

## Inspect a built app (macOS only)

After mounting `release/Decode 4337-*.dmg`:

```bash
APP="/Volumes/Decode 4337/Decode 4337.app"

# Hardened Runtime must show flags=... (runtime)
codesign --display --verbose=4 "$APP"

# Dump the embedded entitlements (should match the three keys above)
codesign --display --entitlements :- "$APP"
```

If `allow-jit` is missing, expect the renderer to fail once V8 tries to JIT. If library validation is enabled and a helper cannot load a dylib, `dyld` logs which signature was rejected — that log is the evidence for keeping or dropping `disable-library-validation`.

## Related files

| Path | Role |
|------|------|
| `build/entitlements.mac.plist` | The three Hardened Runtime exceptions |
| `package.json` → `build.mac` | Wires the plist, Hardened Runtime, notarize |
| `dist-mac.sh` | Local signed-dist helper (needs `build-env.sh`) |
| `src/electron-main.ts` | Main process; preload isolation is unrelated to these keys |
| [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) | Certificate, env vars, `pnpm run dist` |
| [SHARING-DMG.md](./SHARING-DMG.md) | Quarantine / “file is damaged” after download |
