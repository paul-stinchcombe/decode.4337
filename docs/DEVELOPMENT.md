# Local development

Setup, day-to-day commands, and common pitfalls for working on Decode 4337.

For decoder/ABI internals, desktop IPC, and packaging, see the specialized docs linked at the end. This page covers getting a working local environment.

## Prerequisites

- Node.js 18+
- pnpm (recommended; lockfile is `pnpm-lock.yaml`)

## Install

```bash
git clone https://github.com/paul-stinchcombe/decode.4337.git
cd decode.4337
pnpm install
```

### Electron binary (first-time desktop)

pnpm may ignore Electron’s postinstall scripts (approval / ignored build scripts). If `pnpm run app` fails because the Electron binary is missing, install it once:

```bash
node node_modules/electron/install.js
```

Then retry `pnpm run app`.

## Day-to-day commands

| Command | What it does |
|---------|----------------|
| `pnpm start <txHash>` | CLI decode via `ts-node src/cli.ts` (default chain: Base `8453`) |
| `pnpm start -v <txHash>` | Verbose decode (artifacts dir, ABI source, gas, UserOp details) |
| `pnpm start -c <id> <txHash>` | Chain by decimal or hex ID (`8453`, `0x2105`) |
| `pnpm run build` | Compile TypeScript to `dist/`, copy `src/index.html` and `artifacts/**/*.json` |
| `pnpm run verify-abi` | Assert merged ABI after build (see below) |
| `pnpm run app` | `build` then launch Electron against `dist/` |
| `pnpm run pack` | electron-builder directory output (no full installers) |
| `pnpm run dist` | Full native installers under `release/` |

Always run `pnpm run build` before `pnpm run verify-abi`. The verifier loads `dist/artifacts.js` and expects artifact JSON under the resolved artifacts directory.

## Layout (source of truth)

| Path | Role |
|------|------|
| `src/decode.ts` | Shared decoder: chains, RPC client, `handleOps` / direct paths, summaries |
| `src/artifacts.ts` | Fallback ABI, artifact discovery, merged ABI, deploy bytecode labeling |
| `src/cli.ts` | CLI (`commander` + `dotenv`); passes `BASE_RPC_URL` only for Base |
| `src/electron-main.ts` | Electron main process + `decode` / `resize-window` IPC |
| `src/preload.ts` | Exposes `window.txDecode` with context isolation |
| `src/index.html` | Desktop UI (chain select, verbose toggle, call/summary rendering) |
| `artifacts/` | Checked-in Hardhat-style contract JSON (ABI + bytecode) |
| `scripts/verify-abi.js` | Post-build merged-ABI gate |
| `dist-mac.sh` | Convenience Mac dist entry; sources local `build-env.sh` |

## Environment and secrets

Optional `.env` (gitignored):

```bash
BASE_RPC_URL=https://mainnet.base.org
```

Constraints verified in source:

- CLI reads `BASE_RPC_URL` **only** when `chainId === 8453` (`src/cli.ts`).
- Desktop IPC does **not** pass a custom RPC URL; Base uses `https://mainnet.base.org`, known chains use viem defaults, unknown IDs use `https://{chainId}.rpc.thirdweb.com` (`src/decode.ts`).
- Do not commit signing material. Gitignored secrets include `.env`, `.env.notarize`, and `build-env.sh` (used by `dist-mac.sh`).

Mac signing/notarization env vars (`CSC_*`, `APPLE_*`) are documented in [NOTARIZE-MAC.md](./NOTARIZE-MAC.md).

## Validate a local change

```bash
pnpm run build
pnpm run verify-abi
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

Expected signals when artifacts load correctly:

- `verify-abi`: at least **100** merged functions; required names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`
- Current tree: **104** merged functions
- Sample decode (Base): verbose line `ABI: merged (104 functions)`, inner `transferFrom`, summary `0.02475 USDC`

If verbose shows `ABI: fallback only` (~7 functions), artifact copy/discovery failed—re-run `pnpm run build` and confirm `dist/artifacts/` contains the contract JSON (not only `*.dbg.json`).

## Common pitfalls

| Symptom | Cause / fix |
|---------|-------------|
| `Electron failed to install` / missing binary | Run `node node_modules/electron/install.js` after `pnpm install` |
| `Run "pnpm run build" first` from verify-abi | `dist/artifacts.js` missing—build before verify |
| Desktop decode differs from CLI on Base | CLI may use `BASE_RPC_URL`; desktop does not |
| Custom `-c` chain fails RPC | Unknown IDs hit thirdweb `{chainId}.rpc.thirdweb.com`; confirm the endpoint is reachable |
| `dist-mac.sh` fails on `source ./build-env.sh` | Create a local, gitignored `build-env.sh` that exports `CSC_*` / `APPLE_*`, or follow [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) |
| Token amount shows `(unknown token)` | Only Base USDC / WETH are in `KNOWN_TOKENS` in `src/decode.ts`; other tokens print the raw amount |
| UI has no free-form chain ID | Desktop `<select>` lists the fixed `CHAINS` set; use CLI `-c` for other IDs |

## Related docs

- [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) – Developer ID signing and notarization
- [SHARING-DMG.md](./SHARING-DMG.md) – Quarantine / “damaged” DMG workaround for recipients
