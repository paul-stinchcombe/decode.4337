# Call argument names

The CLI and the desktop app print `calls[].args` from the same object (`src/decode.ts`). The **function name** matches the 4-byte selector. The **argument names** are taken from the first ABI entry with that name, then zipped onto the decoded values in order.

Read a call card as “these values, in this order, under labels that may belong to a different overload.”

## How a call gets its labels

`decodeWithAbi` does two steps:

1. `decodeFunctionData` against the merged ABI. viem returns the function name for the matching selector and the arguments as an array.
2. `abi.find` of `type === "function"` and that **name**. Positional values are assigned to that entry’s `inputs[].name`. A value past the end of that input list is named `arg0`, `arg1`, … using the positional index (`arg4` is the fifth value).

`getMergedAbi` (`src/artifacts.ts`) builds that list in this order:

1. The built-in fallback ABI, in source order: `execute`, `executeBatch`, ERC-20 `transfer`, ERC-20 `transferFrom`, ERC-20 `approve`, `deploy(bytes)`, KAMI `mintFor(address,uint256,string,(address,uint96)[])`.
2. Function entries from `artifacts/**/*.json`, skipping `*.dbg.json`. `findArtifactJsonFiles` walks with `fs.readdirSync` and does not sort. On this tree the walk visits `KAMI1155C.sol` before `KAMI721C.sol`.

A selector that is already present is skipped, so a repeated selector keeps only the first definition. A later entry with the same name and a different selector is still stored. `find` by name returns the first entry either way.

The merged ABI is cached for the process once it contains more functions than the fallback (104 functions with the current artifacts). Later decodes in the same process keep this label order.

## Same selector: the fallback names are the only names

These KAMI721 functions share a selector with the fallback ABI, so the artifact entry is dropped.

| Selector | Kept (fallback) | Dropped (KAMI721C) | Call card |
|----------|-----------------|--------------------|-----------|
| `0x23b872dd` | `transferFrom(from, to, amount)` | `transferFrom(from, to, tokenId)` | Third value is labeled `amount` |
| `0x095ea7b3` | `approve(spender, amount)` | `approve(to, tokenId)` | Token id is labeled `amount` |

ERC-20 `transfer(to, amount)` is the only `transfer` in the merged ABI. `setApprovalForAll(operator, approved)` is the same shape on KAMI721 and KAMI1155, so those two names agree.

**Summary.** Amount / From / Beneficiary are filled only for an inner `transfer` or `transferFrom` that has `args.to` and `args.amount` (`execute` / `executeBatch`). A real ERC-20 `transferFrom` uses the fallback names, so that summary is the token amount.

An ERC-721 `transferFrom` is the same selector. Inside `execute` / `executeBatch` it also fills Summary. **Amount** is the token id, passed through `formatTokenAmount` on the execute target. KAMI NFT contracts are not Base USDC or WETH, so the line looks like `42 (unknown token)`. A direct `transferFrom` (no `execute` wrapper) still shows `amount` on the call card and does not set Summary.

`approve` never sets Summary.

## Different selectors: the first definition supplies every label

Both overloads stay in the ABI, so the function name is the one viem matched. Every overload of that name still uses the first definition’s input names.

`mintFor` is stable: the fallback 4-argument form is always inserted before artifact JSON. A KAMI1155 `mintFor(recipient, amount, tokenPrice, tokenURI, mintRoyalties)` with values recipient `0x1111…1111`, amount `7`, token price `1000`, URI `ipfs://uri` is displayed as:

| Label shown | Value shown | Value actually is |
|-------------|-------------|-------------------|
| `recipient` | `0x1111111111111111111111111111111111111111` | recipient |
| `tokenPrice` | `7` | amount |
| `uri` | `1000` | token price |
| `mintRoyalties` | `ipfs://uri` | token URI |
| `arg4` | `[{receiver: 0x2222…2222, feeNumerator: 100}]` | mint royalties |

The other overloaded names follow artifact walk order. With `KAMI1155C.sol` visited first, this tree labels them like this:

| Call | Inputs on that selector | Labels printed |
|------|-------------------------|----------------|
| KAMI721 `mint(recipient, tokenPrice, uri, mintRoyalties)` | those four | `recipient`, `amount`, `tokenPrice`, `tokenURI` |
| KAMI1155 `mint` (5 args) | `recipient`, `amount`, `tokenPrice`, `tokenURI`, `mintRoyalties` | those names |
| KAMI721 `safeTransferFrom(from, to, tokenId)` | those three | `from`, `to`, `id` |
| KAMI721 `safeTransferFrom(from, to, tokenId, data)` | those four | `from`, `to`, `id`, `value` (`data` is under `value`) |
| KAMI1155 `safeTransferFrom` | `from`, `to`, `id`, `value`, `data` | those names |
| KAMI721 `balanceOf(owner)` | `owner` | `account` |
| KAMI1155 `balanceOf(account, id)` | those two | those names |
| KAMI721 `burn(tokenId)` | `tokenId` | `tokenId` (same first name as the 1155 burn) |
| KAMI1155 `burn(tokenId, amount)` | those two | those names |
| KAMI721 `sellToken(to, tokenId, seller)` | those three | `to`, `tokenId`, `amount` (seller is under `amount`) |
| KAMI1155 `sellToken` | `to`, `tokenId`, `amount`, `seller` | those names |
| KAMI1155 `totalSupply(tokenId)` | `tokenId` | `arg0` |

`totalSupply(uint256)` stays `arg0` if the walk order flips. Both artifacts include zero-argument `totalSupply()` (`0x18160ddd`), and KAMI1155 lists that function before `totalSupply(uint256)`, so the zero-argument entry is always inserted first.

The `mint`, `safeTransferFrom`, `balanceOf`, `burn`, and `sellToken` rows follow the current enumeration (`KAMI1155C.sol`, then `KAMI721C.sol`). If `readdir` returns KAMI721 first, those labels switch to the KAMI721 input names, and a longer KAMI1155 call spills into `argN`.

Values stay in selector order. `formatArg` then stringifies them (bigint as decimal, long `0x` strings truncated above 74 characters).

## Constraints

- `pnpm run verify-abi` checks that the names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, and `execute` exist. It does not check which overload owns the printed input names.
- Summary reads `args.to`, `args.amount`, and `args.from` from the first `transfer` / `transferFrom` definition. That is the ERC-20 fallback entry unless `getMergedAbi` inserts a different definition earlier.
- Reordering files under `artifacts/` can change labels for overloaded names that are not in the fallback ABI. `mintFor`, `transfer`, `transferFrom`, and `approve` stay on the fallback definitions. `totalSupply(uint256)` stays `arg0` for the reason above.
- Matching labels to the selector that actually ran means naming args from that ABI item, in place of `abi.find` by function name.
