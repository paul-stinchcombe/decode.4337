# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** and related KAMI contract transactions. It understands Entry Point 0.7.0 `handleOps` bundles, SimpleAccount-style `execute` / `executeBatch` calls, and direct contract calls that match the bundled ABIs.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it decodes

- **Entry Point 0.7.0 bundles:** `handleOps()` transactions are decoded into their UserOperations and nested account calls.
- **SimpleAccount wrappers:** direct `execute()` and `executeBatch()` transactions are unwrapped so the inner target, function, and arguments are visible.
- **Direct contract calls:** non-wrapper transactions are decoded against the merged ABI built from `artifacts/**/*.json`.
- **Deploy calls:** `deploy(bytes)` calls are labelled with a matching contract name when the init code matches bundled artifact bytecode.
- **Transfer summaries:** ERC-20 `transfer` and `transferFrom` calls also produce a compact summary with:
  - **Amount** - formatted with a known token symbol when possible, e.g. `0.02475 USDC`
  - **From** - sender or transfer source
  - **Beneficiary** - EntryPoint beneficiary for `handleOps`, or transaction sender for direct transfers

Other decoded calls are shown in the decoded calls list with formatted arguments but do not get a transfer summary.

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

Use verbose mode when you need decoder diagnostics:

```bash
pnpm start -v <hash>
```

Verbose output includes the artifacts directory, whether the merged or fallback ABI decoded the call, and gas used / gas price when the receipt is available.

### Desktop app

```bash
# First-time: ensure Electron binary is installed (if pnpm blocks scripts)
node node_modules/electron/install.js

# Build and run
pnpm run app
```

Paste a transaction hash, select a chain, optionally enable verbose output, and click Decode.

## Decoder architecture

The decoder flow lives in `src/decode.ts`:

1. Fetch the transaction and receipt for the selected chain.
2. If the transaction targets Entry Point 0.7.0, decode `handleOps()` and then unwrap each UserOperation `callData` as `execute` or `executeBatch`.
3. Otherwise, try to decode the transaction input as a direct `execute` or `executeBatch`.
4. If it is not a wrapper call, decode the transaction input as a direct contract call.

ABI loading lives in `src/artifacts.ts`:

- The fallback ABI always includes SimpleAccount `execute` / `executeBatch`, ERC-20 `transfer` / `transferFrom` / `approve`, `deploy(bytes)`, and KAMI `mintFor`.
- At runtime, every non-debug JSON artifact under `artifacts/` is scanned and merged by function selector.
- The merged ABI is cached only after artifact loading adds more functions than the fallback ABI. This lets a later decode retry artifact loading if the first run only found fallbacks.
- Deploy labels come from matching init code against creation or runtime bytecode prefixes in the bundled artifacts.

After changing artifacts or packaging behavior, verify that ABI loading still works:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` checks that the compiled app can load the merged ABI and that required functions such as `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute` are present.

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
| `pnpm run verify-abi` | Verify compiled merged ABI coverage |
| `pnpm run dist`  | Package native installers      |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for custom RPC:

```
BASE_RPC_URL=https://mainnet.base.org
```

Used by the CLI when decoding Base (chain 8453) transactions. Other built-in chains use their viem defaults; custom chain IDs fall back to `https://<chainId>.rpc.thirdweb.com`.

## Troubleshooting

- **`Could not decode transaction.`** The target function selector probably is not in the fallback ABI or bundled artifacts. Add the relevant artifact JSON under `artifacts/`, rebuild, and run `pnpm run verify-abi`.
- **Verbose output says `ABI: fallback only`.** The app did not load expanded artifacts. Check that `artifacts/**/*.json` exists in the project and that `pnpm run build` copied artifacts into `dist/`.
- **Amounts show as `unknown token`.** Only known token addresses are formatted with symbols and decimals. Unknown ERC-20 transfers are shown as the raw integer amount.
- **`This is a simple ETH transfer with no data.`** Plain ETH transfers have no calldata to decode.
- **Custom chain RPC issues.** The CLI only supports `BASE_RPC_URL` as an environment override today. For unsupported or rate-limited chains, add the chain to `src/decode.ts` with a reliable RPC configuration.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
