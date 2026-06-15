# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A CLI and Electron desktop app for decoding **Account Abstraction (ERC-4337)** transactions. It turns Entry Point 0.7 `handleOps` transactions, direct SimpleAccount calls, and KAMI contract calls into readable call summaries.

The tool is optimized for KAMI workflows, but it can also decode generic calls when the function exists in the bundled artifacts or fallback ABI.

## What it decodes

- Entry Point 0.7 `handleOps()` transactions sent to the canonical Entry Point address.
- SimpleAccount-style `execute()` and `executeBatch()` call data, including direct transactions that call those functions without going through Entry Point.
- Direct contract calls whose selectors are present in the merged artifact ABI.
- ERC-20 `transfer`, `transferFrom`, and `approve` from the fallback ABI.
- Common KAMI calls, including `mintFor`, `setPrice`, `setTokenURI`, and deployments through `deploy(bytes)`.

When a transfer summary can be built, output includes:

- **Amount** - formatted for known tokens, or shown as the raw integer for unknown tokens.
- **From** - the sender or `transferFrom` source address.
- **Beneficiary** - the `handleOps` beneficiary for Entry Point transactions. For direct execute paths, there is no Entry Point beneficiary, so the field is populated from the transaction sender when a summary is available.
- **Gas metadata** - gas used and gas price when a receipt is available.

Verbose output also reports the artifact directory and whether decoding used the merged artifact ABI or the fallback ABI.

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs can be passed via the CLI `-c` option. Known chains use `viem/chains`; unknown chain IDs fall back to `https://<chainId>.rpc.thirdweb.com`.

## Installation

```bash
git clone <repo-url>
cd decode-4337
pnpm install
```

## Usage

### CLI

```bash
# Decode a transaction on Base by default
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Show verbose decode details
pnpm start -v <hash>

# Select a chain by decimal or hex ID
pnpm start -c 8453 <hash>
pnpm start -c 0x2105 <hash>
```

### Desktop app

```bash
# First-time: ensure Electron binary is installed if pnpm blocks scripts
node node_modules/electron/install.js

# Build and run the Electron app
pnpm run app
```

Paste a transaction hash, select a chain, optionally enable verbose output, and click **Decode**.

## Architecture

The CLI and desktop app share the same decoder:

1. `src/cli.ts` parses command-line options and calls `decodeTransaction()`.
2. `src/electron-main.ts` registers the `decode` IPC handler and calls the same `decodeTransaction()` function.
3. `src/preload.ts` exposes `window.txDecode.decode()` and `window.txDecode.requestResize()` to the isolated renderer.
4. `src/decode.ts` fetches the transaction and receipt with `viem`, chooses the chain/RPC, and routes the call through the Entry Point, SimpleAccount, or generic direct-call decode paths.
5. `src/artifacts.ts` loads bundled artifact JSON, merges function ABIs by selector, and falls back to a small built-in ABI when artifacts are unavailable.

The Electron renderer is intentionally isolated (`contextIsolation: true`, `nodeIntegration: false`). Add new renderer capabilities through the preload bridge instead of exposing Node APIs directly.

## ABI artifacts

KAMI artifacts live under `artifacts/` and are copied into `dist/artifacts/` by `pnpm run build`.

At runtime the decoder searches for artifacts in:

1. `dist/artifacts` next to the compiled app code.
2. The packaged Electron app path.
3. The repository `artifacts/` directory.

Artifact loading skips `*.dbg.json`, reads each `abi` and `methodIdentifiers` map, and de-duplicates functions by selector. The fallback ABI always includes:

- SimpleAccount `execute` and `executeBatch`
- ERC-20 `transfer`, `transferFrom`, and `approve`
- `deploy(bytes)`
- KAMI `mintFor`

Run ABI verification after changing artifacts or artifact loading:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` fails if the merged ABI has fewer than 100 functions or is missing required functions such as `setPrice`, `mintFor`, `setTokenURI`, `deploy`, or `execute`.

## Build native installers

```bash
pnpm run build
pnpm run dist
```

Outputs to `release/` (for example, `Decode 4337-1.0.1-arm64.dmg`):

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

For signed and notarized Mac builds, see:

- [docs/NOTARIZE-MAC.md](docs/NOTARIZE-MAC.md)
- [docs/SHARING-DMG.md](docs/SHARING-DMG.md)

## Scripts

| Script                | Description                                      |
|-----------------------|--------------------------------------------------|
| `pnpm start`          | Run CLI (`pnpm start --help` for options)        |
| `pnpm run app`        | Build and launch the Electron desktop app        |
| `pnpm run build`      | Compile TypeScript and copy HTML/artifacts       |
| `pnpm run verify-abi` | Validate the merged ABI after a build            |
| `pnpm run dist`       | Package native installers with electron-builder  |

## Requirements

- Node.js 18+
- pnpm

## Environment

Optional `.env` for the CLI:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

`BASE_RPC_URL` overrides the Base RPC used by the CLI for chain `8453`. The desktop app uses the built-in Base default unless the code is changed to pass a custom RPC URL through IPC.

## Troubleshooting

### `Run "pnpm run build" first so dist/artifacts.js exists.`

`pnpm run verify-abi` reads the compiled `dist/artifacts.js`; run `pnpm run build` first.

### Verbose output says `ABI: fallback only`

The decoder could not load the merged artifact ABI. Check that `artifacts/**/*.json` exists and that `pnpm run build` copied it into `dist/artifacts/`.

### A call is shown as `0x12345678... (unknown)`

The function selector was not found in the merged artifact ABI or fallback ABI. Add or refresh the relevant artifact JSON, then run:

```bash
pnpm run build
pnpm run verify-abi
```

### Summary amount shows `(unknown token)`

Only known token addresses are formatted with symbols/decimals. Unknown tokens are still decoded, but amounts are shown as raw integers.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
