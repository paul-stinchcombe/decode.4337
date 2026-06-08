# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** and KAMI contract transactions. It decodes Entry Point 0.7.0 `handleOps` calls, SimpleAccount-style direct `execute` / `executeBatch` calls, and direct KAMI contract calls using bundled Solidity artifacts.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it decodes

- **Entry Point 0.7.0 `handleOps`** transactions. Each UserOperation's `callData` is decoded as SimpleAccount `execute` or `executeBatch`, then each nested call is decoded.
- **Direct smart-account calls** to `execute` or `executeBatch`. The outer account call is unwrapped and the inner target call is decoded.
- **Direct contract calls**. If a transaction is not an Entry Point or SimpleAccount call, the top-level `tx.input` is decoded against the merged ABI.

Decoded calls are returned as function name, target address, and decoded arguments. When a `deploy(bytes)` call contains known KAMI creation bytecode, it is labelled with the contract name, for example `deploy (KAMI721C)`.

## Output

The CLI and desktop app can show:

- **Decoded Calls** - every decoded inner or direct call, including KAMI functions such as `mintFor`, `setPrice`, `setTokenURI`, and `deploy`.
- **Summary** - shown when the decoder finds an ERC-20 `transfer` or `transferFrom` inside an Entry Point UserOperation or unwrapped SimpleAccount `execute` / `executeBatch` call:
  - **Amount** - formatted with a known token symbol when available, e.g. `0.02475 USDC`.
  - **From** - the transfer sender. For direct calls this is the transaction sender; for 4337 calls this is the smart account or `transferFrom` sender.
  - **Beneficiary** - the Entry Point beneficiary for 4337 transactions, or the transaction sender for direct calls.
- **Gas metrics** - gas used and gas price when the transaction receipt or transaction data exposes them. The desktop app shows these when available; the CLI includes them in verbose output.
- **Verbose metadata** - artifact directory, ABI source (`merged` or `fallback only`), Entry Point/UserOp details, direct-call details, and decode errors for unknown selectors.

The transfer summary is intentionally narrow: in batches, the first decoded ERC-20 transfer-like call is used; other call types are listed under Decoded Calls but do not produce a Summary.

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs can be passed via the CLI `-c` option. Unknown chain IDs use a fallback RPC URL in the form `https://{chainId}.rpc.thirdweb.com`.

## ABI and artifacts

KAMI decoding is driven by JSON artifacts in `artifacts/`. At runtime the decoder:

1. Loads every `artifacts/**/*.json` file except `*.dbg.json`.
2. Merges function ABI entries by selector, preferring artifact `methodIdentifiers` when available.
3. Falls back to a small built-in ABI for SimpleAccount `execute` / `executeBatch`, ERC-20 `transfer` / `transferFrom` / `approve`, `deploy(bytes)`, and KAMI `mintFor`.
4. Matches deploy init code against artifact bytecode prefixes to display known contract names.

Run the ABI verification script after builds or artifact changes:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` checks that the merged ABI loaded from `dist/` contains at least 100 functions and required functions such as `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.

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

The desktop app uses the default RPC configuration from the decoder. Custom `BASE_RPC_URL` is currently wired only through the CLI.

## Build native installers

```bash
pnpm run build
pnpm run dist
```

Outputs to `release/` (e.g. `Decode 4337-1.0.1*.dmg`):

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

## Scripts

| Script                | Description                                                |
|-----------------------|------------------------------------------------------------|
| `pnpm start`          | Run CLI (tx hash as argument)                              |
| `pnpm run app`        | Build and launch Electron desktop app                      |
| `pnpm run build`      | Compile TypeScript, copy UI HTML, and copy artifacts       |
| `pnpm run verify-abi` | Verify the built merged ABI contains required KAMI methods |
| `pnpm run pack`       | Package an unpacked Electron app in `release/`             |
| `pnpm run dist`       | Package native installers                                  |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for custom RPC:

```
BASE_RPC_URL=https://mainnet.base.org
```

Used by the CLI when decoding Base (chain 8453) transactions. Other chain IDs use their configured viem RPC URLs or the thirdweb fallback for unknown custom chains.

## Known limitations

- Summary formatting only recognizes Base USDC (`0x8335...2913`) and WETH (`0x4200...0006`). Other ERC-20 transfers show the raw integer amount with `(unknown token)`.
- Unknown selectors are reported as `0x12345678... (unknown)` rather than treated as fatal if the outer transaction can still be decoded.
- The bundled artifacts are the source of truth for KAMI-specific functions. If contract artifacts change, rebuild and run `pnpm run verify-abi`.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
