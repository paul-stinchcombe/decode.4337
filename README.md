# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decode ERC-4337 and direct contract transactions into readable call summaries.
The project ships both as a CLI and as an Electron desktop app.

## What gets decoded

The decoder supports three main paths:

1. **EntryPoint 0.7.0 `handleOps` transactions**
   - Unwraps UserOperations
   - Decodes nested SimpleAccount `execute` / `executeBatch` calls
2. **Direct SimpleAccount-style transactions**
   - Decodes top-level `execute` / `executeBatch` calls even outside EntryPoint
3. **Direct contract calls**
   - Attempts ABI decode against merged artifacts, then fallback ABI

When decode succeeds, output includes:

- **Decoded calls** (`function`, `target`, `args`)
- **Summary** for ERC-20 transfer / transferFrom flows:
  - Amount (symbol-aware for known tokens, e.g. USDC)
  - From
  - Beneficiary
- **Gas metadata** when receipt data is available
- **Verbose diagnostics** (`Artifacts dir`, ABI source, per-UserOp details) with `-v`

## Architecture at a glance

| Codepath | File | Purpose |
| --- | --- | --- |
| CLI entrypoint | `src/cli.ts` | Argument parsing and terminal output |
| Desktop main process | `src/electron-main.ts` | IPC bridge to decode engine |
| Decode engine | `src/decode.ts` | Transaction fetch + decode workflow |
| ABI/artifact loader | `src/artifacts.ts` | Merges artifact ABIs and fallback ABI |
| ABI verification runbook | `scripts/verify-abi.js` | Asserts merged ABI coverage after build |

## Supported chains

**Mainnets:** Base, Ethereum, Arbitrum, Optimism, Polygon, Soneium  
**Testnets:** Sepolia, Base Sepolia, Arbitrum Sepolia, Soneium Minato

You can pass custom chain IDs with `-c` (`decimal` or `0x` hex).

## Installation

```bash
git clone https://github.com/paul-stinchcombe/decode-4337.git
cd decode-4337
pnpm install
```

## Usage

### CLI

```bash
# Decode (default chain: Base 8453)
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Verbose trace output
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Chain selection
pnpm start -c 1 <hash>        # decimal
pnpm start -c 0x2105 <hash>   # hex
```

Example (non-verbose) output:

```text
📋 Decoded Calls
----------------------------------------
Function: transferFrom
Target: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  from: 0xA7a246b6d1474AFa6Cd2acAd9547313620587281
  to: 0x5aaEFAd7e30E262aFf4588f1996c4F921c6fcECF
  amount: 24750
----------------------------------------

📋 Summary
----------------------------------------
Amount: 0.02475 USDC
From: 0xA7a246b6d1474AFa6Cd2acAd9547313620587281
Beneficiary: 0xD827760EbB0Ec8f12bCB769D8ffFf138D1f21834
----------------------------------------
```

### Desktop app

```bash
pnpm run app
```

In the UI: paste a tx hash, choose a chain, optionally enable **Show verbose output**, then click **Decode**.

## Developer runbook

### Keep ABI decoding current

When contract artifacts change:

```bash
pnpm run build
pnpm run verify-abi
```

`verify-abi` confirms merged ABI health (function count and required function names) so regressions in artifact loading are caught early.

### Add support for new chains

Update both:

- `CHAINS` map in `src/decode.ts`
- Chain `<select>` options in `src/index.html` (desktop app)

### Add token symbol formatting

Update `KNOWN_TOKENS` in `src/decode.ts` (`address -> { symbol, decimals }`).
Unknown tokens are intentionally shown as raw amounts.

## Build native installers

```bash
pnpm run build
pnpm run dist
```

Outputs go to `release/`:

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer and portable `.exe`
- **Linux:** `.AppImage`, `.deb`

For signed + notarized macOS distribution, see:

- [`docs/NOTARIZE-MAC.md`](./docs/NOTARIZE-MAC.md)
- [`docs/SHARING-DMG.md`](./docs/SHARING-DMG.md)

## Environment

Optional `.env`:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

Used for Base network decode requests (`chainId=8453`) when set.

## Troubleshooting

- **`Invalid chain ID`**
  - Use a positive decimal value or `0x` hex chain ID (`-c` option).
- **`Could not decode transaction`**
  - The selector may be missing from artifacts/fallback ABI. Rebuild and run `pnpm run verify-abi`.
- **Unknown function shown as `0x.... (unknown)`**
  - ABI decode failed for that selector; confirm the contract ABI exists under `artifacts/**`.
- **Unknown token amount formatting**
  - Token is not in `KNOWN_TOKENS`; add address/decimals mapping in `src/decode.ts`.
- **Simple ETH transfer error**
  - Transactions with empty input (`0x`) intentionally return "simple ETH transfer with no data."

## Scripts

| Script | Description |
| --- | --- |
| `pnpm start` | Run CLI decoder |
| `pnpm run app` | Build and launch desktop app |
| `pnpm run build` | Compile TypeScript and copy assets |
| `pnpm run verify-abi` | Validate merged ABI coverage |
| `pnpm run dist` | Package desktop installers |

## Requirements

- Node.js 18+
- pnpm

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
