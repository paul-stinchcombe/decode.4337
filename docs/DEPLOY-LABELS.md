# Deploy call labels

A decoded `deploy` call can show up as `deploy (KAMI721C)`. The parenthetical name comes from bytecode matching. `decodeWithAbi` in `src/decode.ts` passes the raw `initCode` bytes to `getContractNameFromInitCode` (`src/artifacts.ts`). `displayFunctionForCall` then rewrites the call’s function name when that lookup returns a name.

Printed arguments are a separate step. `formatArg` shortens a `0x` string longer than 74 characters, but the lookup already ran on the full decoded hex. A card can show `deploy (KAMI721C)` next to a truncated `initCode`.

## Where the name is shown

| Path | Call card (`calls[].function`) | Verbose line |
|------|--------------------------------|--------------|
| `handleOps` → `execute` | `deploy (Name)` | `Inner call: deploy(…)` keeps the ABI name |
| `handleOps` → `executeBatch` | `deploy (Name)` | Indented `deploy(…)` keeps the ABI name |
| Direct `execute` | `deploy (Name)` | `Inner: deploy (Name)` |
| Direct `executeBatch` | `deploy (Name)` | `deploy (Name) → <target>` |
| Generic direct `deploy` | `deploy (Name)` | `Function: deploy` |

Read the call card for the contract name. The `handleOps` inner line and the generic `Function:` line stay `deploy`.

The fallback ABI names the argument `initCode` (`deploy(bytes)`, selector `0x00774360`). The checked-in KAMI artifacts do not define `deploy`; the fallback entry is what makes the call decodable.

## Which files register a signature

`loadBytecodeSignatures` walks `artifacts/` with `fs.readdirSync` and does not sort. It skips `*.dbg.json`. On this tree the walk order is:

1. `KAMI1155C.sol/KAMI1155C.json`
2. `KAMI721C.sol/KAMI721C.json`
3. `libraries/KamiNFTCore.sol/IExists.json`
4. `libraries/KamiNFTCore.sol/KamiNFTCore.json`
5. `libraries/KamiPlatform.sol/KamiPlatform.json`
6. `libraries/KamiRental.sol/KamiRental.json`
7. `libraries/KamiRoyalty.sol/KamiRoyalty.json`
8. `libraries/KamiTransfer.sol/KamiTransfer.json`
9. `artifacts/package.json`

The label is the parent directory name with a trailing `.sol` removed. `libraries/KamiPlatform.sol/KamiPlatform.json` becomes `KamiPlatform`. `IExists.json` and `KamiNFTCore.json` share the directory `KamiNFTCore.sol`, so both would be labeled `KamiNFTCore` if both had bytecode.

A file contributes one signature per bytecode blob that passes the length gate:

| File | Creation hex length | Runtime hex length | Signatures registered |
|------|---------------------|--------------------|------------------------|
| `KAMI1155C.sol/KAMI1155C.json` | 69274 | 62688 | creation (256) and runtime (256) |
| `KAMI721C.sol/KAMI721C.json` | 53120 | 46080 | creation (256) and runtime (256) |
| `libraries/KamiNFTCore.sol/IExists.json` | 0 | 0 | none |
| `libraries/KamiNFTCore.sol/KamiNFTCore.json` | 600 | 538 | creation (256) and runtime (256) |
| `libraries/KamiPlatform.sol/KamiPlatform.json` | 170 | 114 | runtime only; `prefixHex` is 64 chars |
| `libraries/KamiRental.sol/KamiRental.json` | 170 | 114 | runtime only; `prefixHex` is 64 chars |
| `libraries/KamiRoyalty.sol/KamiRoyalty.json` | 170 | 114 | runtime only; `prefixHex` is 64 chars |
| `libraries/KamiTransfer.sol/KamiTransfer.json` | 170 | 114 | runtime only; `prefixHex` is 64 chars |
| `artifacts/package.json` | — | — | none (no bytecode fields) |

Gates in `src/artifacts.ts`:

