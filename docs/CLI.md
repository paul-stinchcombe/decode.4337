# CLI output and exit status

`src/cli.ts` is a thin wrapper around `decodeTransaction`. It prints text and then returns. It does not call `process.exit`. A decode that fails still ends in status 0. Only Commander’s own usage checks end in status 1.

`package.json` `start` is `ts-node src/cli.ts`. The compiled file is `dist/cli.js` (`bin` name `decode-4337`). Neither file has a shebang. Run it with `node dist/cli.js` after `pnpm run build`, or with `pnpm exec ts-node src/cli.ts`. Both print the same help title, `Usage: cli`.

## What reaches the program

Checked with pnpm 10.33.4.

| Command | argv the CLI sees | Status |
|---------|-------------------|--------|
| `pnpm start -c 0 0xabc` | `-c`, `0`, `0xabc` | 0 (invalid chain, below) |
| `pnpm start -v -c 0 0xabc` | `-v`, `-c`, `0`, `0xabc` | 0 |
| `pnpm --silent start <hash>` | the hash only | 0 on a successful decode; stdout is only the CLI text |
| `pnpm start -- -c 0 0xabc` | `--`, then `-c` … | 0, and the hash is the string `-c` |
| `pnpm start -- --help` | `--`, then `--help` | 0, and the hash is the string `--help` |
| `pnpm start --silent` | `--silent` is a CLI argument | 1, unknown option |

pnpm forwards `-c` and `-v` without an extra `--`. A `--` before those flags is forwarded as well. Commander treats `--` as the end of options, so the next token is the hash and `-c` never changes the chain. The default chain is then Base.

`pnpm start` (no `--silent`) writes a two-line script banner to **stdout** before the CLI runs:

```text
> decode-kami-4337@1.0.1 start <cwd>
> ts-node src/cli.ts …
```

`pnpm --silent start` omits that banner. `pnpm exec ts-node src/cli.ts` and `node dist/cli.js` do not print it either. Pipe those when the caller is parsing stdout.

On status 1, pnpm also writes an `ELIFECYCLE Command failed with exit code 1` line to stdout. A decode failure is status 0, so that line is absent.

## Options

Commander 11.1.0. Help (`-h`, `--help`) and version (`-V`, `--version`) go to stdout and exit 0. Version text is the literal `1.0.1` from `.version()` in `src/cli.ts`, not a read of `package.json`.

```text
Usage: cli [options] <hash>

Decode Base Network Transactions
```

The subtitle is fixed. It is not a chain check. The chain option is still free-form.

| Flag | Meaning |
|------|---------|
| `<hash>` | Required positional. Passed through with no format check. |
| `-v`, `--verbose` | One boolean. There is no second verbosity level. |
| `-c`, `--chain <id>` | String passed to `parseChainId`. Default `"8453"`. |

Options may follow the hash (`0xabc -c 0` still sets the chain). A repeated `-c` keeps the last value. A second positional word is ignored: `cli 0xaaa 0xbbb` fetches `0xaaa` only.

`--color`, `--no-color`, and `--silent` are not options. Commander rejects them before any RPC call.

Usage errors go to stderr with no emoji and exit 1:

| argv | stderr |
|------|--------|
| no hash | `error: missing required argument 'hash'` |
| `-c` with no value | `error: option '-c, --chain <id>' argument missing` |
| `--nope` | `error: unknown option '--nope'` |

## Status 0 errors

`parseChainId` throws for `NaN` or a value `<= 0`. The action’s `catch` prints that error and returns. These all exit 0: `0`, `0x0`, `-1`, `foo`.

Anything else is `decodeTransaction`. `success: false` is printed the same way and also exits 0. The CLI does not inspect the hash. These requests were sent as typed:

| argv | Where it was sent | stderr message (viem 2.46.2) |
|------|-------------------|------------------------------|
| `-c 1 0x1` | `https://eth.merkle.io` | `Invalid transaction hash format` |
| `0xabc` (default chain) | `https://mainnet.base.org` | `Invalid params` |
| 64 zero hex chars | Base | `Transaction with hash "0x000…0" could not be found.` |

The printed message is the thrown `Error.message` unchanged, including viem’s URL and request body when it adds them. The chain id is trimmed by `parseChainId` (`"  8453  "` is Base).

