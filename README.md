# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** transactions. Extracts the human-readable summary from `handleOps` calls on the Entry Point 0.7.0 contract—including SimpleAccount-style transfers—so you can see the formatted amount, token, and gas beneficiary at a glance.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes transactions that bundle UserOperations via `handleOps()` on the Entry Point 0.7.0 contract
- Extracts nested calls from SimpleAccount `execute()` (e.g. ERC-20 `transferFrom`)
- When that inner call is ERC-20 `transfer` or `transferFrom`, also prints one **Summary** (see [docs/SUMMARY.md](docs/SUMMARY.md)):
  - **Amount** – formatted when the target is Base USDC or WETH (sample: `0.02475 USDC`); otherwise the raw integer plus `(unknown token)`
  - **From** – the token `from` argument on `transferFrom`, or the smart-account sender on `transfer`
  - **Beneficiary** – the `handleOps` beneficiary (the address paid for gas)

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs can be passed via the CLI `-c` option.

## Installation

```bash
git clone <repo-url>
cd decode.tx
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

Outputs to `release/` (e.g. `Decode 4337-1.0.0-arm64.dmg`):

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

Used when decoding Base (chain 8453) transactions.

## Documentation

- [Summary fields](docs/SUMMARY.md) – when Amount / From / Beneficiary are set, and which address each one uses
- [Sharing a DMG](docs/SHARING-DMG.md) – quarantine workaround for an unsigned Mac download
- [Signing and notarizing](docs/NOTARIZE-MAC.md) – Developer ID certificate, env vars, and `pnpm run dist`

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
