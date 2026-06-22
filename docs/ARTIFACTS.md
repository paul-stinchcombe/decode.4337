# KAMI artifact and ABI maintenance

Decode 4337 uses the vendored contract artifacts in `artifacts/` to decode KAMI contract calls. Keep this directory current whenever supported KAMI contracts or function signatures change.

## What the decoder loads

- `src/artifacts.ts` recursively loads `artifacts/**/*.json`.
- Files ending in `.dbg.json` are ignored.
- Function selectors are de-duplicated, with built-in fallback ABI entries loaded first.
- `bytecode.object` and `deployedBytecode.object` are also used to label recognized deploy calls as `deploy (ContractName)`.

The built-in fallback ABI covers only:

- SimpleAccount `execute` and `executeBatch`.
- ERC-20 `transfer`, `transferFrom`, and `approve`.
- `deploy(bytes)`.
- KAMI `mintFor`.

If a call should decode with a richer KAMI function name or arguments, the relevant compiled artifact must be present under `artifacts/`.

## Updating artifacts

1. Replace or add the compiled contract JSON files under `artifacts/`.
2. Keep the nested contract-source layout if possible, for example `artifacts/KAMI721C.sol/KAMI721C.json`.
3. Do not rely on `*.dbg.json` files for decode coverage; they are skipped by the loader.
4. Build and verify:

   ```bash
   pnpm run build
   pnpm run verify-abi
   ```

`pnpm run build` copies artifacts into `dist/artifacts/`. `pnpm run verify-abi` then loads the built decoder and checks that the merged ABI has at least 100 functions and includes required names:

- `setPrice`
- `mintFor`
- `setTokenURI`
- `deploy`
- `execute`

## Common pitfalls

- **Verifier says `dist/artifacts.js` is missing:** run `pnpm run build` first.
- **Verifier reports fewer than 100 functions:** artifact loading likely failed or artifacts were not copied into `dist/`.
- **A decoded transaction uses `ABI: fallback only`:** the app could not use vendored artifacts for that selector. Confirm the artifact includes the function ABI and that the file is not only a `.dbg.json`.
- **`artifacts/package.json` looks like another project:** it comes from the artifact source package and is not the app's package manifest. The app build is controlled by the root `package.json`.
