# App version and identity

Decode 4337 does not have one version string. Installer names, `decode-4337 --version`, and the desktop footer are updated in different files. The JSON under `artifacts/` carries a fourth version that is the upstream KAMI package, not this app.

## What to bump for an app release

These three strings are `1.0.1` today. Nothing in the build reads `package.json` into the other two.

| Location | Field | What uses it |
|----------|--------|----------------|
| `package.json` | `"version"` | electron-builder artifact names (`productName` + this version). Also the npm package version. |
| `src/cli.ts` | `program.version('1.0.1')` | Commander `-V` / `--version`. Printed by `pnpm start -- -V` and by `node dist/cli.js -V` after `pnpm run build`. |
| `src/index.html` | `<span id="version">Version 1.0.1</span>` | Desktop footer. `pnpm run build` copies this file into `dist/` as-is (`copyfiles -f src/index.html dist`). |

`src/electron-main.ts` does not call `app.getVersion()` and does not set the window title from `package.json`.

Bump all three together. Bumping only `package.json` changes the DMG/installer name and leaves the CLI and the in-app footer on the old number.

Do not bump `artifacts/package.json` as part of an app release. See below.

## Upstream artifact package (not the app)

`artifacts/package.json` is metadata copied with the KAMI contract build:

| Field | Value in tree |
|-------|----------------|
| `name` | `@paulstinchcombe/gasless-nft-tx` |
| `version` | `0.17.6` |

`getMergedAbi()` walks every non-`.dbg.json` file under `artifacts/`, including this `package.json`. The file has no `abi` array, so it adds no functions. The loader never reads its `version`.

Change `0.17.6` only when you replace the contract JSON from a newer `@paulstinchcombe/gasless-nft-tx` build. After that, run `pnpm run build && pnpm run verify-abi` (expects at least 100 merged functions and the names `setPrice`, `mintFor`, `setTokenURI`, `deploy`, `execute`).

## Names that are not versions

| Identifier | Value | Where |
|------------|--------|--------|
| npm package name | `decode-kami-4337` | `package.json` `name` |
| CLI bin | `decode-4337` → `./dist/cli.js` | `package.json` `bin` |
| Electron product name | `Decode 4337` | `package.json` `build.productName` |
| App id | `com.decode4337.app` | `package.json` `build.appId` |
| Window title / heading | `Decode 4337` / `Decode 4337 for KAMI` | `src/index.html` `<title>` and `<h1>` |

`package.json` `repository.url` is `https://github.com/paulstinchcombe/decode-4337`. The git remote for this tree is `https://github.com/paul-stinchcombe/decode.4337`. The repository field is metadata only; clone and issue links should use the remote that actually hosts the code.

## CLI help text

`src/cli.ts` sets the Commander description to `Decode Base Network Transactions`. That string is Base-specific even though `-c` accepts any chain id (`parseChainId`, default `8453`). `--help` does not list supported chains. Chain behavior lives in `src/decode.ts` (`CHAINS`), not in the description string.

## Doc filenames that hardcode a version

- [NOTARIZE-MAC.md](./NOTARIZE-MAC.md) shows an output example `release/Decode 4337-1.0.1.dmg`.
- [SHARING-DMG.md](./SHARING-DMG.md) shows a quarantine example `~/Downloads/Decode 4337-1.0.0.dmg`.

electron-builder names files from `productName` and `version`, and often includes the arch. Use the file you actually built or downloaded; do not treat those examples as the only legal filename.

## Release check

```bash
node -p "require('./package.json').version"
# expect the same number in:
#   src/cli.ts          .version('…')
#   src/index.html      Version …
pnpm run build
node dist/cli.js -V
```

Then launch `pnpm run app` and confirm the footer matches. Installer names under `release/` should contain that same `package.json` version.
