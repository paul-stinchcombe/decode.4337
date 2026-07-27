# Desktop app architecture

Decode 4337’s Electron app shares `decodeTransaction` with the CLI. This page covers the desktop process model, IPC surface, packaging constraints, and common developer pitfalls.

## Process model

| Process | Files | Role |
|---------|-------|------|
| Main | `src/electron-main.ts` | Creates the window, handles IPC, calls `decodeTransaction` |
| Preload | `src/preload.ts` | Bridges a narrow API into the renderer via `contextBridge` |
| Renderer | `src/index.html` | UI: hash, chain select, verbose toggle, decode button, output |

`package.json` sets `"main": "dist/electron-main.js"`. `pnpm run app` runs `pnpm run build && electron .`, so TypeScript and `index.html` must compile/copy into `dist/` before launch.

## Security constraints

From `electron-main.ts` / `index.html`:

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer CSP: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`

The renderer never imports Node or `decode.ts` directly. All decode work goes through the preload bridge.

## Public IPC surface

Exposed on `window.txDecode` (`src/preload.ts`, typed in `src/global.d.ts`):

```ts
window.txDecode.decode(hash, chainId, verbose)
window.txDecode.requestResize(heightPx)
```

| Channel | Direction | Behavior |
|---------|-----------|----------|
| `decode` | `invoke` (renderer → main) | Parses `chainId` with `parseChainId`, then `decodeTransaction(hash, chainId, verbose)` — **no custom RPC URL** |
| `resize-window` | `send` (renderer → main) | Clamps content height to **520–1000** px at fixed width **560** |

Errors from `parseChainId` or unexpected throws are returned as `{ success: false, error: string }` (not thrown across IPC).

## Decode flow (desktop)

```
UI (index.html)
  → window.txDecode.decode(hash, chainId, verbose)
  → ipcMain.handle('decode')
  → decodeTransaction(hash, chainId, verbose)   // rpcUrl omitted
  → createPublicClient + ABI decode in src/decode.ts
```

Shared decoder behavior (Entry Point `handleOps`, direct `execute` / `executeBatch`, generic calls, merged/fallback ABI) is the same as the CLI. See open decoder/artifact docs PRs or `src/decode.ts` / `src/artifacts.ts` for details.

### RPC difference vs CLI

| Surface | Custom RPC |
|---------|------------|
| CLI (`src/cli.ts`) | For Base (`8453`) only: `process.env.BASE_RPC_URL` |
| Desktop | Never passes `rpcUrl`. Base uses `https://mainnet.base.org`; other **known** chains use viem defaults; **unknown** chain IDs use `https://{chainId}.rpc.thirdweb.com` |

Setting `.env` / `BASE_RPC_URL` does **not** affect the desktop app.

## Chains in the UI

The renderer `<select>` lists the same supported set as `CHAINS` in `src/decode.ts`:

- Mainnets: Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium
- Testnets: Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Unlike the CLI `-c` option, the UI has no free-form custom chain ID field.

## Artifacts in packaged builds

`getArtifactsDir()` (`src/artifacts.ts`) probes, in order:

1. `__dirname/artifacts` and `__dirname/../artifacts` (dev / `dist/`)
2. When Electron is available: `app.getAppPath()/dist/artifacts` and `app.getAppPath()/artifacts`
3. `process.cwd()/artifacts`

Build copies artifacts into `dist/` (`copyfiles "artifacts/**/*.json" dist`). Electron Builder packs both `dist/**/*` and `artifacts/**/*` (`package.json` → `build.files`).

**Smoke check:** verbose decode should show `ABI: merged (N functions)` with N ≫ fallback-only (~7). Fallback-only in a packaged app usually means artifacts were not found at runtime.

## Packaging targets

`pnpm run build && pnpm run dist` writes to `release/`:

| Platform | Targets |
|----------|---------|
| Mac | `.dmg`, `.zip` (signing/notarization: [NOTARIZE-MAC.md](./NOTARIZE-MAC.md); quarantine sharing: [SHARING-DMG.md](./SHARING-DMG.md)) |
| Windows | NSIS installer, portable `.exe` |
| Linux | `.AppImage`, `.deb` |

Mac hardened runtime entitlements live in `build/entitlements.mac.plist`. Local signed Mac builds can use `dist-mac.sh` (sources gitignored `build-env.sh`, then `pnpm run dist`).

## Developer setup

```bash
pnpm install
# If pnpm blocked Electron’s postinstall:
node node_modules/electron/install.js

pnpm run build
pnpm run verify-abi   # merged ABI sanity (expects ≥100 fns + required names)
pnpm run app          # build + launch
```

CLI decode (same core, useful for comparing RPC/output):

```bash
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

On Base, that sample should decode an ERC-20 `transferFrom` (e.g. `0.02475 USDC`) with verbose `ABI: merged (…)`.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `Decode API not available. Try restarting the app.` | Preload did not expose `window.txDecode` | Confirm `dist/preload.js` exists; restart after `pnpm run build`; check DevTools for preload errors |
| App launches but decode fails with network/RPC errors | Chain RPC unreachable; desktop ignores `BASE_RPC_URL` | Retry later, try another chain, or use CLI with `BASE_RPC_URL` for Base |
| Verbose shows `ABI: fallback only` | Artifacts not loaded | Run `pnpm run build && pnpm run verify-abi`; ensure `artifacts/**/*.json` are present and packaged |
| Unknown selector / `(unknown)` inner call | Function not in merged or fallback ABI | Refresh contract artifacts under `artifacts/`, rebuild, re-verify |
| Window too short for long verbose output | Height clamp 520–1000 px | Scroll the renderer; reduce verbose noise if content exceeds max height |
| Electron binary missing after install | pnpm ignored lifecycle scripts | `node node_modules/electron/install.js` |

## Related docs

- [SHARING-DMG.md](./SHARING-DMG.md) – quarantine / “damaged” DMG workaround
- [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) – Apple signing and notarization
