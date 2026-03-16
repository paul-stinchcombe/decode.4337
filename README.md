# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decode KAMI / ERC-4337 related transactions from raw calldata into human-readable calls.

The project ships both:
- a CLI (`decode-4337`)
- an Electron desktop app (Mac/Windows/Linux)

## Scope and intent

The decoder focuses on practical transaction inspection for developer workflows:
- Account Abstraction transactions routed through EntryPoint v0.7 (`handleOps`)
- SimpleAccount-style `execute` and `executeBatch`
- direct contract calls when function selectors are present in the merged ABI

For token transfers, it also emits a short summary:
- **Amount**
- **From**
- **Beneficiary**

> Notes:
> - Token symbol formatting is currently built-in for Base USDC and WETH.
> - Unknown tokens are shown as raw integer amounts.

## Supported chains

From `src/decode.ts`:

**Mainnets**
- Ethereum (1)
- Base (8453)
- Arbitrum (42161)
- Optimism (10)
- Polygon (137)
- Soneium (1868)

**Testnets**
- Sepolia (11155111)
- Base Sepolia (84532)
- Arbitrum Sepolia (421614)
- Soneium Minato (1946)

CLI accepts decimal or hex chain IDs (for example `8453` or `0x2105`).  
Unknown chain IDs are allowed and use a generated chain config.

## Decode architecture (high level)

1. Fetch transaction and (if available) receipt.
2. Choose decode path:
   - `handleOps` on EntryPoint v0.7
   - direct `execute` / `executeBatch`
   - generic direct call decode
3. Decode inner calls using:
   - merged ABI from artifact JSON files
   - fallback ABI when merged decode fails
4. Optionally derive transfer summary from decoded `transfer` / `transferFrom`.
5. Include gas metadata (`gasUsed`, `gasPriceGwei`) when available.

ABI behavior comes from `src/artifacts.ts`:
- merged ABI is composed from `artifacts/**/*.json` function selectors
- fallback ABI includes core methods (`execute`, `executeBatch`, ERC-20 transfer flows, `deploy`, `mintFor`)

## Installation

```bash
git clone <repo-url>
cd decode-4337
pnpm install
```

## Usage

### CLI

```bash
# Basic decode (defaults to Base / 8453)
pnpm start 0x<tx_hash>

# Verbose decode with detailed path + ABI info
pnpm start -v 0x<tx_hash>

# Explicit chain ID
pnpm start -c 8453 0x<tx_hash>
pnpm start -c 0x2105 0x<tx_hash>
```

Verbose mode includes:
- artifacts directory being used
- ABI source (`merged` or `fallback`)
- decode path details
- gas used / gas price when receipt data exists

### Desktop app

```bash
# Build and run Electron
pnpm run app
```

In the app:
1. Paste a transaction hash.
2. Select a chain.
3. (Optional) enable verbose output.
4. Click **Decode**.

## Public interfaces

### CLI interface (`src/cli.ts`)

- `decode-4337 [options] <hash>`
- `-v, --verbose`: print detailed decode output
- `-c, --chain <id>`: chain ID in decimal or hex

### Electron bridge (`src/preload.ts`)

The renderer gets `window.txDecode`:
- `decode(hash: string, chainId: string, verbose: boolean)`
- `requestResize(heightPx: number)`

## Developer runbooks

### Validate ABI merge quality

The merged ABI quality check ensures artifacts are being loaded as expected:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` checks:
- minimum merged function count threshold
- presence of required functions (`setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`)

### Build installers

```bash
pnpm run build
pnpm run dist
```

Artifacts are emitted to `release/`:
- macOS: `.dmg`, `.zip`
- Windows: NSIS + portable `.exe`
- Linux: `.AppImage`, `.deb`

## Troubleshooting and common pitfalls

### `Could not decode transaction`

Likely causes:
- selector missing from both merged and fallback ABIs
- unsupported calldata shape
- RPC issues while fetching tx/receipt

What to check:
- run with `-v` for decode path details
- verify artifacts exist and pass `pnpm run verify-abi`
- confirm correct chain ID

### `This is a simple ETH transfer with no data`

The tool requires calldata for function decoding. Plain value transfers are not decoded.

### Verbose output shows `ABI: fallback only`

Merged artifacts were unavailable or insufficient for that selector.  
Rebuild and verify artifact packaging (`pnpm run build`, then `pnpm run verify-abi`).

### Summary differs between AA and direct transactions

- For EntryPoint `handleOps`, `Beneficiary` is the bundler beneficiary from `handleOps`.
- For direct transaction paths, summary `beneficiary` is set from transaction sender (`tx.from`).

## Requirements

- Node.js 18+
- pnpm

## Environment

Optional `.env`:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

This override is used by the CLI when chain `8453` is selected.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
