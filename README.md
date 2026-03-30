# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decoder for account-abstraction and contract transactions, available as both a CLI and an Electron desktop app.

## Intent

Help engineers quickly inspect transaction intent without manually decoding calldata. The tool focuses on:

- ERC-4337 `handleOps` transactions on EntryPoint v0.7.0
- SimpleAccount-style `execute` / `executeBatch` wrappers
- Direct contract calls where ABI information is available

## What the decoder currently supports

### 1) ERC-4337 path (EntryPoint `handleOps`)

For EntryPoint v0.7.0 transactions, Decode 4337:

- Parses each UserOperation in `handleOps`
- Decodes nested `execute` or `executeBatch` callData
- Attempts to decode inner calls using merged ABI data (artifacts + fallback ABI)
- Returns:
  - decoded call list (`function`, `target`, `args`)
  - optional summary (`amount`, `from`, `beneficiary`) when a transfer-like call is recognized
  - optional gas details (`gasUsed`, `gasPriceGwei`)

### 2) Direct transaction path

For non-EntryPoint transactions, Decode 4337:

- Tries SimpleAccount `execute` / `executeBatch` first
- Falls back to generic direct-call ABI decode
- Returns unknown-call markers (`0x12345678... (unknown)`) when decoding fails

### 3) ABI strategy

Decoding uses:

- **Merged ABI**: function selectors loaded from `artifacts/**/*.json` plus fallback ABI
- **Fallback ABI**: minimum built-in functions (`execute`, `executeBatch`, ERC-20 transfer methods, common `deploy(bytes)`, and `mintFor`)

Verbose output shows whether merged or fallback ABI was used.

## Known constraints and pitfalls

- Human-readable token amounts are currently formatted only for known token addresses (USDC, WETH). Unknown tokens are shown as raw integer amounts.
- `summary` output is produced only when transfer-like arguments are detected (`transfer` / `transferFrom` with expected arg names).
- `BASE_RPC_URL` is only used for chain `8453` (Base). Other chains use the chain default RPC mapping.
- Generic direct-call decoding depends on ABI selector coverage from artifacts.

## Supported chains

Mainnets: Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
Testnets: Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

You can also pass custom chain IDs (`-c`) in decimal or hex.

## Setup

```bash
git clone <repo-url>
cd <repo-dir>
pnpm install
```

Requirements:

- Node.js 18+
- pnpm (or npm/yarn)

## Usage

### CLI

```bash
# Decode a transaction (default chain: Base / 8453)
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Verbose output (includes ABI source, gas details, and decode context)
pnpm start -v <hash>

# Explicit chain (decimal or hex)
pnpm start -c 8453 <hash>
pnpm start -c 0x2105 <hash>
```

### Desktop app

```bash
# If pnpm skipped Electron postinstall scripts:
node node_modules/electron/install.js

# Build + launch app
pnpm run app
```

App workflow:

1. Paste transaction hash
2. Select chain
3. Enable verbose output (optional)
4. Decode and inspect calls/summary

## Developer workflow and runbooks

- Decoder troubleshooting and ABI/artifact maintenance: [docs/DECODER-RUNBOOK.md](docs/DECODER-RUNBOOK.md)
- Mac signing + notarization: [docs/NOTARIZE-MAC.md](docs/NOTARIZE-MAC.md)
- Sharing DMGs safely: [docs/SHARING-DMG.md](docs/SHARING-DMG.md)

## Build and package

```bash
pnpm run build
pnpm run dist
```

Artifacts are emitted to `release/`:

- Mac: `.dmg`, `.zip`
- Windows: NSIS installer + portable `.exe`
- Linux: `.AppImage`, `.deb`

## Scripts

| Script                | Description |
|-----------------------|-------------|
| `pnpm start`          | Run CLI decoder |
| `pnpm run app`        | Build and launch Electron app |
| `pnpm run build`      | Compile TypeScript + copy assets/artifacts |
| `pnpm run dist`       | Package native installers |
| `pnpm run verify-abi` | Verify merged ABI coverage (after build) |

## Environment

Optional `.env`:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

Used by CLI decode calls on Base chain (`8453`).

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
