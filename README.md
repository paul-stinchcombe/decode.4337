# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** and KAMI smart-account transactions. It decodes Entry Point 0.7.0 `handleOps` bundles, SimpleAccount-style direct `execute` / `executeBatch` calls, and direct contract calls covered by the bundled artifacts.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes transactions that bundle UserOperations via `handleOps()` on the Entry Point 0.7.0 contract
- Extracts nested calls from SimpleAccount `execute()` and `executeBatch()`
- Decodes direct transactions with the merged ABI built from `artifacts/**/*.json`
- Labels known `deploy(bytes initCode)` calls when the init code matches bundled contract bytecode
- Produces a transfer summary, when the decoded call is an ERC-20 `transfer` or `transferFrom`, with:
  - **Amount** – formatted with token symbol (e.g. `0.02475 USDC`)
  - **From** – sender address
  - **Beneficiary** – the Entry Point `handleOps` beneficiary for bundled UserOperations; direct transaction summaries currently show the transaction sender in this field

See [Decoding pipeline and ABI artifacts](docs/DECODING-PIPELINE.md) for architecture, extension steps, and troubleshooting.

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

Verbose output includes the artifacts directory, whether the merged ABI or fallback ABI decoded the call, and gas information when the receipt is available.

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

| Script                | Description                                          |
|-----------------------|------------------------------------------------------|
| `pnpm start`          | Run CLI (tx hash as argument)                        |
| `pnpm run app`        | Launch Electron desktop app                          |
| `pnpm run build`      | Compile TypeScript and copy UI/artifacts to `dist/`  |
| `pnpm run verify-abi` | Verify `dist/` can load the expected merged ABI       |
| `pnpm run dist`       | Package native installers                            |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for custom RPC:

```
BASE_RPC_URL=https://mainnet.base.org
```

Used by the CLI when decoding Base (chain 8453) transactions. The desktop app uses the default Base RPC unless a custom RPC is wired into the Electron decode handler.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
