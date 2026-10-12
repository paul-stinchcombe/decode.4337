# Summary fields

The **Summary** block is a single highlight on top of the decoded call list. It is filled only for an inner ERC-20 `transfer` or `transferFrom`. Everything else can still return `success: true` and a `calls` array with no `summary`.

CLI and desktop render the same three fields (`src/cli.ts`, `src/index.html`):

| Field | Meaning |
|-------|---------|
| **Amount** | Formatted token amount, or a raw integer plus `(unknown token)` |
| **From** | Who the token move is attributed to (see below) |
| **Beneficiary** | Who is recorded as paid for the transaction (see below) |

`calls[].args.amount` stays the raw integer. **Amount** is the only formatted copy.

## When `summary` is set

A candidate is an inner call where all of the following are true:

- The function name is exactly `transfer` or `transferFrom` (not `mintFor`, `approve`, `deploy`, or `deploy (ContractName)`).
- `args.to` and `args.amount` are both present. The decoder reads those ABI input names (`src/decode.ts`).

The decoder only looks for candidates **inside** SimpleAccount `execute` / `executeBatch`:

| Outer shape | How the candidate is chosen |
|-------------|-----------------------------|
| Entry Point 0.7 `handleOps` → UserOp `execute` | That inner call **replaces** `summary` |
| Entry Point 0.7 `handleOps` → UserOp `executeBatch` | Sets `summary` only when it is still unset, walking batch entries in order |
| Direct `execute` (calldata is `execute`, not sent as `handleOps`) | The one inner call, when it is a candidate |
| Direct `executeBatch` | First candidate in the batch |
| Generic direct call (`tx.input` decoded as itself) | Never sets `summary` |

UserOps are walked in `handleOps` order. Because `execute` always replaces and `executeBatch` only fills an empty summary, a later UserOp `execute` overwrites a summary that an earlier UserOp already set. A later `executeBatch` does not.

A plain token `transfer` sent to the token contract (no `execute` wrapper) still appears under **Decoded Calls**. It does not produce Amount / From / Beneficiary.

An `execute` whose inner `func` is empty or `0x` has no candidate. Native ETH value is logged in verbose `handleOps` output and is not turned into `summary`.

## What each field uses

Verified in `decodeTransaction` (`src/decode.ts`).

**Amount.** The execute target (`dest`) is treated as the token. The address is lowercased and looked up in `KNOWN_TOKENS`:

| Token (Base) | Address | Decimals |
|--------------|---------|----------|
| USDC | `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` | 6 |
| WETH | `0x4200000000000000000000000000000000000006` | 18 |

Known tokens go through `formatUnits` (`0.02475 USDC`). Any other target, including USDC on other chains, is the raw integer plus ` (unknown token)` with no decimal shift. The lookup does not read a token address out of the arguments. A router `dest` will not format as USDC even if the calldata moves USDC.

**From.**

| Inner function | `handleOps` | Direct `execute` / `executeBatch` |
|----------------|-------------|-----------------------------------|
| `transferFrom` | `args.from` | `args.from` |
| `transfer` | UserOp `sender` (the smart account) | `tx.from` (empty string if the tx has no `from`) |

On a `transferFrom`, **From** is the token argument, which can differ from the smart account that submitted the UserOp.

**Beneficiary.**

| Path | Value |
|------|--------|
| `handleOps` | The `beneficiary` argument of `handleOps` — the address paid for the bundle |
| Direct `execute` / `executeBatch` | `tx.from`, the account that submitted the transaction |

The token recipient stays in `calls[].args.to`. The desktop and CLI label is always **Beneficiary**, including on the direct path where the value is `tx.from`.

## Example (Base `handleOps`)

```bash
pnpm start -v 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

One UserOp, `execute` → USDC `transferFrom`. Decoded on Base (`8453`) against `https://mainnet.base.org`:

| | Address or value | Why |
|--|------------------|-----|
| Call target | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | USDC, so raw `24750` formats as `0.02475 USDC` |
| **From** | `0xA7a246b6d1474AFa6Cd2acAd9547313620587281` | `transferFrom` `from` argument |
| Token `to` | `0x5aaEFAd7e30E262aFf4588f1996c4F921c6fcECF` | `calls[].args.to` only |
| UserOp sender | `0x674C857c508E873Bfa512B9b9b7D5DA1969015B5` | Smart account for this UserOp. **From** is the `transferFrom` argument |
| **Beneficiary** | `0xD827760EbB0Ec8f12bCB769D8ffFf138D1f21834` | `handleOps` beneficiary |

## If the block is missing

| What you see | Cause |
|--------------|--------|
| Calls listed, no Summary | The decoded function is not `transfer` / `transferFrom`, or it is a generic direct token call with no `execute` wrapper |
| `success: true`, CLI prints nothing | `handleOps` (or similar) produced neither `calls` nor `summary`. Pass `-v` for the UserOp log |
| Desktop says `No summary available.` | Same empty result, and there is no gas line and no verbose text to show |
| Amount is `24750 (unknown token)` | `dest` is not Base USDC or Base WETH. `calls[].args.amount` is that same raw integer |

The CLI prints the Summary section only when `result.summary` is set. Failures go to stderr and the process still exits 0.
