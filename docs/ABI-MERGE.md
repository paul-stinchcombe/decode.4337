# Merged ABI selectors

`getMergedAbi()` in `src/artifacts.ts` is the ABI `decodeToCallSummary` tries first (`src/decode.ts`). This page is how a function gets into that list, which 4-byte selector it is stored under, and which `inputs` are kept with it.

How those stored names are printed when several functions share a name is `decodeWithAbi` in `src/decode.ts` (`abi.find` by function name). Bytecode names on `deploy (ContractName)` use `loadBytecodeSignatures` in `src/artifacts.ts`, which is a separate cache.

## What is inserted first

The fallback ABI is inserted before any file is read. Each fallback selector is `keccak256` of the signature, first 4 bytes. There is no `methodIdentifiers` map for these entries.

| Selector | Signature |
|----------|-----------|
| `0xb61d27f6` | `execute(address,uint256,bytes)` |
| `0x47e1da2a` | `executeBatch(address[],uint256[],bytes[])` |
| `0xa9059cbb` | `transfer(address,uint256)` |
| `0x23b872dd` | `transferFrom(address,address,uint256)` |
| `0x095ea7b3` | `approve(address,uint256)` |
| `0x00774360` | `deploy(bytes)` |
| `0x1169051d` | `mintFor(address,uint256,string,(address,uint96)[])` |

`FALLBACK_FUNCTION_COUNT` is the length of this list (7). The process cache below compares against that count.

## Which files are walked

`findArtifactJsonFiles` walks `getArtifactsDir()` with `fs.readdirSync`. It does not sort. It skips names that end in `.dbg.json`.

On this machine the walk of both `artifacts/` and `dist/artifacts/` is:

1. `KAMI1155C.sol/KAMI1155C.json` (76 functions, 76 `methodIdentifiers`)
2. `KAMI721C.sol/KAMI721C.json` (70 functions, 70 `methodIdentifiers`)
3. `libraries/KamiNFTCore.sol/IExists.json` (1 function)
4. `libraries/KamiNFTCore.sol/KamiNFTCore.json` (3 functions)
5. `libraries/KamiPlatform.sol/KamiPlatform.json` (empty `abi`)
6. `libraries/KamiRental.sol/KamiRental.json` (empty `abi`)
7. `libraries/KamiRoyalty.sol/KamiRoyalty.json` (3 errors, empty `methodIdentifiers`)
8. `libraries/KamiTransfer.sol/KamiTransfer.json` (empty `abi`)
9. `package.json` (no `abi` field)

A `JSON.parse` or read error skips that file. The other files are still merged.

Items with `type` other than `"function"`, and functions with no `name`, are ignored. The artifact files contain 2 constructors, 24 events, 89 errors, and 150 functions. `KamiRoyalty.json` is the three errors `RoyaltiesMustSumTo10000`, `RoyaltyPercentageTooHigh`, and `TokenDoesNotExist`.

## How the selector string is built

For each artifact function the loader builds:

```text
name(expandAbiType(input0),expandAbiType(input1),...)
```

`expandAbiType` copies ordinary types (`address`, `uint256`, `bytes`, `uint256[]`, …). A type that starts with `tuple` becomes the component types joined by commas, wrapped in parentheses, plus the suffix after the first `tuple` (`tuple[]` → `(…)[]`). Components expand the same way.

The only tuple inputs in this tree are `(address,uint96)[]`. `getRentalInfo` returns a 5-field struct, and that tuple is an output, so it is not part of the selector. Outputs are copied onto the stored item and are not hashed.

If `methodIdentifiers[signature]` is non-empty, the stored selector is `0x` plus that value. Otherwise the selector is `keccak256` of the same signature string, first 4 bytes. Values in this tree have no `0x` prefix; the loader adds it. The map is an exact key lookup. A missed key is hashed. The loader does not scan the map for a nearby signature.

Checked against `viem` `keccak256` (`viem@2.46.2` in the lockfile): every artifact function whose file has `methodIdentifiers` has an exact key, and that value matches the computed hash. Examples from `KAMI1155C.json`:

| Signature | Selector |
|-----------|----------|
| `mintFor(address,uint256,uint256,string,(address,uint96)[])` | `0x844cdded` |
| `setMintRoyalties((address,uint96)[])` | `0x492ae5a3` |

The 4-argument fallback `mintFor` (`0x1169051d`) is a different selector from the 5-argument KAMI1155 function (`0x844cdded`). Both stay in the merged ABI.

## What is stored

The first item for a selector wins. A later file with that selector is dropped.

An artifact hit is stored as `name`, the winning file’s `inputs`, `outputs` (or `[]`), `stateMutability` (or `"nonpayable"`), and `type: "function"`. Every function in this tree sets `stateMutability`, so the default is unused here. Fallback items keep the objects from `FALLBACK_ABI` (they already include outputs and state mutability).

