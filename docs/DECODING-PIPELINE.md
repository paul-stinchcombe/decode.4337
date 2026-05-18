# Decoding pipeline and ABI artifacts

This document describes how Decode 4337 turns a transaction hash into decoded
calls, summaries, and verbose diagnostics. It is the source of truth for
developers extending decoder coverage.

## Runtime entry points

- CLI: `src/cli.ts`
  - Parses `--chain` as decimal or hex with `parseChainId`.
  - Loads `.env` with `dotenv`.
  - Passes `BASE_RPC_URL` only when decoding Base (`8453`).
- Desktop app: `src/electron-main.ts` and `src/index.html`
  - Sends the transaction hash, selected chain ID, and verbose flag over the
    `decode` IPC handler.
  - Does not currently pass `BASE_RPC_URL`; it uses the default RPC selection
    in `decodeTransaction`.
- Shared decoder: `src/decode.ts`
  - Public function: `decodeTransaction(hash, chainId, verbose, rpcUrl?)`.
  - Returns `success`, optional decoded `calls`, optional transfer `summary`,
    optional gas fields, and optional `verboseOutput`.

## Chain and RPC selection

`src/decode.ts` has a fixed chain map for:

- Mainnets: Ethereum (`1`), Base (`8453`), Arbitrum (`42161`), Optimism (`10`),
  Polygon (`137`), Soneium (`1868`)
- Testnets: Sepolia (`11155111`), Base Sepolia (`84532`), Arbitrum Sepolia
  (`421614`), Soneium Minato (`1946`)

For unknown chain IDs, the decoder builds a viem `defineChain` fallback using:

```text
https://{chainId}.rpc.thirdweb.com
```

If no explicit RPC URL is provided, Base defaults to:

```text
https://mainnet.base.org
```

Other known chains use viem's chain defaults.

## Decode paths

The decoder chooses a path based on `tx.to` and `tx.input`.

### 1. Entry Point 0.7 `handleOps`

When `tx.to` matches viem's `entryPoint07Address`, the decoder uses viem's
`entryPoint07Abi` and handles only the `handleOps` function.

For each UserOperation:

1. Decode `op.callData` as SimpleAccount-style `execute` or `executeBatch`.
2. Decode each inner `func` payload with the merged ABI.
3. Fall back to the built-in fallback ABI if the merged ABI cannot decode it.
4. Add one call summary per decoded inner call.

Verbose output includes:

- Account Abstraction / Entry Point 0.7.0 header
- Beneficiary
- UserOperation count
- Sender and nonce per UserOperation
- Inner target/value/call data details
- Artifacts directory and ABI source line

### 2. Direct `execute`

For transactions not sent to Entry Point 0.7, the decoder first tries to parse
`tx.input` as SimpleAccount-style `execute(dest, value, func)`.

If parsing succeeds, it decodes `func` as the inner call and returns a single
decoded call with `target = dest`.

### 3. Direct `executeBatch`

The direct batch path parses `executeBatch(dest[], value[], func[])`, decodes
each non-empty `func`, and returns one call per decoded payload.

The transfer summary, if available, uses the first decoded transfer-like call in
the batch.

### 4. Generic direct calls

If the transaction is not `execute` or `executeBatch`, the decoder attempts to
decode `tx.input` directly against `tx.to` using the merged ABI and then the
fallback ABI.

This is how direct KAMI contract transactions are decoded.

## Transfer summaries

The human-readable `summary` is intentionally narrow. It is only produced when
the decoded function is:

- `transfer(to, amount)`
- `transferFrom(from, to, amount)`

Known token formatting is hard-coded in `KNOWN_TOKENS`:

