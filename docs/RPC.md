# RPC hosts and chain IDs

`decodeTransaction` (`src/decode.ts`) loads the transaction with viem's public client. The chain id picks the host. This page lists the host each built-in id uses, and the parsing rules for the CLI `-c` value.

Hosts below are from **viem 2.46.2**, the version locked in `pnpm-lock.yaml`. `package.json` allows `viem@^2.x`, so a lockfile bump can change a chain's default URL. Base is the exception: when no RPC argument is set, `createClient` always passes `https://mainnet.base.org`.

## Which URL is requested

`createClient` chooses the argument to viem `http()`:

1. The `rpcUrl` argument when it is not `null` or `undefined`.
2. Otherwise, for chain id `8453`, `https://mainnet.base.org`.
3. Otherwise `http()` is called with no URL.

viem 2.46.2 then keeps that URL only when it is non-empty (`url || chain.rpcUrls.default.http[0]` in `clients/transports/http.ts`). An empty string falls through to the chain object's first default HTTP URL. A whitespace-only string is kept and the request fails.

| Caller | What it passes |
|--------|----------------|
| CLI (`src/cli.ts`) | `process.env.BASE_RPC_URL` when the parsed id is `8453`. Any other id passes `undefined`. |
| Desktop (`src/electron-main.ts`) | No `rpcUrl`. The table below is the full set the app can reach. |
| `decodeTransaction(...)` | Whatever the caller supplies as the fourth argument. |

The CLI calls `dotenv.config()` with no options before reading the environment (`dotenv` 16.6.1 in the lockfile). A `BASE_RPC_URL` already exported in the shell is left as-is; `.env` fills it in only when it is unset. The desktop main process does not load `.env`.

### Built-in chains

These ids are the keys of `CHAINS` in `src/decode.ts`. With no `rpcUrl`, the client uses the first default HTTP URL from that viem chain object, except Base, which is hardcoded to the same URL viem 2.46.2 already ships.

| Chain | ID | HTTP endpoint |
|-------|----|----------------|
| Ethereum | 1 | `https://eth.merkle.io` |
| Optimism | 10 | `https://mainnet.optimism.io` |
| Polygon | 137 | `https://polygon-rpc.com` |
| Soneium | 1868 | `https://rpc.soneium.org` |
| Soneium Minato | 1946 | `https://rpc.minato.soneium.org` |
| Arbitrum | 42161 | `https://arb1.arbitrum.io/rpc` |
| Arbitrum Sepolia | 421614 | `https://sepolia-rollup.arbitrum.io/rpc` |
| Base | 8453 | `https://mainnet.base.org` |
| Base Sepolia | 84532 | `https://sepolia.base.org` |
| Sepolia | 11155111 | `https://11155111.rpc.thirdweb.com` |

Any other positive id is built with `defineChain`: name `Chain <id>`, native currency Ether (18 decimals), and `https://<id>.rpc.thirdweb.com`. The CLI `-c` option accepts those ids. The desktop `<select>` only lists the ten rows above.

Sepolia's default host uses the same thirdweb URL shape as an unknown id. `BASE_RPC_URL` does not apply to Base Sepolia (`84532`) or to any id other than `8453`.

## What the chain object does not change

The decoder never calls `eth_chainId` and never prints the chain name, native symbol, or block explorer. A `BASE_RPC_URL` aimed at a different network returns whatever that endpoint has for the hash, or that endpoint's error string.

UserOp value lines in the verbose `handleOps` log are `formatEther(value)` plus the literal ` ETH`. Polygon's viem currency is POL; the log still says `ETH`. The figure is still 18-decimal wei. Direct `execute` / `executeBatch` logs do not include that value line.

## HTTP behavior

`http()` is called with no transport options. In viem 2.46.2 that means:

- JSON-RPC batching is off. Each call is its own POST.
- Timeout is 10 seconds.
- Up to 3 retries. The delay is `~~(1 << count) * 150` milliseconds, with `count` starting at 0 (150ms, then 300ms, then 600ms). An HTTP error that carries a `Retry-After` header uses that value in seconds instead.
- HTTP 403, 408, 413, 429, 500, 502, 503, and 504 are retried. So are JSON-RPC code `-1` and viem's internal and rate-limit errors. Any other numeric JSON-RPC error is returned immediately. Timeouts and connection failures (no numeric JSON-RPC code and no HTTP status) are retried.

`decodeTransaction` issues `eth_getTransactionByHash` and `eth_getTransactionReceipt` together. A receipt failure is discarded (`gasUsed` stays unset; gas price can still come from `tx.gasPrice`). A transaction fetch failure, after retries, sets `success: false` and puts the message in `error`. The CLI prints that to stderr and does not call `process.exit`, so the process status is still 0.

## Parsing `-c` / `parseChainId`

`parseChainId` trims the string, then:

- A `0x` or `0X` prefix uses `parseInt(value, 16)`.
- Anything else uses `parseInt(value, 10)`.
- `NaN` or a value `<= 0` throws `Invalid chain ID: ` plus the original string. The desktop IPC handler turns that throw into `{ success: false, error }`.

`parseInt` stops at the first character it cannot consume. The chain you get can be a prefix of what was typed:

| Input | Result |
|-------|--------|
| `8453`, `0x2105`, `0X2105` | Base (`8453`) |
| `2105` (no `0x`) | Chain `2105` → `https://2105.rpc.thirdweb.com` |
| `10abc` | Optimism (`10`) |
| `1e2` | Ethereum (`1`) |
| `0x2105xyz` | Base (`8453`) |
| `08` | Chain `8` (decimal, not octal) |
| `0x`, `0`, `0x0` | Throws `Invalid chain ID: …` |

The desktop chain control submits the decimal `value` of the selected `<option>`, so these prefix rules show up on the CLI and on direct `parseChainId` callers.

## Examples

```bash
# Base, public host https://mainnet.base.org
pnpm start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Base through a different endpoint (CLI only; this shell variable wins over .env)
export BASE_RPC_URL="https://your-base-endpoint.example"
pnpm start -c 0x2105 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Ethereum via https://eth.merkle.io
pnpm start -c 1 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

To add a chain to the built-in table, import it from `viem/chains` into `CHAINS` and add a matching `<option>` in `src/index.html`. A new id does not read `BASE_RPC_URL` unless `src/cli.ts` is changed.
