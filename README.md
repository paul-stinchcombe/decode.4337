# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decode 4337 is a CLI + Electron app for decoding Account Abstraction transaction data (ERC-4337 and related direct account calls) into a readable call breakdown.

## Scope

The decoder currently covers three main workflows:

1. **EntryPoint 0.7.0 `handleOps` transactions**
   - Detects transactions sent to `entryPoint07Address`.
   - Parses each UserOperation and decodes nested `execute` / `executeBatch` calls.
2. **Direct smart-account transactions**
   - Decodes top-level `execute` / `executeBatch` even when not wrapped in `handleOps`.
3. **Generic direct contract calls**
   - Decodes `tx.input` directly using a merged ABI loaded from `artifacts/**/*.json`, with fallback ABI support.

Codepaths: `src/decode.ts`, `src/artifacts.ts`.

## Output model

The app returns up to three layers of output:

- **Decoded Calls**: function, target, and decoded arguments for each call.
- **Summary**: shown when a decoded call is ERC-20 `transfer` or `transferFrom`.
  - `amount` uses token metadata for known tokens (otherwise raw integer + `(unknown token)`).
  - `from` is inferred from call args (`transferFrom`) or sender account (`transfer`).
  - `beneficiary` is the EntryPoint beneficiary for `handleOps` flows.
- **Verbose output** (`-v` / UI checkbox):
  - Artifacts directory in use.
  - ABI source used (`merged` or `fallback`).
  - Gas used and gas price (when receipt/price data is available).

## Supported chains

Built-in chain IDs:

- **Mainnets**: Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10), Polygon (137), Soneium (1868)
- **Testnets**: Sepolia (11155111), Base Sepolia (84532), Arbitrum Sepolia (421614), Soneium Minato (1946)

You can also pass custom chain IDs via CLI (`--chain`), which use a generated RPC URL format.

## Setup

```bash
git clone <repo-url>
cd decode-4337
pnpm install
```

Requirements:

- Node.js 18+
- pnpm

## Usage

### CLI

```bash
# Decode on Base (default chain)
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Verbose decode
pnpm start -v <hash>

# Chain override (decimal or hex)
pnpm start -c 8453 <hash>
pnpm start -c 0x2105 <hash>
```

Optional `.env` override for Base RPC:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

### Desktop app

```bash
# Build + run Electron app
pnpm run app
```

In the UI, provide a transaction hash, chain, and optional verbose mode.

## ABI/artifact behavior

The decoder merges function ABIs from `artifacts/**/*.json` and falls back to built-in ABI fragments when artifact loading is unavailable.

Fallback coverage includes:

- `execute`, `executeBatch`
- ERC-20 `transfer`, `transferFrom`, `approve`
- Common `deploy(bytes)` pattern
- `mintFor` for KAMI721C

Build copies artifacts into `dist/`:

```bash
pnpm run build
```

You can verify merged ABI health after build:

```bash
node scripts/verify-abi.js
```

## Packaging

```bash
pnpm run build
pnpm run dist
```

Outputs are written to `release/`:

- **Mac**: `.dmg`, `.zip`
- **Windows**: NSIS installer, portable `.exe`
- **Linux**: `.AppImage`, `.deb`

## Mac signing/notarization runbooks

- [docs/NOTARIZE-MAC.md](docs/NOTARIZE-MAC.md)
- [docs/SHARING-DMG.md](docs/SHARING-DMG.md)

## Troubleshooting quick checks

- **`Invalid chain ID`**: use a positive decimal or `0x` hex value.
- **`Could not decode transaction.`**: enable verbose mode to inspect ABI source and unknown selectors.
- **Unknown token amount formatting**: token metadata is currently hardcoded for known addresses; unknown tokens are shown as raw integers.

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