| Token address | Symbol | Decimals |
| --- | --- | --- |
| `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | USDC | 6 |
| `0x4200000000000000000000000000000000000006` | WETH | 18 |

Unknown token addresses render as the raw bigint plus `(unknown token)`.

For Entry Point transactions, `summary.beneficiary` is the `handleOps`
beneficiary. For direct transactions, the current implementation uses `tx.from`
as the beneficiary field.

## ABI sources

ABI handling lives in `src/artifacts.ts`.

### Built-in fallback ABI

The fallback ABI is always available and includes:

- SimpleAccount `execute`
- SimpleAccount `executeBatch`
- ERC-20 `transfer`
- ERC-20 `transferFrom`
- ERC-20 `approve`
- Common `deploy(bytes initCode)`
- KAMI `mintFor`

This fallback lets common transactions decode even when artifact loading fails.

### Artifact discovery

`getArtifactsDir()` checks these locations in order and returns the first
existing directory:

1. `__dirname/artifacts`
2. `__dirname/../artifacts`
3. Electron `app.getAppPath()/dist/artifacts`
4. Electron `app.getAppPath()/artifacts`
5. `process.cwd()/artifacts`

The build script copies `artifacts/**/*.json` into `dist/`:

```bash
pnpm run build
```

### Merge rules

`getMergedAbi()`:

1. Seeds the merged ABI with the fallback ABI.
2. Recursively reads `*.json` files under the artifacts directory.
3. Skips `*.dbg.json`.
4. Adds only ABI items with `type: "function"` and a name.
5. Deduplicates functions by 4-byte selector.
6. Prefers artifact `methodIdentifiers` when present, then computes selectors
   from the ABI signature.

The merged ABI is cached only when artifact loading adds more functions than the
fallback ABI. If the decoder only finds fallback functions, later decodes can
retry artifact loading.

## Contract names for deploy calls

When a decoded function is `deploy(bytes initCode)`, the decoder tries to label
it as `deploy (ContractName)`.

`getContractNameFromInitCode()` compares the init code with creation and runtime
bytecode prefixes loaded from artifact JSON files:

- 256 hex characters for a full prefix.
- 64 hex characters for a short prefix.
- Known offsets: `0`, `40`, `104`, and `168` hex characters.
- Substring search in the first `16384` hex characters when offset matching does
  not identify the contract.

This covers raw creation code, factory-prefixed creation code, and ABI-encoded
creation bytes.

## Extending decoder coverage

Use this workflow when adding or updating contract coverage:

1. Add the contract artifact JSON under `artifacts/`.
   - Include the ABI.
   - Include `methodIdentifiers` when available, especially for tuple-heavy
     functions.
   - Include `bytecode.object` and/or `deployedBytecode.object` if deploy
     labeling should work.
2. Do not add `*.dbg.json` expecting it to affect decoding; debug artifacts are
   intentionally ignored.
3. Build the project so artifacts are copied into `dist/`:

   ```bash
   pnpm run build
   ```

4. Verify the merged ABI:

   ```bash
   pnpm run verify-abi
   ```

`scripts/verify-abi.js` currently requires:

- At least 100 function ABI entries after merging.
- Functions named `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Verbose output says `ABI: fallback only` | Run `pnpm run build` and `pnpm run verify-abi`; confirm `dist/artifacts.js` and copied artifact JSON files exist. |
| A known KAMI function is unknown | Confirm the artifact JSON has the ABI entry and `methodIdentifiers` for the exact signature. |
| `deploy` does not show a contract name | Confirm the artifact has `bytecode.object` or `deployedBytecode.object` and that the init code contains a matching prefix. |
| Base CLI requests use the wrong RPC | Set `BASE_RPC_URL` in `.env`; this applies to the CLI Base path only. |
| Desktop app ignores `BASE_RPC_URL` | Expected with the current IPC path; `electron-main.ts` does not pass a custom RPC URL into `decodeTransaction`. |
| Decoder returns `This is a simple ETH transfer with no data.` | The transaction has no call data, so there is no function payload to decode. |
| Decoder returns `Could not decode transaction.` | The transaction did not match Entry Point `handleOps`, direct `execute`, direct `executeBatch`, or any function in the merged/fallback ABI. |
