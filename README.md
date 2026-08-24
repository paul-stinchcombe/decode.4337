# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** transactions. Extracts the human-readable summary from `handleOps` calls on the Entry Point 0.7.0 contract—including SimpleAccount-style transfers—so you can see the formatted amount, token, sender, and beneficiary at a glance.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes transactions that bundle UserOperations via `handleOps()` on the Entry Point 0.7.0 contract
- Extracts nested calls from SimpleAccount `execute()` (e.g. ERC-20 `transferFrom`)
- Produces a summary with:
  - **Amount** – formatted with token symbol (e.g. `0.02475 USDC`)
  - **From** – sender address
  - **Beneficiary** – bundler address receiving gas fees

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs can be passed via the CLI `-c` option.

## Installation

```bash
git clone https://github.com/paul-stinchcombe/decode.4337.git
cd decode.4337
pnpm install
```

## Usage

### CLI

```bash
# Decode a transaction (default: Base)
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Options
pnpm start -v <hash>        # Verbose output (full decode details)
pnpm start -c 8453 <hash>   # Chain by ID (decimal)
pnpm start -c 0x2105 <hash> # Chain by ID (hex)
```

After `pnpm run build`, the same CLI is `node dist/cli.js`. Decode failures print to stderr but still exit `0` — see [docs/EMBEDDING.md](docs/EMBEDDING.md) if you need a structured result or a non-zero exit code.

### Programmatic API

The CLI and desktop app both call `decodeTransaction` from `src/decode.ts`. Embed it from Node (do not `require` the package `main`; that is the Electron entry):

```js
const { decodeTransaction } = require('./dist/decode');
const result = await decodeTransaction(hash, 8453, false);
```

Full argument/result contract, RPC rules, and pitfalls: **[docs/EMBEDDING.md](docs/EMBEDDING.md)**.

### Desktop app

```bash
# First-time: ensure Electron binary is installed (if pnpm blocks scripts)
node node_modules/electron/install.js

# Build and run
pnpm run app
```

Paste a transaction hash, select a chain, optionally enable verbose output, and click Decode.

## Build native installers

```bash
pnpm run build
pnpm run dist
```

Outputs to `release/` (e.g. `Decode 4337-1.0.1-arm64.dmg`):

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

## Scripts

| Script           | Description                    |
|------------------|--------------------------------|
| `pnpm start`     | Run CLI (tx hash as argument)  |
| `pnpm run app`   | Launch Electron desktop app    |
| `pnpm run build` | Compile TypeScript             |
| `pnpm run dist`  | Package native installers      |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for custom RPC:

```
BASE_RPC_URL=https://mainnet.base.org
```

Used when decoding Base (chain 8453) transactions. The desktop app does not read this variable; embedders can pass any RPC URL as the fourth argument to `decodeTransaction`.

## Docs

- [Embedding the decoder](docs/EMBEDDING.md) — `decodeTransaction` API, result fields, RPC, CLI exit-code pitfall
- [Sharing the Mac DMG](docs/SHARING-DMG.md) — quarantine workaround for unsigned downloads
- [Signing & notarizing (Mac)](docs/NOTARIZE-MAC.md) — Developer ID + notarization for `pnpm run dist`

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
