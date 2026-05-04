# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** transactions. It turns Entry Point 0.7.0 `handleOps` bundles, SimpleAccount-style `execute` calls, batched calls, and direct contract calls into readable call summaries.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes transactions that bundle UserOperations via `handleOps()` on the Entry Point 0.7.0 contract
- Extracts nested calls from SimpleAccount `execute()` and `executeBatch()`
- Decodes direct `execute`, `executeBatch`, and known direct contract calls using bundled ABI artifacts
- Produces decoded calls with function names, targets, and formatted arguments
- Produces a transfer summary when it can identify an ERC-20 `transfer` or `transferFrom`:
  - **Amount** – formatted with token symbol (e.g. `0.02475 USDC`)
  - **From** – sender address
  - **Beneficiary** – bundler address receiving gas fees
- Shows gas used and gas price when receipt data is available

## Decoding model

The decoder follows these paths in order:

1. **Entry Point 0.7.0 `handleOps`** – when the transaction target is the Entry Point 0.7.0 address, each UserOperation `callData` is decoded as SimpleAccount `execute` or `executeBatch`, then each inner call is decoded.
2. **Direct SimpleAccount calls** – non-Entry Point transactions whose input is `execute` or `executeBatch` are decoded the same way, using the nested target and function bytes.
3. **Generic direct calls** – other transactions with input data are decoded directly against the merged ABI.

Decoded output is intentionally conservative. Unknown selectors are shown as the first 4-byte selector plus `(unknown)` instead of guessing. Verbose mode includes the artifact directory and whether the merged or fallback ABI decoded the call.

### ABI artifacts

ABI coverage comes from two sources:

- `artifacts/**/*.json` – bundled contract artifacts, including KAMI contract ABIs and bytecode.
- Built-in fallback ABI – SimpleAccount `execute`/`executeBatch`, ERC-20 `transfer`/`transferFrom`/`approve`, `deploy(bytes)`, and KAMI `mintFor`.

`src/artifacts.ts` merges function ABI entries by selector and skips duplicate selectors. Deploy calls also try to match `initCode` against known artifact bytecode so verbose output can show names such as `deploy (KAMI721C)`.

When adding or refreshing artifacts:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` loads the built artifact helper from `dist/` and checks that the merged ABI includes broad artifact coverage plus required functions such as `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs can be passed via the CLI `-c` option.

## Installation

```bash
git clone <repo-url>
cd decode-4337
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
| `pnpm run verify-abi` | Verify merged ABI coverage after build |
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

## Troubleshooting

- **`Could not decode transaction.`** The transaction may target an unsupported contract selector, have no matching artifact ABI, or not use the supported Entry Point/SimpleAccount call patterns.
- **`This is a simple ETH transfer with no data.`** The transaction has no input data, so there is no contract call to decode.
- **Verbose output says `ABI: fallback only`.** The app could not load merged artifacts or no artifact matched the selector. Run `pnpm run build && pnpm run verify-abi` to confirm artifacts are copied into `dist/`.
- **Custom RPC only affects Base CLI decodes.** `BASE_RPC_URL` is read by the CLI for chain `8453`; other chains use their configured public RPC defaults.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
