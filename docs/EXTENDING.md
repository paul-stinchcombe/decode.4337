# Extending decoder coverage

How to teach Decode 4337 about a new chain, token symbol, contract function, or `deploy (ContractName)` label.

The CLI (`src/cli.ts`) and desktop app (`src/electron-main.ts`) both call `decodeTransaction` in `src/decode.ts`. Change the shared decoder once; keep the desktop UI in sync when the change is user-visible.

After any of the edits below:

```bash
pnpm run build
pnpm run verify-abi
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

`verify-abi` requires `dist/artifacts.js` (build first). It currently asserts ≥100 merged functions and the names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`. On this tree that is **104** functions. The Base sample should show `ABI: merged (104 functions)` and a `transferFrom` of `0.02475 USDC`.

---

## Add a supported chain

Built-in IDs live in `CHAINS` in `src/decode.ts` (viem chain objects):

| Network | ID |
|---------|----|
| Ethereum | 1 |
| Optimism | 10 |
| Polygon | 137 |
| Base | 8453 |
| Soneium | 1868 |
| Arbitrum | 42161 |
| Soneium Minato | 1946 |
| Arbitrum Sepolia | 421614 |
| Base Sepolia | 84532 |
| Sepolia | 11155111 |

**Files to touch**

1. `src/decode.ts` — import the chain from `viem/chains` and add it to `CHAINS`.
2. `src/index.html` — add an `<option>` under the matching `<optgroup>` (`value` is the decimal ID).
3. `README.md` — supported-chains list.

**RPC after you add it** (`createClient` / `getChain` in `src/decode.ts`):

| Case | RPC used when `rpcUrl` is omitted |
|------|-----------------------------------|
| Base (`8453`) | `https://mainnet.base.org` (hardcoded) |
| Other IDs in `CHAINS` | That viem chain’s default HTTP URL |
| Any other ID | `https://{chainId}.rpc.thirdweb.com` |

Constraints:

- The CLI forwards `BASE_RPC_URL` **only** for `8453`. A new chain does not get an env override unless you change `src/cli.ts`.
- Desktop never passes `rpcUrl`, so `.env` does not affect the app.
- CLI `-c <id>` already accepts unknown IDs (thirdweb URL). The desktop `<select>` has no free-form field — a chain missing from `index.html` is unreachable in the UI.

Unknown IDs still parse via `parseChainId` (`"8453"` or `"0x2105"`). Values that are `NaN` or `<= 0` throw `Invalid chain ID: …`.

---

## Add a known token (summary amount)

`formatTokenAmount` in `src/decode.ts` only pretty-prints addresses in `KNOWN_TOKENS`. Keys must be **lowercase**.

Current table:

| Address | Symbol | Decimals |
|---------|--------|----------|
| `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | USDC | 6 |
| `0x4200000000000000000000000000000000000006` | WETH | 18 |

Add a row to `KNOWN_TOKENS`. The lookup key is the **token contract** (`dest` / `tx.to` of the transfer), not an argument.

`summary` is filled only for the first decoded `transfer` or `transferFrom`. Other functions (`mintFor`, `setPrice`, `approve`, …) appear under **Decoded Calls** and never get an Amount/From/Beneficiary block. Unknown tokens render as `<rawAmount> (unknown token)`.

---

## Add fallback ABI coverage

Prefer refreshing `artifacts/**/*.json` when the function already exists on a checked-in KAMI artifact. Use the fallback ABI when the selector must decode **even if artifacts are missing**.

Fallback pieces in `src/artifacts.ts` (7 functions today):

| Piece | Functions |
|-------|-----------|
| `SIMPLE_ACCOUNT_EXECUTE_ABI` | `execute`, `executeBatch` |
| `ERC20_ABI` | `transfer`, `transferFrom`, `approve` |
| `COMMON_DEPLOY_ABI` | `deploy(bytes)` (selector `0x00774360`) |
| `KAMI_MINT_ABI` | `mintFor(...)` (selector `0x1169051d`) |

`getMergedAbi()` inserts fallback items first, then walks artifact JSON (skips `*.dbg.json`), de-duplicating by selector. Artifact `methodIdentifiers` win over a computed selector when the signature matches.

The merge is cached only when the loaded function count is **greater than** the fallback count. Adding a fallback function raises that threshold automatically. If you add a name that `scripts/verify-abi.js` should guarantee, update `REQUIRED_NAMES` / `MIN_FUNCTION_COUNT` there too.

---

## Refresh artifacts and `deploy (ContractName)` labels

Checked-in layout (Hardhat-style):

```
artifacts/
  KAMI721C.sol/KAMI721C.json
  KAMI1155C.sol/KAMI1155C.json
  libraries/KamiTransfer.sol/KamiTransfer.json
  … (KamiRoyalty, KamiRental, KamiPlatform, KamiNFTCore, IExists)
