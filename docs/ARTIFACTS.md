# Artifact and ABI maintenance

The decoder uses the checked-in KAMI contract artifacts to turn raw calldata into
function names and typed arguments. Keep this runbook aligned with
`src/artifacts.ts`, `src/decode.ts`, `scripts/verify-abi.js`, and the
`artifacts/` directory.

## What the artifacts power

`src/decode.ts` asks `src/artifacts.ts` for a merged ABI whenever it needs to
decode nested or direct calls. The merged ABI supports:

- Entry Point 0.7 `handleOps` transactions that wrap SimpleAccount
  `execute` or `executeBatch` calls.
- Direct SimpleAccount `execute` and `executeBatch` transactions.
- Generic direct contract calls when the target calldata matches an artifact
  function selector.
- Displaying `deploy (ContractName)` when deployment init code matches known
  artifact bytecode.

Token transfer summaries are produced only for decoded `transfer` and
`transferFrom` calls. Other decoded functions still appear in the decoded calls
list, but may not produce an amount/from/beneficiary summary.

## Loader behavior

`getArtifactsDir()` checks several locations so the same code works from the CLI,
`dist/`, and packaged Electron builds:

1. `dist/artifacts` when running compiled code.
2. `artifacts` next to the repository root or packaged app.
3. Electron app paths for `dist/artifacts` and `artifacts`.
4. The current working directory's `artifacts` folder as a final fallback.

Only non-debug JSON files are merged; files ending in `.dbg.json` are ignored.
Each ABI function is de-duplicated by selector. When an artifact has
`methodIdentifiers`, those selectors are preferred over recomputing selectors
from ABI inputs.

If no artifacts are available, the decoder falls back to a small built-in ABI:

- SimpleAccount `execute` and `executeBatch`
- ERC-20 `transfer`, `transferFrom`, and `approve`
- common `deploy(bytes)`
- KAMI `mintFor`

Verbose output includes the artifact directory and whether the decode used the
merged ABI or fallback ABI.

## Updating artifacts

1. Replace or add the relevant contract JSON under `artifacts/`.
   - Keep production artifact JSON files, because those are what the loader
     reads.
   - `.dbg.json` files can be checked in for provenance, but they are not used
     by the decoder.
2. Run the build so artifacts are copied into `dist/`:

   ```bash
   pnpm run build
   ```

3. Verify ABI coverage:

   ```bash
   pnpm run verify-abi
   ```

   The verification script loads `dist/artifacts.js`, builds the merged ABI, and
   requires at least 100 functions plus these names: `setPrice`, `mintFor`,
   `setTokenURI`, `deploy`, and `execute`.

4. For packaging changes, run `pnpm run dist` after the build. The Electron
   package includes both `dist/**/*` and `artifacts/**/*`.

## Troubleshooting

### Verbose output says `ABI: fallback only`

The decoder could not find or merge the artifact set. Check that:

- `pnpm run build` has been run, so `dist/artifacts/**.json` exists.
- The app was launched from a directory where `artifacts/` is present, or the
  packaged app includes `artifacts/**/*`.
- Artifact files are valid JSON and contain ABI function entries.

### `pnpm run verify-abi` says `dist/artifacts.js` is missing

Run `pnpm run build` first. The verification script intentionally reads the
compiled loader so it validates the same artifact discovery path used by the
CLI and desktop app.

### A known function still appears as an unknown selector

Confirm the artifact includes the function ABI and, for tuple-heavy signatures,
that the artifact's `methodIdentifiers` contains the exact signature selector.
The loader can compute selectors, but `methodIdentifiers` are the source of
truth when present.

### `deploy` does not show the contract name

Contract-name detection compares the deployment init code against artifact
creation and runtime bytecode prefixes. It may not match if the transaction uses
different compiler output, linked bytecode, or init-code wrapping that does not
include a recognizable prefix in the searched range.