`dotenv.config()` runs at startup with no options. For chain `8453` only, the CLI passes `process.env.BASE_RPC_URL` through. Every other id passes `undefined`. The desktop app is a different process and is not covered here.

## How an error line is painted

Both the `catch` path and `success: false` use:

```ts
console.error(chalk.red('\n❌ Error:'), message);
```

`chalk` 4.1.2 colors from **stdout** support (`supports-color` 7.2.0), and the text is then written to stderr. The message is a second argument, so it is not inside `chalk.red`.

Captured with stdout not a TTY:

| Environment | stderr bytes |
|-------------|----------------|
| `FORCE_COLOR` unset | `\n❌ Error: Invalid chain ID: 0\n` |
| `FORCE_COLOR=0` | same, no ANSI |
| `FORCE_COLOR=1` | red label only: `❌ Error:` then a space, then the plain message |

`FORCE_COLOR=1` together with `NO_COLOR` still colors the label. Node prints a warning that `NO_COLOR` is ignored. `supports-color` 7.2.0 does not read `NO_COLOR` itself.

Section headers use `chalk.bold`. The words `Function:`, `Target:`, `Amount:`, `From:`, and `Beneficiary:` use `chalk.cyan`. The values, the dashed rules’ characters, and the argument lines are not passed through chalk. The verbose string is printed with `console.log` and no chalk.

## Success layout

Stdout only. Sections appear in this order, and a missing section is omitted:

1. `result.verboseOutput`, only when `-v` is set and the string is non-empty.
2. **Decoded Calls**, when `calls.length > 0`.
3. **Summary**, when `summary` is set.

Each header is `console.log` of a string that starts with `\n`, so a blank line precedes it. A successful decode with no calls, no summary, and no `-v` writes nothing and still exits 0.

Non-verbose stdout for the Base sample below, confirmed 2026-11-23 with `pnpm --silent start`:

```text

📋 Decoded Calls
----------------------------------------
Function: transferFrom
Target: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
  from: 0xA7a246b6d1474AFa6Cd2acAd9547313620587281
  to: 0x5aaEFAd7e30E262aFf4588f1996c4F921c6fcECF
  amount: 24750

----------------------------------------

📋 Summary
----------------------------------------
Amount: 0.02475 USDC
From: 0xA7a246b6d1474AFa6Cd2acAd9547313620587281
Beneficiary: 0xD827760EbB0Ec8f12bCB769D8ffFf138D1f21834
----------------------------------------
```

Argument lines are two spaces, the key, `: `, and the string already stored on `calls[].args`. There is no extra formatting in the CLI. After each call, including one with no args, the CLI prints a blank line, then the closing rule once after the loop.

With `-v`, that same stdout starts with `verboseOutput` and then the two sections above. The first lines from the 2026-11-23 run were:

```text
Gas used: 128978 | Gas price: 0.00416798 Gwei
Artifacts dir: /agent/repos/decode.4337/artifacts
ABI: merged (104 functions)
✅ Account Abstraction Transaction (Entry Point 0.7.0)
```

The inner-call line for this hash was:

```text
   Inner call: transferFrom(from=0xA7a246b6d1474AFa6Cd2acAd9547313620587281, to=0x5aaEFAd7e30E262aFf4588f1996c4F921c6fcECF, amount=24750)
```

The `Artifacts dir:` path is whichever directory `getArtifactsDir()` found. The rest of the UserOp block is the decoder’s verbose body, printed unchanged.

Gas, the artifact directory, and `abiUsed` are not printed again outside that string. Without `-v` the CLI drops them even though `decodeTransaction` returned `gasUsed` `128978` and `gasPriceGwei` `0.00416798`.

## Commands

```bash
# Help and version (stdout, status 0)
pnpm exec ts-node src/cli.ts --help
pnpm exec ts-node src/cli.ts --version

# Parseable stdout (no pnpm banner)
pnpm --silent start 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc

# Chain flag must not sit after a forwarded --
pnpm start -c 1 0x0e65f9293230c35cb4994fce91f44ac6360844376927e36ba2238783ba7521cc
```

A caller that needs status 1 when the hash cannot be decoded has to check stderr or call `decodeTransaction` itself. The CLI status stays 0 for that case.
