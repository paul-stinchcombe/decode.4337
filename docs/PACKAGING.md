# Native packaging (Windows & Linux)

How Decode 4337 is packaged with **electron-builder**, with operational focus on **Windows** and **Linux**. Mac signing/notarization and DMG sharing are covered separately:

- [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) – Developer ID, notarization env vars, `dist-mac.sh`
- [SHARING-DMG.md](./SHARING-DMG.md) – quarantine / “damaged” DMG workaround
- [DESKTOP.md](./DESKTOP.md) (when merged) – Electron process model, IPC, artifact discovery

## Intent

`pnpm run dist` turns the compiled Electron app into platform installers under `release/`. Packaging must include both compiled JS (`dist/`) and Hardhat-style contract ABIs (`artifacts/`), or verbose decode falls back to a tiny ABI (~7 functions) and most KAMI selectors fail.

## Config source of truth

All packaging options live in `package.json` → `"build"` (electron-builder 25.x):

| Field | Value | Why it matters |
|-------|--------|----------------|
| `appId` | `com.decode4337.app` | Stable app identity |
| `productName` | `Decode 4337` | Installer / binary display name |
| `directories.buildResources` | `build` | Icons + Mac entitlements (`build/icon.png`, `build/entitlements.mac.plist`) |
| `directories.output` | `release` | Installer output directory (gitignored) |
| `files` | `dist/**/*`, `artifacts/**/*`, `node_modules/**/*` | Runtime payload |
| `main` | `dist/electron-main.js` | Electron entry (`package.json` top-level) |

### Platform targets

| Platform | `package.json` targets | Typical outputs under `release/` |
|----------|------------------------|----------------------------------|
| Windows | `nsis`, `portable` | NSIS setup `.exe`, portable `.exe` |
| Linux | `AppImage`, `deb` | `.AppImage`, `.deb` |
| Mac | `dmg`, `zip` | See Mac docs above |

## Build pipeline

```
src/*.ts + src/index.html + artifacts/**/*.json
        │
        ▼  pnpm run build
dist/electron-main.js, dist/cli.js, dist/preload.js,
dist/decode.js, dist/artifacts.js, dist/index.html,
dist/artifacts/**/*.json   (copyfiles)
        │
        ▼  pnpm run dist   (electron-builder)
release/<platform installers>
```

Scripts:

| Command | Behavior |
|---------|----------|
| `pnpm run build` | `tsc` + copy `index.html` + copy `artifacts/**/*.json` into `dist/` |
| `pnpm run verify-abi` | Loads `dist/artifacts.js` `getMergedAbi()`; expects ≥100 functions and names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute` |
| `pnpm run pack` | `electron-builder --dir` — unpacked app dir only (good for inspecting payload) |
| `pnpm run dist` | Full installer build for the **host** platform’s configured targets |

Always build before packaging. `verify-abi` fails closed if you skip `pnpm run build` (`dist/artifacts.js` missing).

## Platform-specific builds

From a machine that can produce the target (see constraints below):

```bash
pnpm run build
pnpm run verify-abi

# Host defaults (whatever electron-builder selects for this OS)
pnpm run dist

