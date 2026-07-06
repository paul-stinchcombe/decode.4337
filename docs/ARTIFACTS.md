# KAMI artifacts and ABI decoding

Decode 4337 uses the checked-in `artifacts/` tree to recognize KAMI contract
calls beyond the small built-in fallback ABI. This guide documents how the
runtime loader works and how to verify artifact updates.

## Runtime lookup

`src/artifacts.ts` exposes the artifact helpers used by `src/decode.ts`:

- `getArtifactsDir()` looks for artifacts beside the compiled files, inside the
  packaged Electron app, and finally under the current working directory.
- `getMergedAbi()` recursively reads `*.json` artifact files and ignores
  `*.dbg.json` debug artifacts.
- Functions are de-duplicated by selector. Built-in fallback functions are added
  first, then artifact functions fill in the rest.
- `getFallbackAbi()` remains available when artifact loading fails or a merged
  decode misses.

The fallback ABI is intentionally small. It covers:

- SimpleAccount-style `execute` and `executeBatch`
- ERC-20 `transfer`, `transferFrom`, and `approve`
- Common `deploy(bytes)` factory calls
- KAMI `mintFor(...)`, so KAMI mints still decode when artifacts are missing

## Decode paths that use artifacts

`src/decode.ts` decodes transactions in these layers:

1. Entry Point 0.7 `handleOps` transactions.
2. Nested SimpleAccount `execute` and `executeBatch` calls inside UserOperations.
3. Direct SimpleAccount `execute` and `executeBatch` transactions.
4. Generic direct contract calls when the transaction input matches the merged
   ABI.

Verbose output includes the artifact directory and ABI source, for example:

```text
Artifacts dir: /path/to/decode-4337/artifacts
ABI: merged (104 functions)
```

If a factory `deploy(bytes)` call contains creation code matching a checked-in
artifact, the UI and CLI display the function as `deploy (ContractName)`.

## Updating artifacts

The bundled artifacts come from the KAMI gasless NFT contract build output. The
checked-in `artifacts/package.json` records that source package metadata.

When refreshing artifacts:

1. Build or obtain the latest KAMI contract artifacts from the source package.
2. Replace the relevant JSON files under `artifacts/`, preserving the current
   directory shape where possible.
3. Keep normal artifact JSON files and debug JSON files together, but remember
   only non-`.dbg.json` files contribute to the merged ABI.
4. Run the build and ABI verifier before shipping:

   ```bash
   pnpm run build
   pnpm run verify-abi
   ```

`scripts/verify-abi.js` currently requires at least 100 merged functions and the
function names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`.
If that check fails, the app may still run with fallback ABI coverage, but KAMI
contract-specific decode quality is degraded.

## Packaging constraints

`pnpm run build` compiles TypeScript and copies `artifacts/**/*.json` into
`dist/`. `electron-builder` also includes both `dist/**/*` and `artifacts/**/*`
in packaged apps. Keep both paths working: the CLI commonly runs from `dist/`,
while packaged Electron builds may resolve artifacts through the app path.