- Creation bytecode (`bytecode.object`) is kept only when its hex length, without `0x`, is at least **256** (`BYTECODE_SIGNATURE_LEN`).
- Runtime bytecode (`deployedBytecode.object`) is kept when its hex length is at least **64** (`BYTECODE_SHORT_PREFIX_LEN`).
- When runtime hex is shorter than 256, the stored `prefixHex` is that 64-character prefix. The exact stage still uses `startsWith(prefixHex)`.

That yields **10** signatures, in walk order, creation before runtime for each file: KAMI1155C (creation, runtime), KAMI721C (creation, runtime), KamiNFTCore (creation, runtime), then the four library runtimes.

The list is stored in `cachedBytecodeSignatures` on first use, including when the list is empty. A later decode in the same process does not re-read disk. Restart the CLI or the Electron app after replacing artifacts.

## Match order

`getContractNameFromInitCode` strips `0x` and returns no name when fewer than 64 hex characters remain.

1. **Exact stage.** Offsets `0`, `40`, `104`, and `168` are hex-character offsets (raw creation code, after a 20-byte factory address, and two factory-plus-ABI layouts). For each offset, if that slice is at least 256 hex characters, the function returns the first signature whose `prefixHex` is a prefix of the slice. A 64-character library `prefixHex` qualifies. The first matching offset wins, and within an offset the first signature in the list wins.
2. **Substring on the raw initCode.** The first signature whose 64-character `shortPrefixHex` occurs in the first **16384** hex characters (`SEARCH_RANGE_HEX`, 8192 bytes). The comment on `getContractNameFromInitCode` says “first 1KB”; the constant is 16384 hex characters.
3. **Substring on each offset slice**, with the same 16384-hex cap, if the raw window missed.

The first hit is the label.

## Checked-in bytecode

These results come from applying the rules above to the JSON in this repo. They are not chain calls.

| initCode | Label | Why |
|----------|-------|-----|
| `KAMI721C` creation bytecode | `KAMI721C` | Exact match on the creation prefix |
| That bytecode after a 20-byte, 52-byte, or 84-byte prefix (offsets 40, 104, 168) | `KAMI721C` | Exact match on the shifted slice |
| First 255 hex characters of that creation code | `KAMI721C` | Substring stage; the exact stage requires a 256-hex slice |
| First 256 hex characters of that creation code | `KAMI721C` | Exact match |
| `KAMI1155C` creation bytecode | `KAMI1155C` | Exact match on the creation prefix |
| `KamiNFTCore` creation bytecode (600 hex characters) | `KamiNFTCore` | Exact match |
| `KamiPlatform` creation bytecode (170 hex characters) | `KamiPlatform` | Substring match. The creation blob is under 256 hex characters, so it is not registered. It contains the runtime’s 64-character prefix |
| 464 hex characters that only start with `KamiPlatform`’s runtime prefix `5f80fdfea264697066735822122099ecc23510c422f1db884d240e720e1796ff` | `KamiPlatform` | Exact stage. The KAMI prefixes are 256 characters and do not match that start; the library `prefixHex` is the 64-character sequence |

The four library runtime prefixes share the Solidity metadata head `5f80fdfea2646970667358221220` and then a different IPFS hash, so each prefix matches only its own library. The checked-in `KAMI721C` and `KAMI1155C` creation and runtime bytecode leave those full 64-character prefixes unmatched, and those contracts keep their own labels.

## ABI merge vs labels

`IExists.json` defines `exists(uint256)`. `KamiNFTCore.json` defines `OWNER_ROLE()`, `PLATFORM_ROLE()`, and `RENTER_ROLE()`. The same `methodIdentifiers` are already on `KAMI1155C`, which this walk visits first, so the merged ABI keeps those earlier entries. `KamiPlatform`, `KamiRental`, `KamiRoyalty`, and `KamiTransfer` have empty `abi` arrays and still register deploy labels.

`pnpm run verify-abi` checks merged function names and a minimum count. Bytecode signatures stay unchecked. A verbose `ABI: merged (N functions)` line counts the function table. The 10 signatures above are separate.