# Or target explicitly
pnpm exec electron-builder --win
pnpm exec electron-builder --linux
pnpm exec electron-builder --mac
```

Unpacked inspection (recommended before shipping):

```bash
pnpm run build
pnpm run pack
# Then confirm artifacts exist inside the unpacked app, e.g.:
#   release/<platform>-unpacked/resources/app/artifacts/
#   and/or .../app/dist/artifacts/
```

`getArtifactsDir()` (`src/artifacts.ts`) probes `__dirname/artifacts`, `__dirname/../artifacts`, Electron `app.getAppPath()/dist/artifacts`, `app.getAppPath()/artifacts`, then `cwd/artifacts`. Packaged apps need at least one of those paths to exist with JSON ABIs (non-`.dbg.json`).

## Windows

### Outputs

- **NSIS** – guided installer (Start Menu / uninstall)
- **Portable** – single `.exe` that runs without a full install

Product name and version come from `productName` / `version` in `package.json` (currently `1.0.1`). Exact filenames include version and may include arch (e.g. `x64`).

### Icon

`build/icon.png` (2048×2048) is the build resource. electron-builder derives Windows icons from it; there is no checked-in `.ico`.

### Code signing (optional)

This repo configures **Mac** notarization (`mac.notarize`, entitlements) but does **not** define Windows-specific signing fields. If you set electron-builder’s standard cert env vars (e.g. `CSC_LINK` / `CSC_KEY_PASSWORD` pointing at a code-signing certificate), Windows builds can be signed when a suitable cert is available. Unsigned builds still run locally; SmartScreen may warn end users on download.

### Windows pitfalls

| Symptom | Cause | Mitigation |
|---------|--------|------------|
| App opens but verbose shows `ABI: fallback only` | `artifacts/` missing from package | Confirm `build.files` still includes `artifacts/**/*`; inspect with `pnpm run pack` |
| “Windows protected your PC” | Unsigned / uncommon publisher | Sign with a trusted cert, or instruct users to use More info → Run anyway for internal builds |
| Wrong arch on target machine | Built for a different CPU | Build on (or for) the intended arch; check `release/` artifact names |
| Stale UI / decoder after bump | Old `dist/` reused | Clean `dist/` and `release/`, then `pnpm run build && pnpm run dist` |

## Linux

### Outputs

- **AppImage** – portable single-file app
- **deb** – Debian/Ubuntu package

### Icon / desktop integration

Same `build/icon.png` source. `.deb` installs integrate with the desktop menu via electron-builder defaults; AppImage is typically run in place (`chmod +x` then execute).

### Linux pitfalls

| Symptom | Cause | Mitigation |
|---------|--------|------------|
| AppImage won’t execute | Missing execute bit / FUSE | `chmod +x *.AppImage`; install FUSE/AppImage runtime if the host requires it |
| `.deb` install conflicts | Same `appId` / package name already installed | Remove previous package, then reinstall |
| Fallback-only ABI | Artifacts not on disk inside the package | Same as Windows: verify unpacked `resources/app` contents |
| Wayland / sandbox display quirks | Host Electron/GPU stack | Try X11 session or update GPU drivers; not configured specially in this repo |

## Cross-build constraints

- **Mac `.app` / notarized DMG** generally require macOS + Apple tooling (see [NOTARIZE-MAC.md](./NOTARIZE-MAC.md)). Prefer `./dist-mac.sh` after creating gitignored `build-env.sh`.
- **Windows / Linux** targets are commonly built on the matching OS. Cross-compilation may need extra host packages (e.g. Wine for some Windows targets); prefer native CI runners when possible.
- Do not commit secrets: `.env.notarize`, `build-env.sh`, and `.p12` / passwords stay local (see `.gitignore`).

## Release checklist (Win / Linux)

1. Bump `version` in `package.json` if shipping a new release.
2. `pnpm install` (and `node node_modules/electron/install.js` if Electron’s binary was skipped).
3. `pnpm run build && pnpm run verify-abi` — must pass.
4. Optional smoke (CLI, same decoder core):  
   `pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc`  
   Expect `transferFrom`, a USDC amount summary, and verbose `ABI: merged (…)` (not fallback-only).
5. `pnpm run pack` — confirm `artifacts` JSON is inside the unpacked app.
6. `pnpm run dist` (or `--win` / `--linux`) — collect artifacts from `release/`.
7. Install/run on a clean machine; decode the sample hash with **Verbose** and confirm `ABI: merged`.

## Related developer surfaces

| Surface | Entry | Notes |
|---------|-------|-------|
| CLI | `pnpm start` / `src/cli.ts` | Optional `BASE_RPC_URL` for Base (`8453`) only |
| Desktop | `pnpm run app` / `src/electron-main.ts` | Does **not** read `BASE_RPC_URL` |
| ABI merge | `src/artifacts.ts` | Selector de-dupe; caches only when merge beat fallback |
| Decoder | `src/decode.ts` | Shared by CLI and desktop |
