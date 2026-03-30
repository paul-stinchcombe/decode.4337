# Decoder runbook

Operational guide for keeping Decode 4337 transaction decoding accurate as contract interfaces evolve.

## Scope

This runbook covers:

- Decoder architecture and decode paths
- ABI/artifact maintenance
- Troubleshooting decode failures and ambiguous output

It does **not** cover installer signing/notarization (see `NOTARIZE-MAC.md`).

## Decoder architecture (code paths)

Primary files:

- `src/decode.ts` - decode engine and path selection
- `src/artifacts.ts` - ABI merge/fallback + initCode contract-name matching
- `src/cli.ts` - CLI interface
- `src/electron-main.ts` + `src/preload.ts` + `src/index.html` - desktop app interface

High-level flow in `decodeTransaction(hash, chainId, verbose, rpcUrl?)`:

1. Fetch transaction and receipt (`getTransaction`, `getTransactionReceipt`)
2. If no calldata (`0x`), return simple transfer error
3. If target is EntryPoint v0.7.0, decode `handleOps`
4. Otherwise decode as direct transaction:
   - try `execute`
   - try `executeBatch`
   - fallback to generic direct-call decode
5. Return decoded calls + optional summary + optional gas metadata

## Decode paths and expected output

## 1) EntryPoint `handleOps` (ERC-4337)

For each UserOperation:

- decode nested `execute` / `executeBatch`
- decode inner call using merged ABI (fallback ABI if needed)
- include call blocks in result (`function`, `target`, `args`)

Summary output is populated when a transfer-like call is recognized:

- `transfer(to, amount)`
- `transferFrom(from, to, amount)`

Summary fields:

- `amount` (formatted token amount if token is known)
- `from`
- `beneficiary` (EntryPoint beneficiary)

## 2) Direct transactions (non-EntryPoint)

Direct call behavior:

- If outer call is `execute` / `executeBatch`, decode inner calls first
- If not, decode `tx.input` directly against merged ABI
- Unknown calls are returned as `0x<selector>... (unknown)` rather than hard-failing

## 3) Verbose metadata

Verbose output can include:

- `Artifacts dir: ...`
- `ABI: merged (...)` or `ABI: fallback only (...)`
- `Gas used: ... | Gas price: ... Gwei`

Use this metadata to diagnose ABI coverage and RPC/receipt behavior.

## ABI and artifact maintenance

## Artifact source of truth

Artifacts are loaded recursively from `artifacts/**/*.json` (excluding `*.dbg.json`).

Each artifact can contribute:

- function ABI items (`abi`)
- selector mapping (`methodIdentifiers`) for exact signature-to-selector alignment
- bytecode/runtime bytecode used for deploy/initCode contract-name matching

## Merge behavior

`getMergedAbi()` starts with fallback ABI and adds artifact functions by selector.

Fallback ABI always includes:

- `execute`
- `executeBatch`
- ERC-20 `transfer`, `transferFrom`, `approve`
- `deploy(bytes)`
- `mintFor(...)`

## Updating ABI coverage

When contract interfaces change:

1. Add/update artifact JSON files under `artifacts/`
2. Rebuild:
   ```bash
   pnpm run build
   ```
3. Verify merged ABI:
   ```bash
   pnpm run verify-abi
   ```

`verify-abi` currently expects at least 100 functions and checks required names (for example `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`).

If verification fails, check:

- artifact file validity (JSON parseable)
- expected function signatures present in `abi`
- artifact files are included in build output (`dist/artifacts`)

## Troubleshooting

## "Could not decode transaction."

Likely causes:

- wrong chain selected (tx hash exists on a different network)
- calldata selector missing from merged/fallback ABI
- unsupported wrapper pattern around inner call

Actions:

1. Re-run with verbose (`pnpm start -v -c <chain> <hash>`)
2. Confirm chain ID matches explorer/network
3. Confirm artifact set includes contract ABI for target
4. Rebuild and run `pnpm run verify-abi`

## "This is a simple ETH transfer with no data."

The tx has no calldata (`input === 0x`). This is expected for plain native transfers.

## Output shows `0x12345678... (unknown)`

The call was detected but selector did not match merged/fallback ABI.

Actions:

- add/update artifact JSON for the target contract
- rerun build + verify-abi
- rerun decode with verbose and confirm ABI source switches to merged coverage

## Verbose shows `ABI: fallback only`

Artifact merge did not contribute additional selectors (or artifacts were not discovered).

Check:

- `Artifacts dir` path in verbose output
- that JSON artifacts are present at that path
- that build copied artifacts into `dist/artifacts` for packaged/runtime execution

## RPC and chain pitfalls

- `BASE_RPC_URL` override is used only when decoding Base (`chainId=8453`) from CLI
- Other chains use default chain RPC definitions
- Unknown chain IDs are accepted and routed through a generic thirdweb endpoint

If decode reliability is poor for a chain, verify RPC health and chain selection first.

## Quick operational commands

```bash
# Decode with verbose diagnostics
pnpm start -v -c 8453 <tx_hash>

# Rebuild runtime artifacts and decoder
pnpm run build

# Validate merged ABI health
pnpm run verify-abi
```

