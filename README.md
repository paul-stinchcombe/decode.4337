# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A tool for decoding **Account Abstraction (ERC-4337)** transactions for KAMI
workflows. It extracts readable call details from Entry Point 0.7.0
`handleOps` transactions, SimpleAccount-style direct calls, and KAMI contract
calls backed by the bundled artifact ABIs.

Available as a **CLI** and **Electron desktop app** for Mac, Windows, and Linux.

## What it does

- Decodes Entry Point 0.7.0 `handleOps()` transactions that bundle
  UserOperations.
- Extracts nested calls from SimpleAccount `execute()` and `executeBatch()`.
- Decodes direct SimpleAccount `execute` / `executeBatch` transactions and
  generic direct calls when the input matches the merged ABI.
- Merges checked-in KAMI artifacts with a small fallback ABI for ERC-20,
  SimpleAccount, `deploy(bytes)`, and KAMI `mintFor(...)` support.
- Shows decoded call blocks with function name, target, and formatted args.
- Adds gas used and gas price metadata when the transaction receipt is
  available.
- Produces an Amount / From / Beneficiary summary for decoded ERC-20
  `transfer` and `transferFrom` calls.

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

Verbose output includes artifact metadata such as the artifact directory and
whether the decode used the merged artifact ABI or fallback ABI.

### Desktop app

```bash
# First-time: ensure Electron binary is installed (if pnpm blocks scripts)
node node_modules/electron/install.js

# Build and run
pnpm run app
```

Paste a transaction hash, select a chain, optionally enable verbose output, and
click Decode. The desktop app exposes the same decoder as the CLI, but it does
not currently read `BASE_RPC_URL`; see [Environment](#environment).

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

| Script                | Description                                            |
|-----------------------|--------------------------------------------------------|
| `pnpm start`          | Run CLI via `ts-node` (tx hash as argument)            |
| `pnpm run app`        | Build and launch the Electron desktop app              |
| `pnpm run build`      | Compile TypeScript and copy HTML/artifacts into `dist` |
| `pnpm run verify-abi` | Verify merged KAMI artifact ABI coverage after build   |
| `pnpm run pack`       | Package an unpacked Electron app                       |
| `pnpm run dist`       | Package native installers                              |

## Developer docs

- [KAMI artifacts and ABI decoding](./docs/ARTIFACTS.md) - how artifact loading,
  fallback ABI coverage, deploy labeling, and `verify-abi` work.
- [Signing and notarizing Mac builds](./docs/NOTARIZE-MAC.md)
- [Sharing the Decode 4337 DMG](./docs/SHARING-DMG.md)

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## Environment

Optional `.env` for custom Base RPC in the CLI:

```
BASE_RPC_URL=https://mainnet.base.org
```

`src/cli.ts` passes `BASE_RPC_URL` only for Base (chain 8453). Known non-Base
chains use the default RPC URLs from `viem/chains`; unknown custom chain IDs use
`https://{chainId}.rpc.thirdweb.com` as defined in `src/decode.ts`.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
