# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** and KAMI smart-account transactions. It extracts human-readable calls from Entry Point 0.7.0 `handleOps` transactions, direct SimpleAccount-style calls, and known KAMI contract calls so you can see the decoded function, target, arguments, gas metadata, and any token transfer summary at a glance.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes transactions that bundle UserOperations via `handleOps()` on the Entry Point 0.7.0 contract.
- Extracts nested calls from SimpleAccount `execute()` and `executeBatch()` calldata.
- Decodes direct contract calls with the merged KAMI ABI when the transaction is not an Entry Point call.
- Labels recognized KAMI deploy calldata as `deploy (ContractName)` when artifact bytecode matches the `initCode`.
- Shows a decoded call list with function name, target address, and formatted arguments.
- Produces a summary with:
  - **Amount** - formatted with token symbol for known Base tokens, or raw units for unknown tokens.
  - **From** - sender address.
  - **Beneficiary** - the Entry Point beneficiary for `handleOps`, or the transaction sender for direct smart-account calls.
- Includes gas used and gas price when a receipt is available.

## How decoding works

`src/decode.ts` fetches the transaction and receipt with `viem`, then chooses one of three decode paths:

1. **Entry Point 0.7 `handleOps`** - unwraps each UserOperation, decodes SimpleAccount `execute` / `executeBatch`, then decodes each inner call.
2. **Direct SimpleAccount call** - decodes transaction input as `execute` / `executeBatch`, then decodes inner calls.
3. **Generic direct call** - decodes transaction input against the merged ABI.

`src/artifacts.ts` builds the merged ABI from `artifacts/**/*.json`, skipping `*.dbg.json`, and falls back to a small built-in ABI for SimpleAccount `execute`, ERC-20 `transfer` / `transferFrom` / `approve`, `deploy(bytes)`, and KAMI `mintFor`. The verbose output includes the artifacts directory and whether the merged or fallback ABI decoded the call.

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

Outputs to `release/` (e.g. `Decode 4337-1.0.1-arm64.dmg`):

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

## Scripts

| Script           | Description                    |
|------------------|--------------------------------|
| `pnpm start`     | Run CLI (tx hash as argument)  |
| `pnpm run app`   | Launch Electron desktop app    |
| `pnpm run build` | Compile TypeScript and copy `index.html` / `artifacts/**/*.json` to `dist/` |
| `pnpm run verify-abi` | Verify the built merged ABI has expected KAMI coverage |
| `pnpm run pack`  | Build unpacked Electron app for inspection |
| `pnpm run dist`  | Package native installers      |

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for the CLI Base RPC override:

```
BASE_RPC_URL=https://mainnet.base.org
```

`BASE_RPC_URL` is used only by the CLI when decoding Base (chain 8453). The Electron app uses the default RPC selection in `src/decode.ts`: Base defaults to `https://mainnet.base.org`, built-in chains use viem chain defaults, and unknown custom chain IDs use `https://{chainId}.rpc.thirdweb.com`.

Known token formatting is intentionally small: Base USDC and WETH are displayed with symbols and decimals. Other token transfers decode, but the amount is shown in raw units with `unknown token`.

## Developer workflows

### Verify ABI coverage after artifact changes

Run this after updating contract artifacts or decoder artifact-loading logic:

```bash
pnpm run build
pnpm run verify-abi
```

The verifier loads `dist/artifacts.js`, checks that the merged ABI has at least 100 functions, and confirms required functions including `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.

See [docs/ARTIFACTS.md](docs/ARTIFACTS.md) for the artifact update runbook.

### Mac signing and sharing

- [docs/NOTARIZE-MAC.md](docs/NOTARIZE-MAC.md) explains the signed and notarized Mac build.
- [docs/SHARING-DMG.md](docs/SHARING-DMG.md) explains the quarantine workaround for unsigned or unnotarized DMGs.

## Troubleshooting

- **`Could not decode transaction.`** The transaction may call a function that is not present in the merged artifacts or fallback ABI. Update artifacts if the contract should be supported, then run `pnpm run build && pnpm run verify-abi`.
- **`This is a simple ETH transfer with no data.`** The transaction has no calldata to decode.
- **Verbose output says `ABI: fallback only`.** The artifacts directory was missing or did not provide a matching selector. Check that `pnpm run build` copied `artifacts/**/*.json` into `dist/artifacts/`.
- **Custom chain fails to fetch.** Pass a supported chain ID with `-c`; unknown chain IDs rely on the thirdweb RPC URL pattern and may require network support outside this app.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
