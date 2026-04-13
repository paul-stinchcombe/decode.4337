# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decoder for Account Abstraction and direct contract calls, available as a CLI and Electron desktop app.

## What it does

- Decodes EntryPoint `handleOps` transactions (ERC-4337 v0.7.0)
- Decodes direct `execute` and `executeBatch` account calls
- Falls back to decoding generic direct contract calls when possible
- Produces a readable call list (function, target, args)
- Adds gas metadata (`gasUsed`, `gasPriceGwei`) when transaction receipt data is available

For transfer-style calls (`transfer`, `transferFrom`), it also builds a compact summary:

- **Amount** (formatted for known tokens)
- **From**
- **Beneficiary**

Known token formatting currently includes:

- USDC (`0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`, 6 decimals)
- WETH (`0x4200000000000000000000000000000000000006`, 18 decimals)

## Architecture at a glance

- `src/cli.ts`: Parses args (`--verbose`, `--chain`) and prints decoded output.
- `src/electron-main.ts` + `src/preload.ts`: Exposes the same decoder to the desktop UI.
- `src/decode.ts`: Main decode engine, path selection, summary extraction, gas metadata.
- `src/artifacts.ts`: ABI loading and merge strategy (artifact-derived ABI + fallback ABI).

Both CLI and Electron use the same `decodeTransaction(...)` implementation.

## Supported decode paths

| Path | Behavior |
| --- | --- |
| `handleOps` on EntryPoint v0.7.0 | Walks UserOps and decodes nested `execute`/`executeBatch` calls |
| Direct `execute(dest,value,func)` | Decodes inner `func` against merged/fallback ABI |
| Direct `executeBatch(dest[],value[],func[])` | Decodes each inner `func` entry |
| Generic direct call | Attempts direct ABI decode of `tx.input` |

If no path can decode the input, the tool returns `Could not decode transaction.`

## ABI resolution and constraints

Decoder ABI is built from:

1. Fallback ABI (always available): `execute`, `executeBatch`, ERC-20 transfer functions, `deploy(bytes)`, `mintFor(...)`
2. Contract artifact ABIs from `artifacts/**/*.json` (excluding `.dbg.json`)

In verbose mode, output includes:

- Active artifacts directory
- Whether decode used merged ABI or fallback ABI only

`deploy(bytes)` calls are additionally annotated with contract kind when init code matches known artifact bytecode signatures.

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

Custom chain IDs are supported via `-c`.

- For chain `8453` (Base), default RPC is `https://mainnet.base.org` (or `BASE_RPC_URL` if set).
- For other chains, decoder uses a generated RPC URL of the form `https://<chainId>.rpc.thirdweb.com`.

## Installation

```bash
git clone <repo-url>
cd <repo-dir>
pnpm install
```

## Usage

### CLI

```bash
# Decode on default chain (Base mainnet: 8453)
pnpm start 0x<tx-hash>

# Verbose mode (ABI source, artifacts path, decode details)
pnpm start -v 0x<tx-hash>

# Explicit chain ID (decimal or hex)
pnpm start -c 8453 0x<tx-hash>
pnpm start -c 0x2105 0x<tx-hash>
```

### Desktop app

```bash
pnpm run app
```

Paste a transaction hash, select chain, optionally enable verbose output, and click **Decode**.

## Build and distribution

```bash
pnpm run build
pnpm run dist
```

Outputs are written to `release/`:

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

Mac signing/notarization docs:

- `docs/NOTARIZE-MAC.md`
- `docs/SHARING-DMG.md`

## Scripts

| Script | Description |
| --- | --- |
| `pnpm start` | Run CLI decoder |
| `pnpm run app` | Build and launch Electron app |
| `pnpm run build` | Compile TypeScript and copy static assets/artifacts |
| `pnpm run verify-abi` | Validate merged ABI function coverage |
| `pnpm run dist` | Package native installers via electron-builder |

## Troubleshooting

- **`Invalid chain ID: ...`**  
  `-c/--chain` accepts positive decimal or hex values only.

- **`Could not decode transaction.`**  
  Run verbose mode first (`-v`) and check:
  - artifact path line in output
  - ABI line (`merged` vs `fallback only`)
  - whether transaction input is expected for supported decode paths

- **Merged ABI looks too small / expected methods missing**  
  Rebuild and verify ABI:
  ```bash
  pnpm run build
  pnpm run verify-abi
  ```

- **Summary shows `unknown token`**  
  Token formatting only applies to known token addresses. Unknown tokens are shown as raw integer amounts.

- **Base RPC override not applied**  
  `BASE_RPC_URL` is only used for chain `8453`.

## Requirements

- Node.js 18+
- pnpm (or npm/yarn)

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
