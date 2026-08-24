# Embedding the decoder

`decodeTransaction` is the shared decode engine used by the CLI and the Electron app. Use it from Node when you need structured results (calls, summary, gas) rather than printed CLI text.

This guide is for in-repo scripts and tools. The package is an Electron app: `package.json` `main` is `dist/electron-main.js`, not the decoder.

## Public API

Exported from `src/decode.ts` (compiled to `dist/decode.js`):

| Export | Role |
|--------|------|
| `decodeTransaction(hash, chainId, verbose, rpcUrl?)` | Fetch a tx, decode it, return `DecodeResult` |
| `parseChainId(value)` | Parse a decimal or `0x…` chain ID string |

Lower-level ABI helpers live in `src/artifacts.ts` (`getMergedAbi`, `getFallbackAbi`, `getArtifactsDir`, `getContractNameFromInitCode`). Most embedders only need `decodeTransaction`.

### Import paths

Build first (`pnpm run build`) so `dist/decode.js` exists. CommonJS:

```js
const { decodeTransaction, parseChainId } = require('./dist/decode');
```

TypeScript in this repo (same as `src/cli.ts`):

```ts
import { decodeTransaction, parseChainId } from './src/decode';
```

Do **not** `require('decode-kami-4337')`. That loads the Electron main process.

### `decodeTransaction` arguments

| Arg | Type | Notes |
|-----|------|--------|
| `hash` | `` `0x${string}` `` | Transaction hash |
| `chainId` | `number` | Use `parseChainId()` for CLI-style strings |
| `verbose` | `boolean` | When `true`, fills `verboseOutput`. Calls, summary, and gas are returned either way. |
| `rpcUrl` | `string` (optional) | Passed to viem `http()`. See [RPC](#rpc-and-chains). |

`parseChainId` accepts `"8453"` or `"0x2105"`. Values that are `NaN` or `<= 0` throw `Invalid chain ID: …`.

## Result shape

```ts
interface DecodeResult {
  success: boolean;
  calls?: Array<{
    function: string;           // e.g. "transferFrom", "deploy (KAMI721C)", "0x1234abcd... (unknown)"
    target: string;             // contract address
    args: Record<string, string>;
  }>;
  summary?: { amount: string; from: string; beneficiary: string };
  verboseOutput?: string;       // only when verbose === true
  abiUsed?: { source: 'merged' | 'fallback'; functionCount: number };
  gasUsed?: string;             // receipt gas used (decimal string)
  gasPriceGwei?: string;        // effective gas price, or tx.gasPrice
  error?: string;               // when success === false
}
```

The function **does not throw** for decode or RPC failures. Check `success` and `error`.

### When fields are present

- **`calls`**: at least one inner or direct call was extracted. Unknown selectors still appear as `0x… (unknown)` with empty `args`.
- **`summary`**: only the first `transfer` / `transferFrom` in the decoded calls. Amount uses the hardcoded Base USDC/WETH table; other tokens render as `<raw> (unknown token)`.
- **`beneficiary`**: Entry Point `handleOps` beneficiary when the tx is a UserOp bundle. For a *direct* SimpleAccount `execute`/`executeBatch`, it is `tx.from` (the EOA), not a bundler.
- **`abiUsed`**: set when at least one call decoded against merged or fallback ABI.
- **`gasUsed` / `gasPriceGwei`**: from the receipt when available; gas price falls back to `tx.gasPrice`. The CLI prints these only in verbose mode; the structured result always includes them.
- **`verboseOutput`**: artifacts directory, ABI line, gas line, and path-specific logs. Absent when `verbose` is `false`.

## Decode routing

Verified against `src/decode.ts`:

1. Empty `tx.input` → `{ success: false, error: "This is a simple ETH transfer with no data." }`
2. `tx.to` is Entry Point 0.7.0 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) and the method is `handleOps` → unwrap UserOps, then SimpleAccount `execute` / `executeBatch`, then inner calldata.
3. Direct `execute` / `executeBatch` on `tx.input` (no Entry Point) → inner calls.
4. Generic direct call: decode `tx.input` with the merged artifact ABI, then fallback ABI.
5. Otherwise → `{ success: false, error: "Could not decode transaction." }`

Inner calldata is decoded with KAMI artifacts plus a fallback ABI (SimpleAccount `execute`/`executeBatch`, ERC-20 `transfer`/`transferFrom`/`approve`, `deploy(bytes)`, `mintFor`). See `src/artifacts.ts`.

## RPC and chains

Built-in chain IDs: `1`, `8453`, `42161`, `10`, `137`, `1868`, `11155111`, `84532`, `421614`, `1946`.

If `rpcUrl` is omitted:

- Base (`8453`) uses `https://mainnet.base.org`
- Other **known** chains use viem’s default RPC for that chain
- **Unknown** chain IDs use `https://<id>.rpc.thirdweb.com`

The CLI only forwards `BASE_RPC_URL` when the chain is Base. The desktop app never passes `rpcUrl`. Embedders can pass any URL for any chain.

## Example

```js
const { decodeTransaction, parseChainId } = require('./dist/decode');

async function main() {
  const hash = '0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc';
  const chainId = parseChainId('8453');
  const result = await decodeTransaction(hash, chainId, false, process.env.BASE_RPC_URL);

  if (!result.success) {
    process.exitCode = 1;
    console.error(result.error);
    return;
  }

  for (const call of result.calls ?? []) {
    console.log(call.function, '→', call.target, call.args);
  }
  if (result.summary) {
    console.log(result.summary.amount, 'from', result.summary.from);
  }
}

main();
```

Known-good Base sample (Entry Point `handleOps` → `transferFrom`):

- Function: `transferFrom`
- Amount: `0.02475 USDC`
- `abiUsed`: `{ source: "merged", functionCount: 104 }`
- `gasUsed`: `128978`

Run after `pnpm run build`. Working directory should be the repo root so artifact discovery finds `./artifacts`.

## CLI as a subprocess

Prefer `decodeTransaction` when you need a reliable exit code or gas fields. The CLI (`pnpm start`, or `node dist/cli.js` after build) is a thin wrapper:

```bash
pnpm start -v -c 8453 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

`package.json` `bin` maps `decode-4337` → `./dist/cli.js` (no shebang in the compiled file; use `node dist/cli.js` unless the package is linked via npm/pnpm).

Constraints:

- Decode failures print to stderr and **exit 0**. There is no `process.exit` in `src/cli.ts`.
- Success with no `calls` and no `summary` prints nothing unless `-v` is set.
- `BASE_RPC_URL` applies only to chain `8453`.

## Pitfalls

- **Wrong import**: requiring the package name loads Electron, not the decoder. Require `./dist/decode`.
- **Artifacts not found**: `getArtifactsDir()` searches `__dirname/artifacts`, `__dirname/../artifacts`, Electron app paths, then `process.cwd()/artifacts`. Run from the repo root or copy artifacts next to the compiled file. Fallback-only ABI still decodes ERC-20 / `execute` / `deploy` / `mintFor`.
- **Custom tokens**: only Base USDC (`0x833589…2913`) and WETH (`0x4200…0006`) get symbol/decimals in `summary.amount`.
- **Batch UserOps**: `summary` is the first transfer only; inspect `calls` for the rest.
- **Unknown selector**: a call still appears, but `function` is a truncated selector and `args` is `{}`. Pass `verbose: true` and check `abiUsed` / `verboseOutput` (`Decode error: …` on the direct-execute path).
