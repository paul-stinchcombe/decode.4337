# Verbose output contract

The CLI `-v` / `--verbose` flag and the desktop **Show verbose output** checkbox both call `decodeTransaction` (`src/decode.ts`) with `verbose: true`. The string that comes back is `DecodeResult.verboseOutput`.

The CLI prints that string as plain text. The desktop colors each line in `formatVerboseHtml` (`src/index.html`). The color rules are prefix tests against the exact strings the decoder logs. Changing a log line without updating the matcher drops or shifts the color.

## Who prints what

| Surface | File | Behavior |
|---------|------|----------|
| CLI | `src/cli.ts` | `console.log(result.verboseOutput)` with no chalk. Chalk applies to the later **Decoded Calls** and **Summary** blocks, and to errors. |
| Desktop | `src/index.html` | `formatVerboseHtml` splits on `\n`, HTML-escapes each line, wraps it in `<span class="v-line …">`, and joins with `<br>`. |

`verboseOutput` is set only when `verbose` is true. With the flag off the field is left unset.

A failed decode (`success: false`) has no `verboseOutput`. The CLI prints the `error` string in red. The desktop writes it into `#output` with the `error` class. The verbose checkbox does not change that.

## How the string is assembled

Every successful verbose path wraps the body in the same two helpers:

1. `withVerboseHeader` adds the artifact header.
2. `prependGasLine` adds gas when a receipt or a transaction gas price is available.

A full string looks like this:

```text
Gas used: <decimal> | Gas price: <gwei> Gwei
Artifacts dir: <path from getArtifactsDir()>
ABI: merged (<n> functions)
<body for this decode path>
```

### Gas line

`prependGasLine` builds the first line from:

- `Gas used: ` plus `receipt.gasUsed` (decimal), when `getTransactionReceipt` returned a receipt
- `Gas price: ` plus `formatUnits(price, 9)` plus ` Gwei`

The price is `receipt.effectiveGasPrice` when the receipt has one, otherwise `tx.gasPrice`. The two halves are joined with ` | ` when both exist. Either half can appear alone. When both are missing, the helper adds nothing.

A receipt lookup that throws is ignored (`.catch(() => null)` on `getTransactionReceipt`). A pending transaction can still show a gas price from `tx.gasPrice` and omit gas used.

With verbose off, the desktop builds the same wording itself from `result.gasUsed` and `result.gasPriceGwei` and gives it class `v-gas` directly. That path does not call `formatVerboseHtml`. The CLI prints no gas line unless `-v` is set, because gas lives inside `verboseOutput`.

### Artifact header

`withVerboseHeader` always starts the remaining text with:

```text
Artifacts dir: <path>
```

`getArtifactsDir()` (`src/artifacts.ts`) returns the first path that exists, in this order: `__dirname/artifacts`, `__dirname/../artifacts`, the Electron app path plus `dist/artifacts`, the Electron app path plus `artifacts`, then `process.cwd()/artifacts`. If none of those directories exist, the header still prints `process.cwd()/artifacts`.

The next line is present only when the path passed an `abiUsed` value:

| `abiUsed.source` | Exact line |
|------------------|------------|
| `merged` | `ABI: merged (<n> functions)` |
| `fallback` | `ABI: fallback only (<n> functions)` |

`<n>` is how many ABI entries have `type: "function"` in the ABI that decoded the call. It is the size of that ABI, not the number of calls in the transaction.

`handleOps` sets `abiUsed` from the first inner call that decodes. If every inner call misses, the `ABI:` line is absent and the artifacts directory line remains.

A direct `execute` whose inner calldata misses both ABIs still prints an `ABI:` line. The source is `fallback` when the merged function count is 7 or fewer (the built-in fallback ABI: `execute`, `executeBatch`, `transfer`, `transferFrom`, `approve`, `deploy`, `mintFor`) and `merged` when artifacts added more functions. That line records which ABI table was loaded. The inner call itself stayed unknown. This return value does not set `DecodeResult.abiUsed`; the label exists only inside `verboseOutput`.

## Desktop color rules

`formatVerboseHtml` tests each line in this order. The first match wins.

| Order | Test | Class | Color |
|------:|------|-------|-------|
| 1 | The line **contains** `Gas used` or `Gas price` | `v-gas` | `#fcd34d` |
| 2 | `startsWith('Artifacts dir:')` | `v-meta` | `#94a3b8` |
| 3 | `startsWith('ABI:')` | `v-abi` | `#34d399` |
| 4 | `startsWith` one of `Direct execute`, `Direct call`, `Inner:`, `Target:`, `Function:` | `v-section` | `#93c5fd` |
| 5 | `startsWith('Decode error:')` | `v-error` | `#f87171` |
| 6 | `startsWith('Args:')` | `v-label` | `#a5b4fc` |
| 7 | anything else | `v-line` | `#output` text, `#e4e4e7` |

`startsWith` is case-sensitive and does not trim. A leading space, emoji, or extra word means the line keeps the default color. The gas test is a substring search and runs first, so any later line that happens to contain `Gas used` or `Gas price` is colored as gas.

`Direct executeBatch …` matches `Direct execute` and is a section line.

## Body by decode path

### Entry Point `handleOps`

Used when `tx.to` equals `entryPoint07Address` from `viem/account-abstraction` (Entry Point 0.7) and the calldata decodes as `handleOps`. The body is:

```text
✅ Account Abstraction Transaction (Entry Point 0.7.0)
----------------------------------------
Function: handleOps
Beneficiary: <address>
User Operations: <count>
----------------------------------------

📦 UserOp #<n>
   Sender (Smart Account): <sender>
   Nonce: <decimal>
   Execute → <dest>
   Value: <ether> ETH
   Inner call: <function>(<name>=<value>, ...)
```

