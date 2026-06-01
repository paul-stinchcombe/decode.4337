# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** and KAMI contract transactions. It fetches a transaction and receipt, decodes the input data into human-readable calls, and shows gas metadata plus transfer summaries where the decoded call has enough token information.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it decodes

- Entry Point 0.7.0 `handleOps()` transactions, including each bundled UserOperation.
- SimpleAccount-style nested calls:
  - `execute(address dest, uint256 value, bytes func)`
  - `executeBatch(address[] dest, uint256[] value, bytes[] func)`
- Direct transactions to smart accounts using `execute()` or `executeBatch()`.
- Generic direct contract calls when their selector exists in the merged ABI.
- Common fallback calls even when artifacts are missing:
  - ERC-20 `transfer`, `transferFrom`, `approve`
  - SimpleAccount `execute`, `executeBatch`
  - `deploy(bytes)`
  - KAMI `mintFor(...)`

For ERC-20 `transfer` and `transferFrom`, Decode 4337 also produces a concise summary:

- **Amount** - formatted with a known token symbol where available, for example `0.02475 USDC`.
- **From** - the transfer sender or smart account sender.
- **Beneficiary** - the EntryPoint beneficiary for `handleOps`, or the transaction sender for direct calls.

All decoded calls are still shown even when no transfer summary can be derived.

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
pnpm start -v <hash>        # Verbose output (gas, artifacts path, ABI source, details)
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

## Decoding architecture

The shared decoding pipeline lives in `src/decode.ts` and is used by both `src/cli.ts` and the Electron IPC handler in `src/electron-main.ts`.

1. Parse the chain ID with `parseChainId()`.
2. Create a `viem` public client and fetch the transaction plus receipt.
3. If the transaction targets Entry Point 0.7.0, decode `handleOps()` with `viem/account-abstraction`.
4. For each UserOperation, decode SimpleAccount `execute()` or `executeBatch()` calldata.
5. For non-EntryPoint transactions, first try direct `execute()`/`executeBatch()`, then fall back to generic direct-call decoding.
6. Decode inner function selectors against the merged ABI from `src/artifacts.ts`.
7. Return a `DecodeResult` containing decoded calls, optional summary, optional verbose output, ABI source, gas used, gas price, or an error.

### ABI and artifact loading

`src/artifacts.ts` builds the merged ABI from two sources:

- Fallback ABIs embedded in code for the most common calls.
- JSON contract artifacts under `artifacts/**/*.json`.

The loader skips `*.dbg.json`, deduplicates functions by selector, and prefers `methodIdentifiers` from artifacts when present. It also uses artifact bytecode prefixes to label known deploy calls, for example `deploy (KAMI721C)`, when the `initCode` matches a bundled contract artifact.

`pnpm run build` copies the artifacts into `dist/artifacts`, so packaged CLI and desktop builds can decode KAMI contract selectors without depending on the source tree layout.

## Developer workflow

```bash
pnpm install
pnpm run build
pnpm run verify-abi
```

Run `pnpm run verify-abi` after changing artifacts, build packaging, or ABI loading. It requires a fresh build because it imports `dist/artifacts.js` and checks that the merged ABI includes at least 100 functions plus required functions such as `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.

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

| Script                | Description                            |
|-----------------------|----------------------------------------|
| `pnpm start`          | Run CLI (tx hash as argument)          |
| `pnpm run app`        | Launch Electron desktop app            |
| `pnpm run build`      | Compile TypeScript                     |
| `pnpm run verify-abi` | Verify merged ABI coverage after build |
| `pnpm run dist`       | Package native installers              |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for Base RPC overrides:

```
BASE_RPC_URL=https://mainnet.base.org
```

The CLI passes `BASE_RPC_URL` when decoding Base (chain 8453). Without it, Base uses `https://mainnet.base.org`. Other known chains use the `viem/chains` RPC metadata; custom chain IDs fall back to `https://<chainId>.rpc.thirdweb.com`.

## Troubleshooting

### Could not decode transaction

- Confirm the transaction hash and selected chain match.
- Enable verbose output to see the artifacts directory and whether the merged or fallback ABI was used.
- If verbose output says `ABI: fallback only`, run `pnpm run build` and then `pnpm run verify-abi` to confirm packaged artifacts are available.

### Token amount appears as an unknown raw integer

Only built-in known tokens are formatted with symbols and decimals. Unknown ERC-20 targets are shown as the raw integer amount with `(unknown token)`.

### No summary appears, but decoded calls do

Summaries are only derived for ERC-20 `transfer` and `transferFrom` calls. Other decoded functions, such as KAMI minting, approvals, deploys, and generic contract calls, are displayed in the decoded calls list without an amount/from/beneficiary summary.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