```

`artifacts/package.json` records the upstream package (`@paulstinchcombe/gasless-nft-tx`). Replace JSON in place, keep `*.dbg.json` next to the real artifacts (the loader ignores debug files). Then `pnpm run build && pnpm run verify-abi`.

`pnpm run build` copies `artifacts/**/*.json` into `dist/`. Packaged apps also ship `artifacts/**/*` (`package.json` → `build.files`). `getArtifactsDir()` probes `__dirname/artifacts`, `__dirname/../artifacts`, Electron `app.getAppPath()` variants, then `process.cwd()/artifacts`.

### How deploy labels are chosen

When a decoded function is `deploy`, `getContractNameFromInitCode` (`src/artifacts.ts`) may rewrite the display name to `deploy (KAMI721C)` (see `displayFunctionForCall` in `src/decode.ts`).

Matching, in order:

1. Strip `0x`. Need at least 64 hex chars (32 bytes) or the function returns `undefined`.
2. Load prefixes from each artifact’s `bytecode.object` (creation) and `deployedBytecode.object` (runtime). Empty `0x` bytecode is skipped — `IExists.json` contributes ABI only.
3. Try an **exact 256-hex-char (128-byte) prefix** at offsets `0`, `40` (after a 20-byte factory), `104`, and `168` (factory + ABI-encoded bytes).
4. Else search for a **64-hex-char (32-byte) prefix** in the first **16384 hex chars (8 KB)** of the raw initCode and of each offset slice.

The label is the parent directory name with `.sol` stripped (`artifacts/KAMI721C.sol/KAMI721C.json` → `KAMI721C`). Two JSON files in the same folder share that name. Signatures are cached for the process lifetime; restart the CLI/app after replacing artifacts.

---

## Desktop UI constraints

- **Chain list** must match `CHAINS`. The renderer cannot enter a custom ID.
- **Window height** is clamped to 520–1000 px at width 560 (`resize-window` in `src/electron-main.ts`). Long verbose output scrolls.
- **`#app-loading` / `#app-main`:** `src/index.html` defines CSS and a boot script for these IDs, but the markup is not present. The script calls `classList` on `null` (TypeError in DevTools). The form is still visible because it is not wrapped in `#app-main` (that rule starts at `opacity: 0`). If you add a splash screen, wrap the form in `#app-main` **and** add `#app-loading`, or the UI will stay invisible.

---

## Checklist

- [ ] Chain: `CHAINS` + `index.html` `<option>` + README
- [ ] Token: lowercase address in `KNOWN_TOKENS` (summary only)
- [ ] New always-on selector: fallback ABI in `src/artifacts.ts`
- [ ] New KAMI functions: refresh `artifacts/`, not a one-off ABI in `decode.ts`
- [ ] `pnpm run build && pnpm run verify-abi`
- [ ] Smoke-decode the Base sample (`ABI: merged`, not `fallback only`)
