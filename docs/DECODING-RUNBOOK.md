# Decoding runbook (ABI + artifacts)

This runbook explains how decoding works in this repository and how to troubleshoot low-quality decode output.

Use it when:

- Decoded calls show `... (unknown)`.
- Verbose output shows `ABI: fallback only`.
- Deploy calls are decoded as `deploy` without a contract name.

## Decoder architecture

### 1) Transaction decode paths (`src/decode.ts`)

`decodeTransaction()` attempts these paths in order:

1. **EntryPoint v0.7 `handleOps`**  
   Decodes UserOperations and nested `execute` / `executeBatch` inner calls.
2. **Direct `execute` / `executeBatch`**  
   Handles non-EntryPoint direct smart-account calls.
3. **Generic direct contract decode**  
   Decodes `tx.input` using merged ABI.

If `tx.input` is empty (`0x`), the transaction is treated as a plain ETH transfer with no calldata decode.

### 2) ABI resolution (`src/artifacts.ts`)

The decoder builds ABI coverage from two sources:

- **Fallback ABI** (always present):
  - `execute`
  - `executeBatch`
  - ERC-20 `transfer`, `transferFrom`, `approve`
  - `deploy(bytes)`
  - `mintFor(...)`
- **Merged artifact ABI** from `artifacts/**/*.json` (excluding `*.dbg.json`).

Function entries are deduplicated by selector, preferring exact selectors from `methodIdentifiers` when available.

### 3) Contract name inference for deploy calls

`getContractNameFromInitCode()` tries to match init code against known artifact bytecode signatures.
When matched, deploy calls are shown as `deploy (ContractName)`.

## Keeping decode quality current

### Update workflow

1. **Refresh contract artifacts** in the repository `artifacts/` directory.
2. **Build** runtime files:
   ```bash
   pnpm run build
   ```
3. **Verify ABI coverage**:
   ```bash
   pnpm run verify-abi
   ```

`verify-abi` currently checks:

- Merged ABI function count is at least 100.
- Required functions are present (`setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`).

If this check fails, treat decode output as degraded until artifacts are fixed.

## Troubleshooting

### Symptom: `... (unknown)` for many calls

Checks:

1. Run:
   ```bash
   pnpm run build
   pnpm run verify-abi
   ```
2. Confirm artifacts exist and are valid JSON under `artifacts/`.
3. Re-run decode with `-v` and inspect:
   - `Artifacts dir: ...`
   - `ABI: merged (...)` or `ABI: fallback only (...)`

### Symptom: `ABI: fallback only (...)` in verbose output

Likely causes:

- Artifacts were not found in the resolved artifacts directory.
- Artifacts are present but missing/invalid ABI definitions.
- Build output is stale relative to source artifacts.

Resolution:

1. Confirm `artifacts/` is populated.
2. Re-run `pnpm run build`.
3. Re-run `pnpm run verify-abi`.

### Symptom: Deploy call missing contract name

If output shows just `deploy`, init code matching failed.

Checks:

- Artifact bytecode for the expected contract exists in `artifacts`.
- Artifact file includes `bytecode.object` and/or `deployedBytecode.object`.
- Init code shape may differ from known offsets; refresh artifacts from the deployment toolchain.

### Symptom: Amount shown as `(unknown token)`

Token symbol formatting uses a small known-token map in `src/decode.ts`.
Unknown token contracts still decode, but amount is shown as raw integer plus `(unknown token)`.

## Operational tips

- Use verbose mode (`pnpm start -v ...`) during incident/debug sessions.
- Keep artifacts updated in the same change that introduces new contract call patterns.
- Include a quick `verify-abi` result in PR notes when artifact updates are part of a release.