Result with the current tree: 150 artifact functions, 53 dropped, 97 added, **104** functions from `getMergedAbi()` (7 fallback + 97). `pnpm run build && pnpm run verify-abi` requires at least 100 functions and the names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute`. It does not record which file supplied a selector.

`IExists.json` and `KamiNFTCore.json` only repeat selectors already stored from `KAMI1155C` (`exists(uint256)`, `OWNER_ROLE()`, `PLATFORM_ROLE()`, `RENTER_ROLE()`), so they add no functions. The empty-ABI libraries add none either. Their bytecode can still label `deploy` calls through `getContractNameFromInitCode`.

Three KAMI721C functions lose to the fallback list: `approve(address,uint256)` `0x095ea7b3`, `transferFrom(address,address,uint256)` `0x23b872dd`, and `mintFor(address,uint256,string,(address,uint96)[])` `0x1169051d`. The stored input names for those selectors are the fallback names (`spender`/`amount`, `from`/`to`/`amount`, and `recipient`/`tokenPrice`/`uri`/`mintRoyalties`).

21 KAMI721C signatures are absent from KAMI1155C and from the fallback list, so they are stored. That includes `name()`, `symbol()`, `ownerOf(uint256)`, and `tokenURI(uint256)`. When the same function name already exists on an earlier item, `decodeWithAbi` still labels the call from the first item with that name, not from the selector that matched.

### Same selector, different input names

These five selectors exist on both NFT contracts. KAMI1155C is first in the walk above, so its `inputs` are the ones stored:

| Selector | Signature | Stored names | Dropped KAMI721C names |
|----------|-----------|--------------|------------------------|
| `0x35e4d0a9` | `endRentalWithSignature(uint256,address,uint256,bytes)` | `tokenId`, `signer`, `deadline`, `signature` | `tokenId`, `renter`, `deadline`, `signature` |
| `0x314cfd33` | `extendRentalWithSignature(uint256,uint256,uint256,address,uint256,bytes)` | `tokenId`, `additionalDuration`, `additionalPayment`, `tokenOwner`, `deadline`, `signature` | `tokenId`, `additionalDuration`, `additionalPayment`, `renter`, `deadline`, `signature` |
| `0xe985e9c5` | `isApprovedForAll(address,address)` | `account`, `operator` | `owner`, `operator` |
| `0x2a55205a` | `royaltyInfo(uint256,uint256)` | `tokenId`, `""` | `tokenId`, `price` |
| `0x55f804b3` | `setBaseURI(string)` | `baseURI` | `newBaseTokenURI` |

`readdir` order is part of this result. A directory order that visits `KAMI721C.sol` first stores the right-hand names instead.

### Blank input names

The merger copies `inputs[].name` as written, including `""`. `decodeWithAbi` fills `arg0`, `arg1`, … only when that input slot is missing (`inputs[i]` is `undefined`). An empty string is a real key.

Blank names on the stored item:

| Function | Blank slot | Where it comes from |
|----------|------------|---------------------|
| `royaltyInfo(uint256,uint256)` | second argument | KAMI1155C uses `""`. KAMI721C’s `price` is the dropped row above. |
| `tokenPrices(uint256)`, `tokenURIs(uint256)` | the only argument | Blank in both contracts. |
| `_dummyGetApproved(uint256)`, `_dummyTokenByIndex(uint256)` | the only argument | KAMI1155C only. The merger does not drop `_` names. |

A decoded `royaltyInfo` call is stored as `{ tokenId: "<id>", "": "<sale price>" }`. The CLI line for the blank key is `  : <sale price>`.

## Which directory is read

`getArtifactsDir()` returns the first path that exists:

1. `__dirname/artifacts`
2. `__dirname/../artifacts`
3. When Electron’s `app.getAppPath` is available: `<appPath>/dist/artifacts`, then `<appPath>/artifacts`
4. `process.cwd()/artifacts`

If none of those directories exist, callers still see `process.cwd()/artifacts` as the path, and the load returns the fallback ABI.

Verified from this tree:

| Entry | Directory used | Functions |
|-------|----------------|-----------|
| `pnpm start` (`ts-node` on `src/cli.ts`) | repository `artifacts/` (`src/artifacts` is absent) | 104 |
| `require('./dist/artifacts.js')` after `pnpm run build` | `dist/artifacts/` | 104 |

`pnpm run build` copies `artifacts/**/*.json` into `dist/` (`copyfiles` in `package.json`). `node dist/cli.js` and `pnpm run verify-abi` read that copy while `dist/artifacts/` exists. Edits under the repository `artifacts/` show up in `pnpm start` immediately and in the compiled CLI after the next build.

## Process cache

`getMergedAbi` reads the directory on every call.

- A load with more functions than `FALLBACK_FUNCTION_COUNT` replaces `cachedAbi` and is returned.
- A fallback-sized load leaves `cachedAbi` unchanged. If a richer ABI was cached earlier in the process, that array is returned. If nothing was cached yet, the fallback load is returned.
- `getFallbackAbi()` returns a new 7-function array and does not read the cache.

Verified by loading `dist/artifacts.js` from a directory with no `artifacts/` folder:

| Step | `getMergedAbi()` |
|------|------------------|
| First call | 7 fallback functions |
| Add a JSON file with one new function, call again | 8 functions. The earlier fallback-sized result was not cached. |
| Rename that function on disk, call again | The new name. A larger load replaces the cache. |
| Delete the directory, call again | The renamed function is still returned. |
| `getFallbackAbi()` after that | `execute`, `executeBatch`, `transfer`, `transferFrom`, `approve`, `deploy`, `mintFor` |

`loadBytecodeSignatures` (deploy labels) caches its first result even when the list is empty. That is separate from `cachedAbi`.

## Constraints

- Selector identity is the expanded signature, then `methodIdentifiers` when that exact key exists. Renaming a Solidity argument does not change the selector. It changes the stored `inputs` only when that file is the first hit.
- Blank ABI names stay blank in `calls[].args`. `argN` means the winning item has fewer inputs than the decoded values, which is a different case from `name: ""`.
- `verify-abi` checks a function count and five names. It passes when a duplicate selector was dropped, as long as some remaining item has the required name.
- After replacing JSON under `artifacts/`, run `pnpm run build` before `pnpm run verify-abi` or `node dist/cli.js`. `pnpm start` reads the repository tree directly.
