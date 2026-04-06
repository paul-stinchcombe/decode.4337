# Decode 4337

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Decode 4337 is a transaction decoder for Account Abstraction and direct contract calls, shipped as both a CLI and an Electron desktop app.

The decoder is optimized for KAMI-related call patterns while still handling generic contract inputs when ABI data is available.

## Decode coverage

The decoder currently supports the following transaction paths:

1. **ERC-4337 EntryPoint v0.7 `handleOps`**
   - Parses UserOperations.
   - Decodes nested SimpleAccount `execute` and `executeBatch` calls.
2. **Direct SimpleAccount-style calls**
   - Direct `execute(dest,value,func)` transactions.
   - Direct `executeBatch(dest[],value[],func[])` transactions.
3. **Generic direct contract calls**
   - Decodes `tx.input` against merged ABI data (artifacts + fallback ABI).

If a transaction has no calldata (`0x`), the tool returns: `This is a simple ETH transfer with no data.`

## What the output includes

- **Decoded Calls** (`function`, `target`, decoded `args`) when calldata can be decoded.
- **Summary** (`amount`, `from`, `beneficiary`) when a `transfer`/`transferFrom` shape is detected.
- **Gas metadata** when available:
  - `Gas used`
  - `Gas price` (Gwei)

### Verbose mode

Verbose mode (`-v`) includes operational context:

- Resolved artifacts directory (`Artifacts dir: ...`)
- ABI source used:
  - `ABI: merged (...)` when artifacts were merged in
  - `ABI: fallback only (...)` when decode relied on fallback ABI
- Step-by-step decode lines for EntryPoint/UserOp/inner call handling

## Supported chains

Built-in chain definitions:

- **Mainnets:** Ethereum (1), Base (8453), Arbitrum (42161), Optimism (10), Polygon (137), Soneium (1868)
- **Testnets:** Sepolia (11155111), Base Sepolia (84532), Arbitrum Sepolia (421614), Soneium Minato (1946)

You can also pass any positive chain ID. Unknown chain IDs use a generic chain config with `https://<chainId>.rpc.thirdweb.com`.

## Installation

```bash
git clone https://github.com/paulstinchcombe/decode-4337.git
cd decode-4337
pnpm install
```

## Usage

### CLI

```bash
# Decode on Base by default
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Verbose output
pnpm start -v <hash>

# Chain ID (decimal or hex)
pnpm start -c 8453 <hash>
pnpm start -c 0x2105 <hash>
```

### Desktop app

```bash
pnpm run app
```

Paste a transaction hash, select a chain, optionally enable verbose output, then click **Decode**.

## ABI and artifacts behavior

Decode quality depends on ABI coverage:

- The decoder always has a fallback ABI set (execute/executeBatch, ERC-20 transfer patterns, deploy(bytes), KAMI mintFor).
- It then merges in contract ABIs from `artifacts/**/*.json` and deduplicates by function selector.

For operational steps and troubleshooting, see:

- [`docs/DECODING-RUNBOOK.md`](./docs/DECODING-RUNBOOK.md)

## Build and distribution

```bash
pnpm run build
pnpm run dist
```

Installer output is written to `release/`:

- **Mac:** `.dmg`, `.zip`
- **Windows:** NSIS installer, portable `.exe`
- **Linux:** `.AppImage`, `.deb`

Mac signing and sharing guidance:

- [`docs/NOTARIZE-MAC.md`](./docs/NOTARIZE-MAC.md)
- [`docs/SHARING-DMG.md`](./docs/SHARING-DMG.md)

## Scripts

| Script              | Description                                      |
|---------------------|--------------------------------------------------|
| `pnpm start`        | Run CLI (transaction hash argument required)     |
| `pnpm run app`      | Build and launch Electron app                    |
| `pnpm run build`    | Compile TypeScript + copy HTML/artifacts to dist |
| `pnpm run verify-abi` | Verify merged ABI contains required coverage   |
| `pnpm run dist`     | Package native installers                        |

## Requirements

- Node.js 18+
- pnpm

## Environment

Optional `.env` variable for Base RPC override:

```bash
BASE_RPC_URL=https://mainnet.base.org
```

`BASE_RPC_URL` is used only for chain ID `8453`. Other chains use viem chain defaults (or generic thirdweb RPC for unknown chain IDs).

## License

MIT © [Paul Stinchcombe](https://www.paulstinchcombe.com)