Each UserOp log starts with a newline, so a blank line sits between operations. `executeBatch` uses this shape instead of the `Execute →` / `Inner call:` lines:

```text
   ExecuteBatch: <count> calls
     [<j>] → <dest>, <ether> ETH
         <function>(<name>=<value>, ...)
```

Color on this body:

- `Function: handleOps` matches `Function:` and is `v-section`.
- Every other line stays `v-line`. The indented lines fail `startsWith`. `Inner call:` is a different prefix from `Inner:` (that prefix belongs to direct `execute` only).

Fields left out of this log: `initCode`, `accountGasLimits`, `preVerificationGas`, `gasFees`, `paymasterAndData`, and `signature`.

If `callData` is present and is not SimpleAccount `execute` / `executeBatch`, the log line is `Call data: ` plus the first 20 characters of that hex string plus `...`, and no call card is added.

If an `execute` inner call misses both ABIs, the line is `Inner call: ` plus the first 10 characters of `func` (`0x` and the 4-byte selector) plus `... (unknown)`.

If an `executeBatch` entry misses both ABIs, the verbose line is `tryDecodeInnerCall(func)` (merged ABI only: `name(arg, arg)` when that decode works, otherwise the same 10-character selector form). The call card on that branch is always the selector form. The card text and the verbose text are built separately.

A `handleOps` transaction still returns `success: true` when nothing inside it decoded. `calls` is then omitted. The verbose body still contains the UserOp header.

### Direct `execute`

Used when the transaction itself is SimpleAccount `execute` and the inner `func` is not empty:

```text
Direct execute to <tx.to>
Inner: <function>
Target: <dest>
Args: {
  "<name>": "<formatted value>"
}
```

`Direct execute`, `Inner:`, and `Target:` are `v-section`. Only the line that begins with `Args:` is `v-label`. `JSON.stringify(args, null, 2)` puts the rest of the object on later lines, and those lines stay the default color.

When the inner calldata misses both ABIs:

```text
Direct execute to <tx.to>
Inner call: <0x + 4-byte selector>... (unknown)
Decode error: <message from the fallback decode>
```

`Inner call:` stays the default color. `Decode error:` is `v-error`. The decode-error line is included only when the fallback attempt produced an error string.

An `execute` whose `func` is empty or `0x` skips this body. Decoding continues with the generic direct-call path, so the verbose text is `Direct call to …` / `Function: execute` / `Args:` for the outer `dest`, `value`, and `func`.

The ETH `value` attached to `execute` appears in the `handleOps` log (`Value: … ETH`). It is absent from this direct-`execute` body.

### Direct `executeBatch`

When at least one inner `func` is non-empty:

```text
Direct executeBatch to <tx.to>
<function> → <target>
```

The first line is `v-section` because it starts with `Direct execute`. Each `<function> → <target>` line is the default color. Per-call ETH amounts are on the `handleOps` batch lines (`[<j>] → <dest>, <ether> ETH`) and are absent here.

If every inner `func` is empty, this body is skipped and the generic path runs on the outer calldata.

### Generic direct call

Any other `tx.to` with calldata that matches the merged or fallback ABI:

```text
Direct call to <tx.to>
Function: <function>
Args: { ... }
```

`Direct call` and `Function:` are `v-section`. `Args:` follows the same pretty-printed JSON rule as direct `execute`.

## Where `deploy (ContractName)` appears

`displayFunctionForCall` rewrites a decoded `deploy` to `deploy (<artifact name>)` when `getContractNameFromInitCode` recognizes the init code. The name is the parent directory of the matching artifact JSON, with `.sol` removed (for example `KAMI721C`). The call card (`calls[].function`) uses that rewrite. Verbose text uses it on only two paths.

| Path | Verbose function text | Call card |
|------|----------------------|-----------|
| `handleOps` → `execute` | `Inner call: deploy(<args>)` | `deploy (Name)` |
| `handleOps` → `executeBatch` | indented `deploy(<args>)` | `deploy (Name)` |
| Direct `execute` | `Inner: deploy (Name)` | `deploy (Name)` |
| Direct `executeBatch` | `deploy (Name) → <target>` | `deploy (Name)` |
| Generic direct `deploy` | `Function: deploy` | `deploy (Name)` |

Read the call card for the contract label. The `handleOps` inner-call line and the generic `Function:` line keep the raw ABI name `deploy`.

## Argument formatting

Values are passed through `formatArg` before they are logged:

- `bigint` becomes a decimal string.
- A `0x` string longer than 74 characters becomes the first 12 characters, `...`, the last 4 characters, and ` (<byte length> bytes)`. Byte length is `(length - 2) / 2`. A 42-character address stays whole.
- Nested arrays and objects in the `handleOps` `name=value` form are flattened in place.

Direct-path `Args:` then JSON-encodes those already-string values, so they show up quoted. `handleOps` inner lines use `name=value` pairs joined by `, ` and do not JSON-encode them.

## Changing a log line

Update `formatVerboseHtml` in the same change when the new text should keep a color.

- Leave `Artifacts dir:` and `ABI:` at the start of the line.
- `Inner:` (direct `execute`) and `Inner call:` (UserOp, and unknown direct inner calldata) are different prefixes. Only `Inner:` is `v-section`.
- Leave `Function:`, `Args:`, `Target:`, and `Decode error:` at column 0 when they should stay colored. Indent or a leading emoji sends them to `v-line`.
- Keep the substrings `Gas used` and `Gas price` on the gas line. The gas test is unanchored and runs before the prefix tests.

After a decoder change, decode the same hash with `-v` in the CLI and with **Show verbose output** in the desktop app. The CLI is the raw string. The desktop shows which prefixes still match.
