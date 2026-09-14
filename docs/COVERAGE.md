# Decoder coverage and limitations

This page is the checklist for “will Decode 4337 unwrap this transaction?” It is verified against `src/decode.ts`, `src/artifacts.ts`, `src/cli.ts`, `src/electron-main.ts`, and `src/index.html`.

The README highlights Entry Point `handleOps` + SimpleAccount ERC-20 transfers. The shared decoder (`decodeTransaction`) also unwraps some **non-4337** calls, and it **does not** unwrap several common 4337 shapes. Empty CLI output is often a coverage miss, not an RPC failure.

## What it unwraps

`decodeTransaction` tries paths in this order and returns on the first match:

| # | Shape | What you get |
|---|--------|----------------|
| 1 | `tx.input` empty / `0x` | `{ success: false, error: "This is a simple ETH transfer with no data." }` |
| 2 | `tx.to` is Entry Point **0.7.0** and the method is **`handleOps`** | UserOps unwrapped; inner SimpleAccount `execute` / `executeBatch` decoded |
| 3 | Direct `execute` / `executeBatch` on `tx.input` (not sent to the Entry Point) | Inner calls, same ABI merge as UserOps |
| 4 | Any other `tx.to` + calldata | Single call decoded against merged artifact ABI, then fallback ABI |
| 5 | Nothing matched | `{ success: false, error: "Could not decode transaction." }` |

Canonical Entry Point 0.7 address (from `viem/account-abstraction` `entryPoint07Address`):

`0x0000000071727De22E5E9d8BAf0edAc6f37da032`

Inner calldata (UserOp or direct `execute`) is decoded with:

1. **Merged ABI** — checked-in `artifacts/**/*.json` plus fallback (currently **104** functions; `pnpm run verify-abi` requires ≥100 and names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`).
2. **Fallback ABI only** if merged decode fails — `execute`, `executeBatch`, `transfer`, `transferFrom`, `approve`, `deploy(bytes)`, `mintFor` (7 functions).

Unknown selectors still appear as `0x…… (unknown)` with empty `args` when the outer `execute` unwrap succeeded.

## Known-good sample (Base)

```bash
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

Expect: `handleOps` → `transferFrom` of `0.02475 USDC`, verbose `ABI: merged (104 functions)`, `gasUsed` `128978`.

## What it does not unwrap

These are silent or hard-fail in the current code. They are not bugs in the RPC layer.

| Input | What happens | Why |
|-------|----------------|-----|
| Entry Point **0.6** (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`), **0.8**, or **0.9** | Usually `Could not decode transaction.` | `tx.to` is compared only to the 0.7 address |
| Entry Point 0.7 **`handleAggregatedOps`** (or any EP method other than `handleOps`) | Falls through; typically `Could not decode transaction.` | After the `handleOps` check, calldata is not decoded with `entryPoint07Abi` |
| UserOp **`initCode`** (account factory / first-time deploy) | Ignored | The field is typed on the UserOp and never decoded or logged |
| UserOp **`paymasterAndData`** | Ignored | Same: present on the struct, never inspected |
| UserOp `callData` that is **not** SimpleAccount `execute(address,uint256,bytes)` / `executeBatch` | No `calls` entry; verbose logs `Call data: 0x…` | Only `SIMPLE_ACCOUNT_EXECUTE_ABI` is used to unwrap UserOp calldata |
| `execute` with **empty inner `func`** (native ETH send, or dest-only) | Verbose logs dest + ETH value; **no** decoded call and **no** summary | Inner decode runs only when `func` is non-empty |
| `summary` for `mintFor`, `deploy`, `approve`, `setPrice`, … | Calls list is filled; Amount/From/Beneficiary block is omitted | `summary` is set only for the first `transfer` / `transferFrom` |
| Token amounts other than Base USDC / WETH | Summary amount is `<raw> (unknown token)` | `KNOWN_TOKENS` has two lowercase Base addresses |
| Custom RPC on desktop, or `BASE_RPC_URL` on non-Base CLI chains | Ignored | CLI forwards `BASE_RPC_URL` only for `8453`; Electron never passes `rpcUrl` |

Batch UserOps and `executeBatch`: `summary` is still the **first** transfer only. Inspect `calls` for the rest.

Long `0x` arguments (for example `deploy` initCode) are truncated in `args` when the hex string is longer than 74 characters (`0x` + 12 prefix + `...` + 4 suffix + byte count).

## `calls` vs `summary` vs CLI silence

A decode can be `success: true` with **no** `calls` and **no** `summary` — for example a valid `handleOps` whose UserOp `callData` is not SimpleAccount `execute`.

| Surface | When there are no calls and no summary |
|---------|----------------------------------------|
| CLI (`src/cli.ts`) | Prints **nothing** unless `-v` (verbose still prints the UserOp header / truncated call data) |
| CLI failures | Message on stderr, process **exits 0** (no `process.exit`) |
| Desktop | Non-verbose: gas line when the receipt has it, then calls/summary. If that HTML is empty, the output is `No summary available.` Verbose: gas is inside `verboseOutput`, not duplicated |

The CLI prints gas only inside verbose output. The desktop prints **Gas used / Gas price** without Verbose when `gasUsed` or `gasPriceGwei` is set (`src/index.html`).

## Symptom → cause

| What you see | Likely coverage miss |
|--------------|----------------------|
| `This is a simple ETH transfer with no data.` | Plain value transfer; there is no calldata to decode |
| `Could not decode transaction.` | Wrong Entry Point version/address, non-`handleOps` EP method, or calldata that matches neither execute nor the merged ABI |
| CLI exits 0 with a blank stdout | Success with empty `calls`/`summary`, or you forgot `-v` on a path that only logs verbosely |
| `ABI: fallback only (7 functions)` | Artifacts were not found; ERC-20 / `execute` / `deploy` / `mintFor` may still work |
| `(unknown)` function + empty args | Selector not in merged or fallback ABI |
| Amount line missing on a mint/deploy | Expected: those functions never fill `summary` |
| Amount is `24750 (unknown token)` | Token is not Base USDC (`0x833589…2913`) or WETH (`0x4200…0006`) |
| Desktop RPC errors while CLI works on Base | Desktop ignores `BASE_RPC_URL` |

To extend chains, tokens, fallback selectors, or `deploy (ContractName)` labels, change the decoder as documented in the codebase (`CHAINS`, `KNOWN_TOKENS`, `src/artifacts.ts`) rather than adding a one-off decode path in the CLI or Electron main process.
